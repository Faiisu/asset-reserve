import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { PermissionKey } from "../access-control/permissions.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  hasAnyPermission,
  hasAreaPermission,
  hasGlobalPermission,
} from "../assets/asset-access.js";
import type {
  CancelReservationDto,
  ConfirmDeliveryDto,
  CreateReservationChangeRequestDto,
  CreateReservationDto,
  ReservationChangeDataDto,
  ReservationChangeRequestDecisionDto,
  ReservationItemDecisionDto,
  ReservationItemsDecisionDto,
  ReservationItemInputDto,
  ReservationListQueryDto,
  SubmitReservationDto,
} from "./reservations.dto.js";

const allocatedReservationStatuses = [
  "PARTIALLY_APPROVED",
  "APPROVED",
  "DELIVERY_CONFIRMED",
  "ACTIVE",
  "RETURN",
  "RETURN_PENDING",
  "RETURN_CONFIRMED",
  "COMPLETED",
];
const allocatedItemStatuses = ["APPROVED", "PREPARED", "CHECKED_OUT", "DELIVERED"];
const editableReservationStatuses = [
  "PENDING",
  "PENDING_APPROVAL",
  "PARTIALLY_APPROVED",
  "APPROVED",
];

const reservationInclude = {
  requester: { include: { profile: true } },
  participants: {
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
  },
  items: {
    include: {
      asset: { include: { managementArea: true, assetTemplate: true } },
      approval: { include: { approver: { include: { profile: true } } } },
    },
    orderBy: { createdAt: "asc" },
  },
  changeRequests: {
    include: {
      requester: { include: { profile: true } },
      reviewer: { include: { profile: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  returns: {
    include: {
      returner: { include: { profile: true } },
      items: {
        include: {
          reservationItem: {
            include: { asset: { include: { managementArea: true } } },
          },
        },
      },
      approval: { include: { approver: { include: { profile: true } } } },
    },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.ReservationInclude;

const reservationListInclude = {
  requester: { include: { profile: true } },
  participants: { select: { userId: true } },
  items: {
    include: { asset: { include: { managementArea: true } } },
    orderBy: { createdAt: "asc" },
  },
  changeRequests: {
    where: { status: "PENDING" },
    select: { id: true },
  },
} satisfies Prisma.ReservationInclude;

type ReservationDetailRecord = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;

type ReservationDb = Pick<
  Prisma.TransactionClient,
  "asset" | "reservationItem"
>;

type StoredChangeData = {
  eventName?: string;
  description?: string | null;
  startAt?: string;
  endAt?: string;
  items?: Array<{ assetId: string; quantity: number }>;
  participantIds?: string[];
};

type Availability = {
  assetId: string;
  totalQuantity: number;
  approvedQuantity: number;
  pendingQuantity: number;
  availableQuantity: number;
  pendingReservationCount: number;
};

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, query: ReservationListQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && to <= from) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The reservation list end time must be after its start time.",
        { to: "to must be later than from." },
      );
    }

    const updateAreaIds = this.permissionAreaIds(actor, ["reservation:update"]);
    const approveAreaIds = this.permissionAreaIds(actor, [
      "reservation:approve",
    ]);
    const rejectAreaIds = this.permissionAreaIds(actor, ["reservation:reject"]);
    const operationalAreaIds = this.permissionAreaIds(actor, [
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
    ]);
    const conditions: Prisma.ReservationWhereInput[] = [];

    if (query.view === "MINE") {
      conditions.push({
        OR: [
          { requesterId: actor.user.id },
          { participants: { some: { userId: actor.user.id } } },
        ],
      });
    } else if (query.view === "APPROVALS") {
      const approvalConditions = this.approvalListConditions(
        approveAreaIds,
        rejectAreaIds,
      );
      if (!approvalConditions.length) {
        return {
          data: [],
          pageInfo: { nextCursor: null, hasNextPage: false },
        };
      }
      conditions.push({ OR: approvalConditions });
    } else {
      const ownReservationCondition: Prisma.ReservationWhereInput = {
        OR: [
          { requesterId: actor.user.id },
          { participants: { some: { userId: actor.user.id } } },
        ],
      };

      if (operationalAreaIds === null) {
        // Global admin: can see all reservations
      } else if (operationalAreaIds.length) {
        // Area manager: can see own reservations + reservations in their managed areas
        // + other public active reservations (NOT DRAFT, NOT PENDING_APPROVAL, NOT REJECTED, NOT CANCELLED)
        conditions.push({
          OR: [
            ownReservationCondition,
            {
              items: {
                some: {
                  asset: { managementAreaId: { in: operationalAreaIds } },
                },
              },
            },
            {
              status: {
                notIn: ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"],
              },
            },
          ],
        });
      } else {
        // Regular user: can ONLY see own reservations, OR other public active reservations (NOT DRAFT, NOT PENDING_APPROVAL, NOT REJECTED, NOT CANCELLED)
        conditions.push({
          OR: [
            ownReservationCondition,
            {
              status: {
                notIn: ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"],
              },
            },
          ],
        });
      }
    }

    if (query.status) conditions.push({ status: query.status });
    if (query.areaId) {
      conditions.push({
        items: {
          some: { asset: { managementAreaId: query.areaId } },
        },
      });
    }
    if (query.search) {
      conditions.push({
        OR: [
          { eventName: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
        ],
      });
    }
    if (from) conditions.push({ endAt: { gt: from } });
    if (to) conditions.push({ startAt: { lt: to } });
    if (cursor) {
      conditions.push({
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.reservation.findMany({
      where: { AND: conditions },
      include: reservationListInclude,
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((reservation) =>
        this.toListItem(
          actor,
          reservation,
          updateAreaIds,
          approveAreaIds,
          rejectAreaIds,
        ),
      ),
      pageInfo: page.pageInfo,
    };
  }

  async create(actor: AuthenticatedActor, input: CreateReservationDto) {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    this.assertDateRange(startAt, endAt);
    const items = input.items ?? [];
    this.assertUniqueItems(items);
    const participantIds = this.normalizeParticipantIds(
      input.participantIds,
      actor.user.id,
    );
    await this.assertParticipants(participantIds);
    const assets = items.length
      ? await this.findAssets(items.map((item) => item.assetId))
      : [];
    if (assets.length) {
      for (const asset of assets) {
        this.assertArea(actor, "reservation:create", asset.managementAreaId);
      }
      await this.assertAvailability(this.prisma, items, assets, startAt, endAt);
    } else {
      this.assertAnyArea(actor, "reservation:create");
    }

    let status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" =
      input.status ?? "DRAFT";
    if (items.length === 0 && status === "PENDING_APPROVAL") {
      status = "APPROVED";
    }

    const reservationId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.assertActiveActor(tx, actor.user.id);
      await tx.reservation.create({
        data: {
          id: reservationId,
          requesterId: actor.user.id,
          eventName: input.eventName,
          description: input.description ?? null,
          startAt,
          endAt,
          status,
        },
      });
      if (items.length) {
        await tx.reservationItem.createMany({
          data: items.map((item) => ({
            id: randomUUID(),
            reservationId,
            assetId: item.assetId,
            quantity: item.quantity,
            status: "PENDING",
          })),
        });
      }
      if (participantIds.length) {
        await tx.reservationParticipant.createMany({
          data: participantIds.map((userId) => ({ reservationId, userId })),
        });
      }
    });
    return this.get(actor, reservationId);
  }

  async get(actor: AuthenticatedActor, reservationId: string) {
    const reservation = await this.findDetail(reservationId);
    this.assertCanView(actor, reservation);
    return this.toDetail(actor, reservation);
  }

  async submit(
    actor: AuthenticatedActor,
    reservationId: string,
    input: SubmitReservationDto,
  ) {
    const reservation = await this.findDetail(reservationId);
    this.assertCanManage(actor, reservation);
    if (reservation.status !== "DRAFT") {
      throw this.invalidStatus("Only draft reservations can be submitted.");
    }
    const assets = reservation.items.map((item) => item.asset);
    if (assets.length) {
      await this.assertAvailability(
        this.prisma,
        reservation.items,
        assets,
        reservation.startAt,
        reservation.endAt,
        reservation.id,
      );
    }
    const nextStatus =
      reservation.items.length === 0 ? "APPROVED" : "PENDING_APPROVAL";
    const result = await this.prisma.reservation.updateMany({
      where: {
        id: reservationId,
        status: "DRAFT",
        updatedAt: new Date(input.expectedUpdatedAt),
      },
      data: { status: nextStatus, updatedAt: new Date() },
    });
    if (!result.count) {
      throw new ApiException(
        409,
        "STALE_WRITE",
        "The reservation changed after it was loaded. Reload and try again.",
      );
    }
    return this.get(actor, reservationId);
  }

  async decideItem(
    actor: AuthenticatedActor,
    reservationId: string,
    itemId: string,
    input: ReservationItemDecisionDto,
  ) {
    return this.decideItems(actor, reservationId, {
      itemIds: [itemId],
      ...input,
    });
  }

  async decideItems(
    actor: AuthenticatedActor,
    reservationId: string,
    input: ReservationItemsDecisionDto,
  ) {
    const itemIds = [...input.itemIds].sort();
    const current = await this.prisma.reservationItem.findMany({
      where: { id: { in: itemIds }, reservationId },
      include: { asset: true, reservation: true },
      orderBy: { id: "asc" },
    });
    if (current.length !== itemIds.length) {
      throw new ApiException(
        404,
        "RESERVATION_ITEM_NOT_FOUND",
        "One or more reservation items were not found.",
      );
    }
    for (const item of current) {
      this.assertArea(
        actor,
        input.decision === "APPROVE"
          ? "reservation:approve"
          : "reservation:reject",
        item.asset.managementAreaId,
      );
    }

    await this.runSerializable(async (tx) => {
      await this.assertActiveActor(tx, actor.user.id);
      const items = await tx.reservationItem.findMany({
        where: { id: { in: itemIds }, reservationId },
        include: { asset: true, reservation: true },
        orderBy: { id: "asc" },
      });
      if (items.length !== itemIds.length) {
        throw new ApiException(
          404,
          "RESERVATION_ITEM_NOT_FOUND",
          "One or more reservation items were not found.",
        );
      }
      if (
        items.some(
          (item) =>
            item.status !== "PENDING" ||
            item.reservation.status !== "PENDING_APPROVAL",
        )
      ) {
        throw this.invalidStatus(
          "Only pending items in a pending reservation can be decided.",
        );
      }

      if (input.decision === "APPROVE") {
        const reservation = items[0]!.reservation;
        await this.lockAssets(
          tx,
          items.map((item) => item.assetId),
        );
        await this.assertAvailability(
          tx,
          items,
          items.map((item) => item.asset),
          reservation.startAt,
          reservation.endAt,
          reservationId,
        );
      }

      const decidedAt = new Date();
      const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const updated = await tx.reservationItem.updateMany({
        where: {
          id: { in: itemIds },
          reservationId,
          status: "PENDING",
        },
        data: { status, updatedAt: decidedAt },
      });
      if (updated.count !== itemIds.length) {
        throw this.invalidStatus(
          "One or more selected items were already decided. Reload and try again.",
        );
      }
      await tx.reservationItemApproval.createMany({
        data: itemIds.map((reservationItemId) => ({
          id: randomUUID(),
          reservationItemId,
          approverId: actor.user.id,
          status,
          comment: input.comment ?? null,
          decidedAt,
        })),
        skipDuplicates: true,
      });
      await tx.reservationItemApproval.updateMany({
        where: { reservationItemId: { in: itemIds } },
        data: {
          approverId: actor.user.id,
          status,
          comment: input.comment ?? null,
          decidedAt,
        },
      });
      const statuses = await tx.reservationItem.findMany({
        where: { reservationId },
        select: { status: true },
      });
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: this.reservationStatusFromItems(
            statuses.map((row) => row.status),
          ),
          updatedAt: decidedAt,
        },
      });
    });
    return this.get(actor, reservationId);
  }

  async requestChange(
    actor: AuthenticatedActor,
    reservationId: string,
    input: CreateReservationChangeRequestDto,
  ) {
    const reservation = await this.findDetail(reservationId);
    if (reservation.requesterId !== actor.user.id) {
      this.permissionDenied();
    }
    this.assertCanManage(actor, reservation);
    if (!editableReservationStatuses.includes(reservation.status)) {
      throw this.invalidStatus(
        "Changes can only be requested after submission and before activation.",
      );
    }
    const changeData = this.normalizeChangeData(input.changeData);
    if (!Object.keys(changeData).length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "At least one reservation change is required.",
        { changeData: "Provide a field to change." },
      );
    }
    const startAt = new Date(changeData.startAt ?? reservation.startAt);
    const endAt = new Date(changeData.endAt ?? reservation.endAt);
    this.assertDateRange(startAt, endAt);
    const items = changeData.items ?? reservation.items;
    this.assertUniqueItems(items);
    const assets = await this.findAssets(items.map((item) => item.assetId));
    for (const asset of assets) {
      const allowed =
        hasAreaPermission(
          actor,
          "reservation:update",
          asset.managementAreaId,
        ) ||
        (reservation.requesterId === actor.user.id &&
          hasAreaPermission(
            actor,
            "reservation:create",
            asset.managementAreaId,
          ));
      if (!allowed) this.permissionDenied();
    }
    if (changeData.participantIds) {
      await this.assertParticipants(
        this.normalizeParticipantIds(
          changeData.participantIds,
          reservation.requesterId,
        ),
      );
    }

    const id = randomUUID();
    try {
      await this.runSerializable(async (tx) => {
        await this.assertActiveActor(tx, actor.user.id);
        const editable = await tx.reservation.findFirst({
          where: {
            id: reservationId,
            status: { in: editableReservationStatuses },
          },
          select: { id: true },
        });
        if (!editable) {
          throw this.invalidStatus(
            "The reservation can no longer accept change requests.",
          );
        }
        const pending = await tx.reservationChangeRequest.findFirst({
          where: { reservationId, status: "PENDING" },
          select: { id: true },
        });
        if (pending) {
          throw new ApiException(
            409,
            "CHANGE_REQUEST_PENDING",
            "This reservation already has a pending change request.",
          );
        }
        await tx.reservationChangeRequest.create({
          data: {
            id,
            reservationId,
            requestedBy: actor.user.id,
            changeData: changeData as Prisma.InputJsonValue,
            reason: input.reason ?? null,
          },
        });
      });
    } catch (error) {
      if (this.prismaCode(error) === "P2002") {
        throw new ApiException(
          409,
          "CHANGE_REQUEST_PENDING",
          "This reservation already has a pending change request.",
        );
      }
      throw error;
    }
    return this.get(actor, reservationId);
  }

  async decideChangeRequest(
    actor: AuthenticatedActor,
    reservationId: string,
    changeRequestId: string,
    input: ReservationChangeRequestDecisionDto,
  ) {
    const current = await this.prisma.reservationChangeRequest.findFirst({
      where: { id: changeRequestId, reservationId },
      include: {
        reservation: { include: { items: { include: { asset: true } } } },
      },
    });
    if (!current) {
      throw new ApiException(
        404,
        "CHANGE_REQUEST_NOT_FOUND",
        "The reservation change request was not found.",
      );
    }
    const changeData = this.storedChangeData(current.changeData);
    const permission: PermissionKey =
      input.decision === "APPROVE"
        ? "reservation:approve"
        : "reservation:reject";
    if (input.decision === "APPROVE") {
      const desiredItems = changeData.items ?? current.reservation.items;
      const desiredAssets = await this.findAssets(
        desiredItems.map((item) => item.assetId),
      );
      const affectedAssets = new Map(
        [
          ...current.reservation.items.map((item) => item.asset),
          ...desiredAssets,
        ].map((asset) => [asset.id, asset] as const),
      );
      for (const asset of affectedAssets.values()) {
        this.assertArea(actor, permission, asset.managementAreaId);
      }
    } else {
      for (const item of current.reservation.items) {
        this.assertArea(actor, permission, item.asset.managementAreaId);
      }
    }

    await this.runSerializable(async (tx) => {
      await this.assertActiveActor(tx, actor.user.id);
      const request = await tx.reservationChangeRequest.findFirst({
        where: { id: changeRequestId, reservationId },
        include: {
          reservation: { include: { items: { include: { asset: true } } } },
        },
      });
      if (!request) {
        throw new ApiException(
          404,
          "CHANGE_REQUEST_NOT_FOUND",
          "The reservation change request was not found.",
        );
      }
      if (request.status !== "PENDING") {
        throw this.invalidStatus(
          "This change request has already been decided.",
        );
      }
      if (!editableReservationStatuses.includes(request.reservation.status)) {
        throw this.invalidStatus(
          "The reservation can no longer be changed through this request.",
        );
      }

      const decidedAt = new Date();
      if (input.decision === "REJECT") {
        await tx.reservationChangeRequest.update({
          where: { id: changeRequestId },
          data: {
            status: "REJECTED",
            reviewedBy: actor.user.id,
            reviewedAt: decidedAt,
          },
        });
        return;
      }

      const data = this.storedChangeData(request.changeData);
      const startAt = new Date(data.startAt ?? request.reservation.startAt);
      const endAt = new Date(data.endAt ?? request.reservation.endAt);
      this.assertDateRange(startAt, endAt);
      const requestedItems = data.items ?? request.reservation.items;
      this.assertUniqueItems(requestedItems);
      const assets = await tx.asset.findMany({
        where: { id: { in: requestedItems.map((item) => item.assetId) } },
      });
      this.assertAllAssetsFoundAndActive(requestedItems, assets);
      await this.lockAssets(
        tx,
        requestedItems.map((item) => item.assetId),
      );

      const approvedOnApply = ["APPROVED", "PARTIALLY_APPROVED"].includes(
        request.reservation.status,
      );
      const currentByAsset = new Map(
        request.reservation.items.map((item) => [item.assetId, item] as const),
      );
      const resultingItems = requestedItems.map((item) => ({
        ...item,
        status:
          currentByAsset.get(item.assetId)?.status ??
          (approvedOnApply ? "APPROVED" : "PENDING"),
      }));
      const allocatedItems = resultingItems.filter((item) =>
        allocatedItemStatuses.includes(item.status),
      );
      if (allocatedItems.length) {
        await this.assertAvailability(
          tx,
          allocatedItems,
          assets,
          startAt,
          endAt,
          reservationId,
        );
      }

      if (data.items) {
        const desiredIds = new Set(data.items.map((item) => item.assetId));
        const removedIds = request.reservation.items
          .filter((item) => !desiredIds.has(item.assetId))
          .map((item) => item.id);
        if (removedIds.length) {
          await tx.reservationItemApproval.deleteMany({
            where: { reservationItemId: { in: removedIds } },
          });
          await tx.reservationItem.deleteMany({
            where: { id: { in: removedIds } },
          });
        }
        for (const item of resultingItems) {
          const existing = currentByAsset.get(item.assetId);
          if (existing) {
            await tx.reservationItem.update({
              where: { id: existing.id },
              data: { quantity: item.quantity, updatedAt: decidedAt },
            });
            if (allocatedItemStatuses.includes(existing.status)) {
              await tx.reservationItemApproval.upsert({
                where: { reservationItemId: existing.id },
                create: {
                  id: randomUUID(),
                  reservationItemId: existing.id,
                  approverId: actor.user.id,
                  status: "APPROVED",
                  comment: "Approved reservation change",
                  decidedAt,
                },
                update: {
                  approverId: actor.user.id,
                  status: "APPROVED",
                  comment: "Approved reservation change",
                  decidedAt,
                },
              });
            }
          } else {
            const created = await tx.reservationItem.create({
              data: {
                id: randomUUID(),
                reservationId,
                assetId: item.assetId,
                quantity: item.quantity,
                status: item.status,
              },
            });
            if (item.status === "APPROVED") {
              await tx.reservationItemApproval.create({
                data: {
                  id: randomUUID(),
                  reservationItemId: created.id,
                  approverId: actor.user.id,
                  status: "APPROVED",
                  comment: "Approved reservation change",
                  decidedAt,
                },
              });
            }
          }
        }
      }

      if (data.participantIds) {
        const participantIds = this.normalizeParticipantIds(
          data.participantIds,
          request.reservation.requesterId,
        );
        await tx.reservationParticipant.deleteMany({
          where: { reservationId },
        });
        if (participantIds.length) {
          await tx.reservationParticipant.createMany({
            data: participantIds.map((userId) => ({ reservationId, userId })),
          });
        }
      }

      const statuses = await tx.reservationItem.findMany({
        where: { reservationId },
        select: { status: true },
      });
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          ...(data.eventName !== undefined
            ? { eventName: data.eventName }
            : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
          startAt,
          endAt,
          status: this.reservationStatusFromItems(
            statuses.map((row) => row.status),
          ),
          updatedAt: decidedAt,
        },
      });
      await tx.reservationChangeRequest.update({
        where: { id: changeRequestId },
        data: {
          status: "APPROVED",
          reviewedBy: actor.user.id,
          reviewedAt: decidedAt,
        },
      });
    });
    return this.get(actor, reservationId);
  }

  async confirmDelivery(
    actor: AuthenticatedActor,
    reservationId: string,
    input?: ConfirmDeliveryDto,
  ) {
    const reservation = await this.findDetail(reservationId);
    if (
      !["APPROVED", "PARTIALLY_APPROVED", "DELIVERY_CONFIRMED"].includes(
        reservation.status,
      )
    ) {
      throw this.invalidStatus(
        `Cannot confirm delivery for reservation in state "${reservation.status}". Reservation must be approved.`,
      );
    }

    const deliverableItemStatuses = ["APPROVED", "PREPARED", "CHECKED_OUT"];
    const deliverableItems = reservation.items.filter((item) =>
      deliverableItemStatuses.includes(item.status),
    );
    let targetItems = deliverableItems.filter((item) =>
      this.canConfirmDeliveryItem(actor, reservation, item),
    );

    if (input?.itemIds && input.itemIds.length > 0) {
      targetItems = reservation.items.filter((item) =>
        input.itemIds!.includes(item.id),
      );
      if (targetItems.length !== input.itemIds.length) {
        throw new ApiException(
          400,
          "INVALID_ITEM_SELECTION",
          "One or more selected items do not belong to this reservation.",
        );
      }
      const invalidStateItems = targetItems.filter(
        (item) => !deliverableItemStatuses.includes(item.status),
      );
      if (invalidStateItems.length > 0) {
        throw new ApiException(
          409,
          "INVALID_ITEM_STATUS",
          "Only approved equipment can be confirmed for delivery.",
        );
      }
      if (
        targetItems.some(
          (item) => !this.canConfirmDeliveryItem(actor, reservation, item),
        )
      ) {
        this.permissionDenied();
      }
    }

    if (targetItems.length === 0) {
      if (deliverableItems.length > 0) this.permissionDenied();
      throw new ApiException(
        400,
        "NO_ITEMS_TO_DELIVER",
        "There are no approved items waiting for delivery confirmation.",
      );
    }

    const deliveredAt = new Date();
    const itemIdsToDeliver = targetItems.map((item) => item.id);

    await this.prisma.$transaction(async (tx) => {
      // 1. Update selected items to DELIVERED
      await tx.reservationItem.updateMany({
        where: {
          id: { in: itemIdsToDeliver },
          reservationId,
        },
        data: {
          status: "DELIVERED",
          checkedOutAt: deliveredAt,
          checkedOutBy: actor.user.id,
          updatedAt: deliveredAt,
        },
      });

      // 2. Check if all approved/active items on the manifest are now DELIVERED or RETURNED
      const allItems = await tx.reservationItem.findMany({
        where: { reservationId },
        select: { id: true, status: true },
      });

      const approvedOrActiveItems = allItems.filter(
        (item) => item.status !== "REJECTED" && item.status !== "PENDING",
      );

      const allDelivered =
        approvedOrActiveItems.length > 0 &&
        approvedOrActiveItems.every(
          (item) => item.status === "DELIVERED" || item.status === "RETURNED",
        );

      if (allDelivered) {
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            status: "DELIVERY_CONFIRMED",
            updatedAt: deliveredAt,
          },
        });
      } else {
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            updatedAt: deliveredAt,
          },
        });
      }
    });

    return this.get(actor, reservationId);
  }

  async cancel(
    actor: AuthenticatedActor,
    reservationId: string,
    input?: CancelReservationDto,
  ) {
    const reservation = await this.findDetail(reservationId);
    this.assertCanManage(actor, reservation);
    const cancellableStatuses = [
      "DRAFT",
      "PENDING_APPROVAL",
      "PARTIALLY_APPROVED",
      "APPROVED",
    ];
    if (!cancellableStatuses.includes(reservation.status)) {
      throw this.invalidStatus(
        "Only draft, pending, or approved reservations before check-out can be cancelled.",
      );
    }
    const cancelledAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "CANCELLED",
          updatedAt: cancelledAt,
        },
      });
      await tx.reservationItem.updateMany({
        where: {
          reservationId,
          status: { in: ["PENDING", "APPROVED"] },
        },
        data: {
          status: "REJECTED",
          updatedAt: cancelledAt,
        },
      });
      await tx.reservationChangeRequest.updateMany({
        where: { reservationId, status: "PENDING" },
        data: {
          status: "CANCELLED",
          reviewedBy: actor.user.id,
          reviewedAt: cancelledAt,
        },
      });
    });
    return this.get(actor, reservationId);
  }

  private async findDetail(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: reservationInclude,
    });
    if (!reservation) {
      throw new ApiException(
        404,
        "RESERVATION_NOT_FOUND",
        "The reservation was not found.",
      );
    }
    return reservation;
  }

  private toListItem(
    actor: AuthenticatedActor,
    reservation: Prisma.ReservationGetPayload<{
      include: typeof reservationListInclude;
    }>,
    updateAreaIds: string[] | null,
    approveAreaIds: string[] | null,
    rejectAreaIds: string[] | null,
  ) {
    const managementAreas = [
      ...new Map(
        reservation.items.map((item) => [
          item.asset.managementArea.id,
          item.asset.managementArea,
        ]),
      ).values(),
    ];
    const canManage = reservation.items.every((item) =>
      reservation.requesterId === actor.user.id
        ? hasAreaPermission(
            actor,
            "reservation:create",
            item.asset.managementAreaId,
          ) ||
          hasAreaPermission(
            actor,
            "reservation:update",
            item.asset.managementAreaId,
          )
        : this.areaIsPermitted(updateAreaIds, item.asset.managementAreaId),
    );
    const isEventTeamMember =
      reservation.requesterId === actor.user.id ||
      reservation.participants.some(
        (participant) => participant.userId === actor.user.id,
      );
    const actionableItems = reservation.items.filter(
      (item) =>
        item.status === "PENDING" &&
        reservation.status === "PENDING_APPROVAL" &&
        (this.areaIsPermitted(approveAreaIds, item.asset.managementAreaId) ||
          this.areaIsPermitted(rejectAreaIds, item.asset.managementAreaId)),
    ).length;
    const canReviewChange =
      reservation.changeRequests.length > 0 &&
      (reservation.items.every((item) =>
        this.areaIsPermitted(approveAreaIds, item.asset.managementAreaId),
      ) ||
        reservation.items.every((item) =>
          this.areaIsPermitted(rejectAreaIds, item.asset.managementAreaId),
        ));
    const statusCounts = reservation.items.reduce<Record<string, number>>(
      (counts, item) => ({
        ...counts,
        [item.status]: (counts[item.status] ?? 0) + 1,
      }),
      {},
    );
    return {
      id: reservation.id,
      eventName: reservation.eventName,
      description: reservation.description,
      startAt: reservation.startAt.toISOString(),
      endAt: reservation.endAt.toISOString(),
      status: reservation.status,
      requester: this.userDto(reservation.requester),
      managementAreas: managementAreas.map((area) => ({
        id: area.id,
        name: area.name,
      })),
      itemCount: reservation.items.length,
      totalQuantity: reservation.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      pendingItemCount: statusCounts.PENDING ?? 0,
      approvedItemCount:
        (statusCounts.APPROVED ?? 0) +
        (statusCounts.PREPARED ?? 0) +
        (statusCounts.CHECKED_OUT ?? 0) +
        (statusCounts.DELIVERED ?? 0) +
        (statusCounts.RETURNED ?? 0),
      rejectedItemCount: statusCounts.REJECTED ?? 0,
      hasPendingChangeRequest: reservation.changeRequests.length > 0,
      pendingDecisionCount: actionableItems + (canReviewChange ? 1 : 0),
      capabilities: {
        canSubmit: canManage && reservation.status === "DRAFT",
        canRequestChange:
          reservation.requesterId === actor.user.id &&
          canManage &&
          editableReservationStatuses.includes(reservation.status) &&
          reservation.changeRequests.length === 0,
        canReview: actionableItems > 0 || canReviewChange,
        canConfirmDelivery:
          ["APPROVED", "PARTIALLY_APPROVED"].includes(reservation.status) &&
          reservation.items.some(
            (item) =>
              ["APPROVED", "PREPARED", "CHECKED_OUT"].includes(item.status) &&
              (isEventTeamMember ||
                hasAreaPermission(
                  actor,
                  "asset:update",
                  item.asset.managementAreaId,
                )),
          ),
        canCancel:
          canManage &&
          [
            "DRAFT",
            "PENDING",
            "PENDING_APPROVAL",
            "PARTIALLY_APPROVED",
            "APPROVED",
          ].includes(reservation.status),
      },
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    };
  }

  private approvalListConditions(
    approveAreaIds: string[] | null,
    rejectAreaIds: string[] | null,
  ): Prisma.ReservationWhereInput[] {
    const conditions: Prisma.ReservationWhereInput[] = [];
    const decisionAreaIds =
      approveAreaIds === null || rejectAreaIds === null
        ? null
        : [...new Set([...approveAreaIds, ...rejectAreaIds])];
    if (decisionAreaIds === null || decisionAreaIds.length) {
      conditions.push({
        status: { in: ["PENDING", "PENDING_APPROVAL"] },
        items: {
          some: {
            status: "PENDING",
            ...(decisionAreaIds === null
              ? {}
              : {
                  asset: { managementAreaId: { in: decisionAreaIds } },
                }),
          },
        },
      });
    }
    for (const areaIds of [approveAreaIds, rejectAreaIds]) {
      if (areaIds !== null && !areaIds.length) continue;
      conditions.push({
        changeRequests: { some: { status: "PENDING" } },
        ...(areaIds === null
          ? {}
          : {
              items: {
                every: {
                  asset: { managementAreaId: { in: areaIds } },
                },
              },
            }),
      });
    }
    return conditions;
  }

  private permissionAreaIds(
    actor: AuthenticatedActor,
    permissions: PermissionKey[],
  ): string[] | null {
    if (
      permissions.some((permission) =>
        actor.effectivePermissions.global.includes(permission),
      )
    ) {
      return null;
    }
    return [
      ...new Set(
        actor.effectivePermissions.byManagementArea
          .filter((area) =>
            permissions.some((permission) =>
              area.permissions.includes(permission),
            ),
          )
          .map((area) => area.managementAreaId),
      ),
    ];
  }

  private areaIsPermitted(areaIds: string[] | null, areaId: string) {
    return areaIds === null || areaIds.includes(areaId);
  }

  private async toDetail(
    actor: AuthenticatedActor,
    reservation: ReservationDetailRecord,
  ) {
    const availability = await this.availabilityByAsset(
      this.prisma,
      reservation.items.map((item) => item.assetId),
      reservation.startAt,
      reservation.endAt,
      reservation.id,
    );
    const canManage = this.canManage(actor, reservation);
    return {
      id: reservation.id,
      eventName: reservation.eventName,
      description: reservation.description,
      startAt: reservation.startAt.toISOString(),
      endAt: reservation.endAt.toISOString(),
      status: reservation.status,
      requester: this.userDto(reservation.requester),
      participants: reservation.participants.map((participant) =>
        this.userDto(participant.user),
      ),
      items: reservation.items.map((item) => {
        const itemAvailability = availability.get(item.assetId)!;
        const itemReturns = reservation.returns.flatMap((r) =>
          r.items
            .filter((ri) => ri.reservationItemId === item.id)
            .map((ri) => ({
              returnStatus: r.status,
              approvalStatus: r.approval?.status,
              item: ri,
            })),
        );
        const returnedQuantity = itemReturns
          .filter(
            (r) =>
              ["APPROVED", "COMPLETED"].includes(r.returnStatus) ||
              r.approvalStatus === "APPROVED",
          )
          .reduce((sum, r) => sum + r.item.quantityReturned, 0);
        const brokenQuantity = itemReturns
          .filter(
            (r) =>
              ["APPROVED", "COMPLETED"].includes(r.returnStatus) ||
              r.approvalStatus === "APPROVED",
          )
          .reduce((sum, r) => sum + r.item.quantityBroken, 0);
        const rawLostQuantity = itemReturns
          .filter(
            (r) =>
              ["APPROVED", "COMPLETED"].includes(r.returnStatus) ||
              r.approvalStatus === "APPROVED",
          )
          .reduce((sum, r) => sum + r.item.quantityLost, 0);
        const pendingReturnQuantity = itemReturns
          .filter(
            (r) =>
              r.returnStatus === "PENDING" &&
              r.approvalStatus !== "APPROVED" &&
              r.approvalStatus !== "REJECTED",
          )
          .reduce(
            (sum, r) =>
              sum +
              r.item.quantityReturned +
              r.item.quantityBroken +
              r.item.quantityLost,
            0,
          );
        const lostQuantity = Math.max(
          0,
          rawLostQuantity -
            Math.max(
              0,
              returnedQuantity +
                brokenQuantity -
                (item.quantity - rawLostQuantity),
            ),
        );
        const remainingReturnQuantity = Math.max(
          0,
          item.quantity -
            (returnedQuantity + brokenQuantity + pendingReturnQuantity),
        );

        return {
          id: item.id,
          asset: {
            id: item.asset.id,
            name: item.asset.name,
            description: item.asset.description,
            pictureUrl: item.asset.pictureUrl,
            isActive: item.asset.isActive,
            managementArea: {
              id: item.asset.managementArea.id,
              name: item.asset.managementArea.name,
            },
            template: item.asset.assetTemplate
              ? {
                  id: item.asset.assetTemplate.id,
                  name: item.asset.assetTemplate.name,
                }
              : null,
          },
          quantity: item.quantity,
          status: item.status,
          returnSummary: {
            returnedQuantity,
            brokenQuantity,
            lostQuantity,
            lostRecoverableQuantity: lostQuantity,
            pendingReturnQuantity,
            remainingReturnQuantity,
          },
          approval: item.approval
            ? {
                id: item.approval.id,
                status: item.approval.status,
                comment: item.approval.comment,
                decidedAt: item.approval.decidedAt?.toISOString() ?? null,
                approver: this.userDto(item.approval.approver),
              }
            : null,
          availability: itemAvailability,
          warnings:
            itemAvailability.pendingReservationCount > 0
              ? [
                  {
                    code: "PENDING_RESERVATION_OVERLAP" as const,
                    message: `${itemAvailability.pendingQuantity} unit(s) are requested by ${itemAvailability.pendingReservationCount} other pending reservation(s).`,
                    pendingQuantity: itemAvailability.pendingQuantity,
                    pendingReservationCount:
                      itemAvailability.pendingReservationCount,
                  },
                ]
              : [],
          capabilities: {
            canApprove:
              item.status === "PENDING" &&
              reservation.status === "PENDING_APPROVAL" &&
              hasAreaPermission(
                actor,
                "reservation:approve",
                item.asset.managementAreaId,
              ),
            canReject:
              item.status === "PENDING" &&
              reservation.status === "PENDING_APPROVAL" &&
              hasAreaPermission(
                actor,
                "reservation:reject",
                item.asset.managementAreaId,
              ),
            canConfirmDelivery:
              [
                "APPROVED",
                "PARTIALLY_APPROVED",
                "DELIVERY_CONFIRMED",
              ].includes(reservation.status) &&
              ["APPROVED", "PREPARED", "CHECKED_OUT"].includes(item.status) &&
              this.canConfirmDeliveryItem(actor, reservation, item),
            canReturn:
              [
                "DELIVERY_CONFIRMED",
                "ACTIVE",
                "RETURN",
                "RETURN_PENDING",
                "RETURN_CONFIRMED",
                "COMPLETED",
              ].includes(reservation.status) &&
              item.status !== "REJECTED" &&
              item.status !== "PENDING" &&
              item.status !== "APPROVED" &&
              remainingReturnQuantity > 0,
          },
        };
      }),
      changeRequests: reservation.changeRequests.map((request) => ({
        id: request.id,
        changeData: request.changeData,
        reason: request.reason,
        status: request.status,
        requestedBy: this.userDto(request.requester),
        reviewedBy: request.reviewer ? this.userDto(request.reviewer) : null,
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        createdAt: request.createdAt.toISOString(),
      })),
      returns: reservation.returns.map((item) => {
        const canApprove =
          item.status === "PENDING" &&
          item.items.every((retItem) =>
            hasAreaPermission(
              actor,
              "return:approve",
              retItem.reservationItem.asset.managementAreaId,
            ),
          );
        return {
          id: item.id,
          reservationId: item.reservationId,
          status: item.status,
          returnedAt: item.returnedAt?.toISOString() ?? null,
          returnedBy: this.userDto(item.returner),
          items: item.items.map((retItem) => ({
            id: retItem.id,
            reservationItemId: retItem.reservationItemId,
            assetId: retItem.reservationItem.asset.id,
            assetName: retItem.reservationItem.asset.name,
            managementArea: {
              id: retItem.reservationItem.asset.managementArea.id,
              name: retItem.reservationItem.asset.managementArea.name,
            },
            quantityReturned: retItem.quantityReturned,
            quantityBroken: retItem.quantityBroken,
            quantityLost: retItem.quantityLost,
            description: retItem.description,
          })),
          approval: item.approval
            ? {
                id: item.approval.id,
                status: item.approval.status,
                description: item.approval.description,
                decidedAt: item.approval.decidedAt?.toISOString() ?? null,
                approver: this.userDto(item.approval.approver),
              }
            : null,
          capabilities: {
            canApprove,
            canReject: canApprove,
          },
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        };
      }),
      capabilities: {
        canSubmit: canManage && reservation.status === "DRAFT",
        canRequestChange:
          reservation.requesterId === actor.user.id &&
          canManage &&
          editableReservationStatuses.includes(reservation.status),
        canConfirmDelivery:
          [
            "APPROVED",
            "PARTIALLY_APPROVED",
            "DELIVERY_CONFIRMED",
          ].includes(reservation.status) &&
          reservation.items.some((item) =>
            ["APPROVED", "PREPARED", "CHECKED_OUT"].includes(item.status) &&
            this.canConfirmDeliveryItem(actor, reservation, item),
          ),
        canCancel:
          canManage &&
          [
            "DRAFT",
            "PENDING",
            "PENDING_APPROVAL",
            "PARTIALLY_APPROVED",
            "APPROVED",
          ].includes(reservation.status),
        canReturn:
          [
            "DELIVERY_CONFIRMED",
            "ACTIVE",
            "RETURN",
            "RETURN_PENDING",
            "RETURN_CONFIRMED",
            "COMPLETED",
          ].includes(reservation.status) &&
          reservation.items.some(
            (item) =>
              item.status !== "REJECTED" &&
              item.status !== "PENDING" &&
              item.status !== "APPROVED",
          ),
      },
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    };
  }

  private async availabilityByAsset(
    db: ReservationDb,
    assetIds: string[],
    startAt: Date,
    endAt: Date,
    excludeReservationId?: string,
  ) {
    const uniqueAssetIds = [...new Set(assetIds)];
    const assets = await db.asset.findMany({
      where: { id: { in: uniqueAssetIds } },
      select: { id: true, totalQuantity: true },
    });
    const overlapping = await db.reservationItem.findMany({
      where: {
        assetId: { in: uniqueAssetIds },
        status: { in: [...allocatedItemStatuses, "PENDING"] },
        reservation: {
          ...(excludeReservationId
            ? { id: { not: excludeReservationId } }
            : {}),
          startAt: { lt: endAt },
          endAt: { gt: startAt },
          status: {
            in: [...allocatedReservationStatuses, "PENDING_APPROVAL"],
          },
        },
      },
      select: {
        assetId: true,
        quantity: true,
        status: true,
        reservationId: true,
        reservation: { select: { status: true } },
      },
    });
    const result = new Map<string, Availability>();
    for (const asset of assets) {
      const approved = overlapping.filter(
        (item) =>
          item.assetId === asset.id &&
          allocatedItemStatuses.includes(item.status) &&
          allocatedReservationStatuses.includes(item.reservation.status),
      );
      const pending = overlapping.filter(
        (item) =>
          item.assetId === asset.id &&
          item.status === "PENDING" &&
          item.reservation.status === "PENDING_APPROVAL",
      );
      const approvedQuantity = approved.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const pendingQuantity = pending.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      result.set(asset.id, {
        assetId: asset.id,
        totalQuantity: asset.totalQuantity,
        approvedQuantity,
        pendingQuantity,
        availableQuantity: Math.max(0, asset.totalQuantity - approvedQuantity),
        pendingReservationCount: new Set(
          pending.map((item) => item.reservationId),
        ).size,
      });
    }
    return result;
  }

  private async assertAvailability(
    db: ReservationDb,
    items: ReadonlyArray<ReservationItemInputDto>,
    assets: ReadonlyArray<{ id: string; totalQuantity: number }>,
    startAt: Date,
    endAt: Date,
    excludeReservationId?: string,
  ) {
    const availability = await this.availabilityByAsset(
      db,
      items.map((item) => item.assetId),
      startAt,
      endAt,
      excludeReservationId,
    );
    const assetById = new Map(
      assets.map((asset) => [asset.id, asset] as const),
    );
    for (const [index, item] of items.entries()) {
      const snapshot = availability.get(item.assetId);
      if (!snapshot || !assetById.has(item.assetId)) continue;
      if (item.quantity > snapshot.availableQuantity) {
        throw new ApiException(
          409,
          "RESERVATION_CONFLICT",
          "An approved reservation already uses the requested asset during this time range.",
          {
            [`items.${index}.quantity`]: `Only ${snapshot.availableQuantity} of ${snapshot.totalQuantity} units are available.`,
          },
        );
      }
    }
  }

  private async findAssets(assetIds: string[]) {
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: [...new Set(assetIds)] } },
    });
    this.assertAllAssetsFoundAndActive(
      assetIds.map((assetId) => ({ assetId })),
      assets,
    );
    return assets;
  }

  private assertAllAssetsFoundAndActive(
    items: ReadonlyArray<{ assetId: string }>,
    assets: ReadonlyArray<{ id: string; isActive: boolean }>,
  ) {
    if (assets.length !== new Set(items.map((item) => item.assetId)).size) {
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "One or more requested assets were not found.",
      );
    }
    if (assets.some((asset) => !asset.isActive)) {
      throw new ApiException(
        409,
        "ASSET_INACTIVE",
        "Inactive assets cannot be reserved.",
      );
    }
  }

  private assertUniqueItems(items: ReadonlyArray<{ assetId: string }>) {
    if (new Set(items.map((item) => item.assetId)).size !== items.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A reservation cannot contain the same asset more than once.",
        { items: "Combine duplicate asset entries into one quantity." },
      );
    }
  }

  private assertDateRange(startAt: Date, endAt: Date) {
    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      endAt <= startAt
    ) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The reservation end time must be after its start time.",
        { endAt: "endAt must be later than startAt." },
      );
    }
  }

  private normalizeParticipantIds(
    ids: string[] | undefined,
    requesterId: string,
  ) {
    const values = ids ?? [];
    if (new Set(values).size !== values.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A participant can only be added once.",
        { participantIds: "Remove duplicate participant IDs." },
      );
    }
    return values.filter((id) => id !== requesterId);
  }

  private async assertParticipants(ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.user.count({
      where: { id: { in: ids }, isActive: true },
    });
    if (count !== ids.length) {
      throw new ApiException(
        404,
        "USER_NOT_FOUND",
        "One or more participants were not found or are inactive.",
      );
    }
  }

  private normalizeChangeData(
    input: ReservationChangeDataDto,
  ): StoredChangeData {
    return {
      ...(input.eventName !== undefined ? { eventName: input.eventName } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      ...(input.items !== undefined
        ? {
            items: input.items.map((item) => ({
              assetId: item.assetId,
              quantity: item.quantity,
            })),
          }
        : {}),
      ...(input.participantIds !== undefined
        ? { participantIds: [...input.participantIds] }
        : {}),
    };
  }

  private storedChangeData(value: Prisma.JsonValue): StoredChangeData {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new ApiException(
        500,
        "INVALID_CHANGE_REQUEST",
        "The stored reservation change request is invalid.",
      );
    }
    return value as StoredChangeData;
  }

  private reservationStatusFromItems(statuses: string[]) {
    if (statuses.every((status) => status === "APPROVED")) return "APPROVED";
    if (statuses.every((status) => status === "REJECTED")) return "REJECTED";
    if (statuses.every((status) => ["APPROVED", "REJECTED"].includes(status))) {
      return "PARTIALLY_APPROVED";
    }
    return "PENDING_APPROVAL";
  }

  private assertCanView(
    actor: AuthenticatedActor,
    reservation: ReservationDetailRecord,
  ) {
    const involved =
      reservation.requesterId === actor.user.id ||
      reservation.participants.some(
        (participant) => participant.userId === actor.user.id,
      );
    if (involved) return;

    const operationalAccess =
      reservation.items.length === 0
        ? (
            [
              "reservation:update",
              "reservation:approve",
              "reservation:reject",
            ] as PermissionKey[]
          ).some((permission) => hasGlobalPermission(actor, permission))
        : reservation.items.some((item) =>
            (
              [
                "reservation:update",
                "reservation:approve",
                "reservation:reject",
              ] as PermissionKey[]
            ).some((permission) =>
              hasAreaPermission(actor, permission, item.asset.managementAreaId),
            ),
          );

    if (
      ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(
        reservation.status,
      )
    ) {
      if (!operationalAccess) this.permissionDenied();
    } else {
      const canViewGeneral =
        hasAnyPermission(actor, "reservation:create") ||
        hasAnyPermission(actor, "asset:view") ||
        operationalAccess;
      if (!canViewGeneral) this.permissionDenied();
    }
  }

  private canManage(
    actor: AuthenticatedActor,
    reservation: ReservationDetailRecord,
  ) {
    if (reservation.items.length === 0) {
      return (
        reservation.requesterId === actor.user.id ||
        hasAnyPermission(actor, "reservation:create") ||
        hasAnyPermission(actor, "reservation:update")
      );
    }
    return reservation.items.every((item) =>
      reservation.requesterId === actor.user.id
        ? hasAreaPermission(
            actor,
            "reservation:create",
            item.asset.managementAreaId,
          ) ||
          hasAreaPermission(
            actor,
            "reservation:update",
            item.asset.managementAreaId,
          )
        : hasAreaPermission(
            actor,
            "reservation:update",
            item.asset.managementAreaId,
          ),
    );
  }

  private canConfirmDeliveryItem(
    actor: AuthenticatedActor,
    reservation: ReservationDetailRecord,
    item: ReservationDetailRecord["items"][number],
  ) {
    const isEventTeamMember =
      reservation.requesterId === actor.user.id ||
      reservation.participants.some(
        (participant) => participant.userId === actor.user.id,
      );
    return (
      isEventTeamMember ||
      hasAreaPermission(actor, "asset:update", item.asset.managementAreaId)
    );
  }

  private assertCanManage(
    actor: AuthenticatedActor,
    reservation: ReservationDetailRecord,
  ) {
    if (!this.canManage(actor, reservation)) this.permissionDenied();
  }

  private assertArea(
    actor: AuthenticatedActor,
    permission: PermissionKey,
    managementAreaId: string,
  ) {
    if (!hasAreaPermission(actor, permission, managementAreaId)) {
      this.permissionDenied();
    }
  }

  private assertAnyArea(actor: AuthenticatedActor, permission: PermissionKey) {
    if (!hasAnyPermission(actor, permission)) {
      this.permissionDenied();
    }
  }

  private permissionDenied(): never {
    throw new ApiException(
      403,
      "PERMISSION_DENIED",
      "You do not have permission to perform this reservation action.",
    );
  }

  private invalidStatus(message: string) {
    return new ApiException(409, "INVALID_RESERVATION_STATUS", message);
  }

  private async assertActiveActor(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const actor = await tx.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true },
    });
    if (!actor) {
      throw new ApiException(
        401,
        "AUTHENTICATION_REQUIRED",
        "The account is no longer active.",
      );
    }
  }

  private async lockAssets(tx: Prisma.TransactionClient, assetIds: string[]) {
    for (const assetId of [...new Set(assetIds)].sort()) {
      await tx.$queryRaw`
        SELECT "id"
        FROM "assets"
        WHERE "id" = ${assetId}::uuid
        FOR UPDATE
      `;
    }
  }

  private async runSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (this.prismaCode(error) !== "P2034" || attempt === 3) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 10 * 2 ** (attempt - 1) + Math.random() * 10),
        );
      }
    }
    throw new Error("Unreachable reservation transaction state.");
  }

  private prismaCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return undefined;
    }
    return typeof error.code === "string" ? error.code : undefined;
  }

  private userDto(user: {
    id: string;
    email: string;
    profile: { name: string; profilePictureUrl: string | null } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.profile?.name ?? null,
      profilePictureUrl: user.profile?.profilePictureUrl ?? null,
    };
  }
}
