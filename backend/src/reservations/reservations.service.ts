import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { normalizePermissions } from "../access-control/permissions.js";
import type { PermissionKey } from "../access-control/permissions.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { ReservationLifecycleEvents } from "../common/reservation-lifecycle.events.js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  HARD_ALLOCATION_ITEM_STATUSES,
  HARD_ALLOCATION_RESERVATION_STATUSES,
  SCHEDULABLE_ASSET_UNIT_STATUSES,
} from "../common/reservation-allocation.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  hasAnyPermission,
  hasAreaPermission,
  hasGlobalPermission,
} from "../assets/asset-access.js";
import type {
  CancelReservationDto,
  ConfirmDeliveryDto,
  CreateReservationDto,
  ReservationItemDecisionDto,
  ReservationItemsDecisionDto,
  ReservationItemInputDto,
  ReservationListQueryDto,
  SubmitReservationDto,
} from "./reservations.dto.js";

const allocatedReservationStatuses = HARD_ALLOCATION_RESERVATION_STATUSES;
const allocatedItemStatuses = HARD_ALLOCATION_ITEM_STATUSES;
const reservationInclude = {
  requester: { include: { profile: true } },
  participants: {
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
  },
  items: {
    include: {
      asset: { include: { managementArea: true } },
      approval: { include: { approver: { include: { profile: true } } } },
      unitAssignments: {
        include: { assetUnit: true },
        orderBy: { assignedAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  },
  returns: {
    include: {
      returner: { include: { profile: true } },
      items: {
        include: {
          reservationItem: {
            include: { asset: { include: { managementArea: true } } },
          },
          units: {
            include: {
              reservationItemUnit: { include: { assetUnit: true } },
            },
          },
        },
      },
      approval: { include: { approver: { include: { profile: true } } } },
    },
    orderBy: { createdAt: "desc" },
  },
  activityLogs: {
    include: {
      actor: { include: { profile: true } },
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
} satisfies Prisma.ReservationInclude;

type ReservationDetailRecord = Prisma.ReservationGetPayload<{
  include: typeof reservationInclude;
}>;

type ReservationDb = Pick<
  Prisma.TransactionClient,
  "asset" | "reservationItem" | "assetUnit"
>;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationEvents: ReservationLifecycleEvents,
  ) {}

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
    const conditions: Prisma.ReservationWhereInput[] = [];

    if (query.view === "MINE") {
      conditions.push({
        requesterId: actor.user.id,
      });
    } else if (query.view === "PARTICIPATING") {
      conditions.push({
        participants: { some: { userId: actor.user.id } },
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
    } else if (query.view === "APPROVAL_HISTORY") {
      const historyConditions = this.approvalHistoryConditions(
        actor.user.id,
        approveAreaIds,
        rejectAreaIds,
      );
      if (!historyConditions.length) {
        return {
          data: [],
          pageInfo: { nextCursor: null, hasNextPage: false },
        };
      }
      conditions.push({ OR: historyConditions });
    } else {
      const ownReservationCondition: Prisma.ReservationWhereInput = {
        OR: [
          { requesterId: actor.user.id },
          { participants: { some: { userId: actor.user.id } } },
        ],
      };

      const viewAreaIds = this.permissionAreaIds(actor, ["reservation:view"]);

      if (viewAreaIds === null) {
        // Global reservation:view can browse every reservation.
      } else {
        // ALL is the cross-user browse surface, so only reservation:view may
        // widen it. Operational permissions have their own scoped queues
        // (APPROVALS / APPROVAL_HISTORY) and must not silently grant browse.
        const viewConditions: Prisma.ReservationWhereInput[] = [
          ownReservationCondition,
        ];

        // reservation:view area-scoped: see all reservations in those areas
        if (viewAreaIds.length) {
          viewConditions.push({
            items: {
              some: { asset: { managementAreaId: { in: viewAreaIds } } },
            },
          });
        }

        if (viewConditions.length > 1) {
          conditions.push({ OR: viewConditions });
        } else {
          // Only own reservations — no reservation:view access.
          conditions.push(ownReservationCondition);
        }
      }

      // DRAFT remains private to the event team even when reservation:view is
      // scoped to the same area. Submitted/final records follow view scope.
      conditions.push({
        OR: [{ status: { not: "DRAFT" } }, ownReservationCondition],
      });
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
    // §7.1: items is required and non-empty, so every reservation has assets
    // to scope permission and availability against.
    const items = input.items;
    this.assertUniqueItems(items);
    const participantIds = this.normalizeParticipantIds(
      input.participantIds,
      actor.user.id,
    );
    await this.assertParticipants(participantIds);
    const assets = await this.findAssets(items.map((item) => item.assetId));
    for (const asset of assets) {
      this.assertArea(actor, "reservation:create", asset.managementAreaId);
    }
    await this.assertAvailability(this.prisma, items, assets, startAt, endAt);

    const status: "DRAFT" | "PENDING_APPROVAL" = input.status ?? "DRAFT";

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
      await this.logActivity(tx, {
        reservationId,
        actorId: actor.user.id,
        action: "RESERVATION_CREATED",
        entityType: "RESERVATION",
        entityId: reservationId,
        details: {
          eventName: input.eventName,
          itemCount: items.length,
          status,
        },
      });
    });
    // The everyday "send for approval" flow creates straight into
    // PENDING_APPROVAL in one step -- it never goes through submit() below,
    // which is only reachable from an existing DRAFT. Without this, the
    // normal way anyone actually submits a reservation never notified
    // approvers at all (caught via live testing: an admin who should
    // receive every submission got no email when a user reserved an asset).
    if (status === "PENDING_APPROVAL") {
      const managementAreaIds = [
        ...new Set(assets.map((a) => a.managementAreaId)),
      ];
      const approverRecipients =
        await this.findApproverRecipients(managementAreaIds);
      this.reservationEvents.emitSubmitted({
        reservationId,
        eventName: input.eventName,
        startAt,
        endAt,
        requester: {
          email: actor.user.email,
          name: actor.user.profile?.name ?? actor.user.username,
        },
        approverRecipients,
      });
    }
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
    const result = await this.prisma.reservation.updateMany({
      where: {
        id: reservationId,
        status: "DRAFT",
        updatedAt: new Date(input.expectedUpdatedAt),
      },
      data: { status: "PENDING_APPROVAL", updatedAt: new Date() },
    });
    if (!result.count) {
      throw new ApiException(
        409,
        "STALE_WRITE",
        "The reservation changed after it was loaded. Reload and try again.",
      );
    }
    await this.logActivity(this.prisma, {
      reservationId,
      actorId: actor.user.id,
      action: "RESERVATION_SUBMITTED",
      entityType: "RESERVATION",
      entityId: reservationId,
      details: { status: "PENDING_APPROVAL" },
    });
    const managementAreaIds = [
      ...new Set(assets.map((a) => a.managementAreaId)),
    ];
    const approverRecipients =
      await this.findApproverRecipients(managementAreaIds);
    this.reservationEvents.emitSubmitted({
      reservationId,
      eventName: reservation.eventName,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      requester: {
        email: reservation.requester.email,
        name:
          reservation.requester.profile?.name ?? reservation.requester.username,
      },
      approverRecipients,
    });
    return this.get(actor, reservationId);
  }

  private async findApproverRecipients(managementAreaIds: string[]) {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        OR: [
          { managementAreaId: null },
          { managementAreaId: { in: managementAreaIds } },
        ],
      },
      include: { role: true, user: { include: { profile: true } } },
    });
    const recipients = new Map<string, { email: string; name: string }>();
    for (const assignment of assignments) {
      if (!assignment.user.isActive) continue;
      if (
        !normalizePermissions(assignment.role.permissions).includes(
          "reservation:approve",
        )
      ) {
        continue;
      }
      // Not every approver has linked Google yet (email is only populated
      // once they do) -- dedupe by user id (stable regardless of email,
      // unlike the old email-keyed Map, which would have silently
      // collapsed multiple unlinked approvers into one entry) and skip
      // anyone we have no address to reach.
      if (!assignment.user.email) continue;
      recipients.set(assignment.user.id, {
        email: assignment.user.email,
        name: assignment.user.profile?.name ?? assignment.user.username,
      });
    }
    return [...recipients.values()];
  }

  async decideItem(
    actor: AuthenticatedActor,
    reservationId: string,
    itemId: string,
    input: ReservationItemDecisionDto,
  ) {
    return this.decideItems(actor, reservationId, {
      items: [{ reservationItemId: itemId, assetUnitIds: input.assetUnitIds }],
      decision: input.decision,
      comment: input.comment,
    });
  }

  async decideItems(
    actor: AuthenticatedActor,
    reservationId: string,
    input: ReservationItemsDecisionDto,
  ) {
    const entries = new Map(
      input.items.map((entry) => [entry.reservationItemId, entry] as const),
    );
    const itemIds = [...entries.keys()].sort();
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

    if (input.decision === "APPROVE") {
      for (const item of current) {
        const entry = entries.get(item.id)!;
        const unitIds = entry.assetUnitIds ?? [];
        if (new Set(unitIds).size !== unitIds.length) {
          throw new ApiException(
            422,
            "VALIDATION_ERROR",
            `Duplicate asset units were selected for "${item.asset.name}".`,
            { [`items.${item.id}.assetUnitIds`]: "Remove duplicate units." },
          );
        }
        if (unitIds.length < 1 || unitIds.length > item.quantity) {
          throw new ApiException(
            422,
            "VALIDATION_ERROR",
            `Select 1 to ${item.quantity} unit(s) to approve "${item.asset.name}".`,
            {
              [`items.${item.id}.assetUnitIds`]: `Select 1 to ${item.quantity} unit(s).`,
            },
          );
        }
      }
    }

    const selectedUnitIds =
      input.decision === "APPROVE"
        ? input.items.flatMap((entry) => entry.assetUnitIds ?? [])
        : [];
    const allUnitIds = [...new Set(selectedUnitIds)];
    if (allUnitIds.length !== selectedUnitIds.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The same asset unit cannot be assigned to multiple items in one decision.",
        { items: "Select each serial-numbered unit at most once." },
      );
    }

    const decidedAt = new Date();
    let newStatus!: string;
    try {
      newStatus = await this.runSerializable(async (tx) => {
        await this.lockReservation(tx, reservationId);
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
              !["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(
                item.reservation.status,
              ),
          )
        ) {
          throw this.invalidStatus(
            "Only pending items in a pending reservation can be decided.",
          );
        }

        const approvalStatus =
          input.decision === "APPROVE" ? "APPROVED" : "REJECTED";

        if (input.decision === "APPROVE") {
          const reservation = items[0]!.reservation;
          await this.lockAssets(
            tx,
            items.map((item) => item.assetId),
          );

          await this.lockAssetUnits(tx, allUnitIds);
          const units = await tx.assetUnit.findMany({
            where: { id: { in: allUnitIds } },
          });
          if (units.length !== allUnitIds.length) {
            throw new ApiException(
              404,
              "ASSET_UNIT_NOT_FOUND",
              "One or more asset units were not found.",
            );
          }
          const unitById = new Map(units.map((unit) => [unit.id, unit]));
          for (const item of items) {
            const entry = entries.get(item.id)!;
            for (const unitId of entry.assetUnitIds ?? []) {
              const unit = unitById.get(unitId)!;
              if (
                unit.assetId !== item.assetId ||
                !SCHEDULABLE_ASSET_UNIT_STATUSES.includes(unit.status)
              ) {
                throw new ApiException(
                  409,
                  "ASSET_UNIT_UNAVAILABLE",
                  "One or more selected units are not physically serviceable for this asset.",
                );
              }
            }
          }

          const scheduleConflicts = await tx.reservationItemUnit.findMany({
            where: {
              assetUnitId: { in: allUnitIds },
              status: { in: ACTIVE_ASSIGNMENT_STATUSES },
              assignmentStartAt: { lt: reservation.endAt },
              assignmentEndAt: { gt: reservation.startAt },
            },
            select: { assetUnitId: true },
          });
          if (scheduleConflicts.length > 0) {
            throw new ApiException(
              409,
              "ASSET_UNIT_SCHEDULE_CONFLICT",
              "One or more selected units are already assigned during this reservation window.",
            );
          }

          for (const item of items) {
            const entry = entries.get(item.id)!;
            await tx.reservationItemUnit.createMany({
              data: (entry.assetUnitIds ?? []).map((assetUnitId) => ({
                id: randomUUID(),
                reservationItemId: item.id,
                assetUnitId,
                status: "ASSIGNED",
                assignedBy: actor.user.id,
                assignedAt: decidedAt,
                assignmentStartAt: reservation.startAt,
                assignmentEndAt: reservation.endAt,
              })),
            });
          }
        }

        if (input.decision === "APPROVE") {
          // Approval is unit-based: the item's quantity is cut down to
          // however many serial units were actually approved (may be fewer
          // than requested) -- each item can differ, so this can't be a
          // single shared updateMany like the REJECT branch below.
          for (const item of items) {
            const entry = entries.get(item.id)!;
            const approvedQuantity = (entry.assetUnitIds ?? []).length;
            const updated = await tx.reservationItem.updateMany({
              where: { id: item.id, reservationId, status: "PENDING" },
              data: {
                status: "PREPARED",
                quantity: approvedQuantity,
                preparedBy: actor.user.id,
                preparedAt: decidedAt,
                updatedAt: decidedAt,
              },
            });
            if (updated.count !== 1) {
              throw this.invalidStatus(
                "One or more selected items were already decided. Reload and try again.",
              );
            }
          }
        } else {
          const updated = await tx.reservationItem.updateMany({
            where: { id: { in: itemIds }, reservationId, status: "PENDING" },
            data: { status: "REJECTED", updatedAt: decidedAt },
          });
          if (updated.count !== itemIds.length) {
            throw this.invalidStatus(
              "One or more selected items were already decided. Reload and try again.",
            );
          }
        }
        await tx.reservationItemApproval.createMany({
          data: itemIds.map((reservationItemId) => ({
            id: randomUUID(),
            reservationItemId,
            approverId: actor.user.id,
            status: approvalStatus,
            comment: input.comment ?? null,
            decidedAt,
          })),
          skipDuplicates: true,
        });
        await tx.reservationItemApproval.updateMany({
          where: { reservationItemId: { in: itemIds } },
          data: {
            approverId: actor.user.id,
            status: approvalStatus,
            comment: input.comment ?? null,
            decidedAt,
          },
        });
        const statuses = await tx.reservationItem.findMany({
          where: { reservationId },
          select: { status: true },
        });
        const nextStatus = this.reservationStatusFromItems(
          statuses.map((row) => row.status),
        );
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: nextStatus, updatedAt: decidedAt },
        });
        for (const item of items) {
          const entry = entries.get(item.id);
          await this.logActivity(tx, {
            reservationId,
            actorId: actor.user.id,
            action:
              approvalStatus === "APPROVED" ? "ITEM_APPROVED" : "ITEM_REJECTED",
            entityType: "RESERVATION_ITEM",
            entityId: item.id,
            details: {
              assetId: item.assetId,
              assetName: item.asset.name,
              requestedQuantity: item.quantity,
              comment: input.comment ?? null,
              ...(entry?.assetUnitIds
                ? {
                    assetUnitIds: entry.assetUnitIds,
                    approvedQuantity: entry.assetUnitIds.length,
                  }
                : {}),
            },
          });
        }
        return nextStatus;
      });
    } catch (error) {
      if (
        this.prismaCode(error) === "P2002" ||
        this.isAssignmentOverlapError(error)
      ) {
        throw new ApiException(
          409,
          "ASSET_UNIT_SCHEDULE_CONFLICT",
          "One or more selected units are already assigned during this reservation window.",
        );
      }
      throw error;
    }
    const detail = await this.get(actor, reservationId);
    // Items are often decided in batches (area managers only ever see/decide
    // their own area's items -- see findApproverRecipients), so newStatus can
    // still be PENDING_APPROVAL right after this call (other items in the
    // same reservation untouched). Emailing on every batch would send a
    // premature "your reservation was approved/rejected" while it's still
    // actually pending, and could fire more than once per reservation.
    // Only notify once the decision is actually final for now (APPROVED,
    // REJECTED, or PARTIALLY_APPROVED -- reservationDecidedEmail already
    // caveats that last one).
    if (newStatus !== "PENDING_APPROVAL") {
      this.reservationEvents.emitDecided({
        reservationId,
        eventName: detail.eventName,
        startAt: new Date(detail.startAt),
        endAt: new Date(detail.endAt),
        status: newStatus,
        decision: input.decision,
        requester: {
          id: detail.requester.id,
          email: detail.requester.email,
          name: detail.requester.name ?? "A user",
        },
      });
    }
    return detail;
  }

  async confirmDelivery(
    actor: AuthenticatedActor,
    reservationId: string,
    input?: ConfirmDeliveryDto,
  ) {
    const reservation = await this.findDetail(reservationId);
    const deliveredAt = new Date();
    if (
      !["APPROVED", "PARTIALLY_APPROVED", "DELIVERY_CONFIRMED"].includes(
        reservation.status,
      )
    ) {
      throw this.invalidStatus(
        `Cannot confirm delivery for reservation in state "${reservation.status}". Reservation must be approved.`,
      );
    }
    if (deliveredAt >= reservation.endAt) {
      throw new ApiException(
        409,
        "HANDOVER_WINDOW_CLOSED",
        "Equipment cannot be handed over after the reservation end time.",
      );
    }

    const deliverableItemStatuses = ["PREPARED"];
    const deliverableItems = reservation.items.filter((item) =>
      deliverableItemStatuses.includes(item.status),
    );

    // entries: which item to confirm, which of its ASSIGNED units to hand
    // over, and which to cancel (§7.8 -- every assigned unit needs a
    // disposition). unitIds === null means "every remaining ASSIGNED unit"
    // (full handover); cancelledUnitIds is always an explicit list.
    type Entry = {
      item: (typeof reservation.items)[number];
      unitIds: string[] | null;
      cancelledUnitIds: string[];
    };
    let entries: Entry[];

    if (input?.items && input.items.length > 0) {
      const byId = new Map(reservation.items.map((item) => [item.id, item]));
      const seen = new Set<string>();
      entries = input.items.map((entry) => {
        if (seen.has(entry.reservationItemId)) {
          throw new ApiException(
            400,
            "INVALID_ITEM_SELECTION",
            "Duplicate reservationItemId in the same request.",
          );
        }
        seen.add(entry.reservationItemId);
        const item = byId.get(entry.reservationItemId);
        if (!item) {
          throw new ApiException(
            400,
            "INVALID_ITEM_SELECTION",
            "One or more selected items do not belong to this reservation.",
          );
        }
        const cancelledUnitIds = entry.cancelledReservationItemUnitIds ?? [];
        const handedOverUnitIds = entry.reservationItemUnitIds ?? null;
        if (
          handedOverUnitIds &&
          cancelledUnitIds.some((id) => handedOverUnitIds.includes(id))
        ) {
          throw new ApiException(
            400,
            "INVALID_ITEM_SELECTION",
            "A serial unit cannot be both handed over and cancelled in the same request.",
          );
        }
        // Only the "nothing specified at all" case means full handover --
        // cancelling some units without naming any to hand over must not be
        // read as "hand over everything".
        return {
          item,
          unitIds:
            handedOverUnitIds ?? (cancelledUnitIds.length > 0 ? [] : null),
          cancelledUnitIds,
        };
      });

      const invalidStateItems = entries.filter(
        ({ item }) => !deliverableItemStatuses.includes(item.status),
      );
      if (invalidStateItems.length > 0) {
        throw new ApiException(
          409,
          "INVALID_ITEM_STATUS",
          "Only prepared equipment can be confirmed for delivery.",
        );
      }
      if (
        entries.some(
          ({ item }) => !this.canConfirmDeliveryItem(actor, reservation, item),
        )
      ) {
        this.permissionDenied();
      }

      for (const { item, unitIds, cancelledUnitIds } of entries) {
        const assignedIds = new Set(
          item.unitAssignments
            .filter((unit) => unit.status === "ASSIGNED")
            .map((unit) => unit.id),
        );
        const selected = [...(unitIds ?? []), ...cancelledUnitIds];
        if (selected.some((id) => !assignedIds.has(id))) {
          throw new ApiException(
            409,
            "RESERVATION_ITEM_UNIT_UNAVAILABLE",
            "One or more selected serial units are not assigned and awaiting handover on this item.",
          );
        }
      }
    } else {
      entries = deliverableItems
        .filter((item) => this.canConfirmDeliveryItem(actor, reservation, item))
        .map((item) => ({ item, unitIds: null, cancelledUnitIds: [] }));
    }

    if (entries.length === 0) {
      if (deliverableItems.length > 0) this.permissionDenied();
      throw new ApiException(
        400,
        "NO_ITEMS_TO_DELIVER",
        "There are no prepared items waiting for delivery confirmation.",
      );
    }

    await this.runSerializable(async (tx) => {
      await this.lockReservation(tx, reservationId);
      const currentReservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { status: true, endAt: true },
      });
      if (!currentReservation) {
        throw new ApiException(
          404,
          "RESERVATION_NOT_FOUND",
          "The reservation was not found.",
        );
      }
      if (
        !["APPROVED", "PARTIALLY_APPROVED", "DELIVERY_CONFIRMED"].includes(
          currentReservation.status,
        )
      ) {
        throw this.invalidStatus(
          `Cannot confirm delivery for reservation in state "${currentReservation.status}". Reservation must be approved.`,
        );
      }
      if (deliveredAt >= currentReservation.endAt) {
        throw new ApiException(
          409,
          "HANDOVER_WINDOW_CLOSED",
          "Equipment cannot be handed over after the reservation end time.",
        );
      }

      // 1. Check out exactly the targeted units per item (ASSIGNED ->
      // CHECKED_OUT) -- partial handover leaves the rest ASSIGNED and the
      // item itself PREPARED until every unit has been handed over.
      const eventBatchId = randomUUID();
      let batchCreated = false;
      let fullyDeliveredCount = 0;
      let cancelledUnitCount = 0;
      const deliveredUnitsByItem: {
        reservationItemId: string;
        reservationItemUnitIds: string[];
        cancelledReservationItemUnitIds: string[];
      }[] = [];

      for (const { item, unitIds, cancelledUnitIds } of entries) {
        const assignedUnits = item.unitAssignments.filter(
          (unit) => unit.status === "ASSIGNED",
        );
        const targetUnits = unitIds
          ? assignedUnits.filter((unit) => unitIds.includes(unit.id))
          : assignedUnits;
        deliveredUnitsByItem.push({
          reservationItemId: item.id,
          reservationItemUnitIds: targetUnits.map((unit) => unit.id),
          cancelledReservationItemUnitIds: cancelledUnitIds,
        });

        if (targetUnits.length > 0) {
          const targetUnitIds = targetUnits.map((unit) => unit.id);
          const targetAssetUnitIds = targetUnits.map(
            (unit) => unit.assetUnitId,
          );
          await this.lockAssetUnits(tx, targetAssetUnitIds);
          const physicalUnits = await tx.assetUnit.findMany({
            where: { id: { in: targetAssetUnitIds } },
            select: { id: true, status: true },
          });
          if (
            physicalUnits.length !== targetAssetUnitIds.length ||
            physicalUnits.some(
              (unit) => !["ACTIVE", "RESERVED"].includes(unit.status),
            )
          ) {
            throw new ApiException(
              409,
              "ASSET_UNIT_PHYSICALLY_UNAVAILABLE",
              "One or more assigned units are not physically available for handover.",
            );
          }
          const physicalStatusById = new Map(
            physicalUnits.map((unit) => [unit.id, unit.status] as const),
          );
          const updatedPhysicalUnits = await tx.assetUnit.updateMany({
            where: {
              id: { in: targetAssetUnitIds },
              status: { in: ["ACTIVE", "RESERVED"] },
            },
            data: { status: "CHECKED_OUT", updatedAt: deliveredAt },
          });
          if (updatedPhysicalUnits.count !== targetAssetUnitIds.length) {
            throw new ApiException(
              409,
              "ASSET_UNIT_PHYSICALLY_UNAVAILABLE",
              "One or more assigned units changed before handover completed.",
            );
          }
          const updatedAssignments = await tx.reservationItemUnit.updateMany({
            where: { id: { in: targetUnitIds }, status: "ASSIGNED" },
            data: { status: "CHECKED_OUT", checkedOutAt: deliveredAt },
          });
          if (updatedAssignments.count !== targetUnitIds.length) {
            throw new ApiException(
              409,
              "RESERVATION_ITEM_UNIT_UNAVAILABLE",
              "One or more selected assignments changed before handover completed.",
            );
          }
          if (!batchCreated) {
            await tx.assetUnitEventBatch.create({
              data: {
                id: eventBatchId,
                description: "Checked out for delivery",
                performedBy: actor.user.id,
              },
            });
            batchCreated = true;
          }
          await tx.assetUnitEvent.createMany({
            data: targetAssetUnitIds.map((assetUnitId) => ({
              id: randomUUID(),
              batchId: eventBatchId,
              assetUnitId,
              eventType: "CHECKED_OUT",
              fromStatus: physicalStatusById.get(assetUnitId) ?? "ACTIVE",
              toStatus: "CHECKED_OUT",
              reservationItemId: item.id,
            })),
          });
        }

        // Units the actor is explicitly not handing over. The physical
        // AssetUnit is untouched -- it never left the store room -- and the
        // CANCELLED row falls outside the assignment-window exclusion
        // constraint, so the serial is immediately schedulable again.
        if (cancelledUnitIds.length > 0) {
          const cancelled = await tx.reservationItemUnit.updateMany({
            where: { id: { in: cancelledUnitIds }, status: "ASSIGNED" },
            data: { status: "CANCELLED", updatedAt: deliveredAt },
          });
          if (cancelled.count !== cancelledUnitIds.length) {
            throw new ApiException(
              409,
              "RESERVATION_ITEM_UNIT_UNAVAILABLE",
              "One or more selected assignments changed before handover completed.",
            );
          }
          cancelledUnitCount += cancelled.count;
        }

        const remainingAssigned = await tx.reservationItemUnit.count({
          where: { reservationItemId: item.id, status: "ASSIGNED" },
        });
        if (remainingAssigned === 0) {
          // Every assigned unit now has a disposition. Cut quantity to what
          // actually left the store room (mirroring the cut approval makes in
          // §7.5); an item where nothing was handed over is CANCELLED, not
          // DELIVERED, so nothing downstream treats it as returnable -- its
          // quantity stays at the approved count, which is what CANCELLED is
          // saying was not delivered.
          const handedOver = await tx.reservationItemUnit.count({
            where: {
              reservationItemId: item.id,
              status: {
                in: [
                  "CHECKED_OUT",
                  "RETURNED_GOOD",
                  "RETURNED_BROKEN",
                  "RETURNED_LOST",
                ],
              },
            },
          });
          await tx.reservationItem.update({
            where: { id: item.id },
            data:
              handedOver > 0
                ? {
                    status: "DELIVERED",
                    quantity: handedOver,
                    checkedOutAt: deliveredAt,
                    checkedOutBy: actor.user.id,
                    updatedAt: deliveredAt,
                  }
                : { status: "CANCELLED", updatedAt: deliveredAt },
          });
          if (handedOver > 0) fullyDeliveredCount += 1;
        } else {
          await tx.reservationItem.update({
            where: { id: item.id },
            data: { updatedAt: deliveredAt },
          });
        }
      }

      // 2. Check if all approved/active items on the manifest are now DELIVERED or RETURNED
      const allItems = await tx.reservationItem.findMany({
        where: { reservationId },
        select: { id: true, status: true },
      });

      const approvedOrActiveItems = allItems.filter(
        (item) =>
          item.status !== "REJECTED" &&
          item.status !== "PENDING" &&
          item.status !== "CANCELLED",
      );

      const allDelivered =
        approvedOrActiveItems.length > 0 &&
        approvedOrActiveItems.every(
          (item) => item.status === "DELIVERED" || item.status === "RETURNED",
        );
      // Nothing left to hand over and nothing was: every line was rejected at
      // approval or cancelled at handover, so the booking itself is off.
      const nothingHandedOver =
        approvedOrActiveItems.length === 0 &&
        allItems.some((item) => item.status === "CANCELLED");

      if (nothingHandedOver) {
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: "CANCELLED", updatedAt: deliveredAt },
        });
      } else if (allDelivered) {
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

      await this.logActivity(tx, {
        reservationId,
        actorId: actor.user.id,
        action: "DELIVERY_CONFIRMED",
        entityType: "RESERVATION",
        entityId: reservationId,
        details: {
          confirmedBy: actor.user.id,
          itemCount: entries.length,
          fullyDeliveredCount,
          cancelledUnitCount,
          units: deliveredUnitsByItem,
        },
      });
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
    await this.runSerializable(async (tx) => {
      await this.lockReservation(tx, reservationId);
      const currentReservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        select: { status: true },
      });
      if (
        !currentReservation ||
        !cancellableStatuses.includes(currentReservation.status)
      ) {
        throw this.invalidStatus(
          "Only draft, pending, or approved reservations before check-out can be cancelled.",
        );
      }
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "CANCELLED",
          updatedAt: cancelledAt,
        },
      });

      // A cancellation releases future schedule rows. AssetUnit.status is a
      // physical state and therefore remains unchanged. Only normalize rows
      // left as RESERVED by a pre-migration backend during the compatibility
      // window.
      const preparedUnits = await tx.reservationItemUnit.findMany({
        where: {
          reservationItem: { reservationId, status: "PREPARED" },
        },
        include: { assetUnit: { select: { status: true } } },
      });
      if (preparedUnits.length > 0) {
        const legacyReservedUnits = preparedUnits.filter(
          (unit) => unit.assetUnit.status === "RESERVED",
        );
        if (legacyReservedUnits.length > 0) {
          const unitIds = legacyReservedUnits.map((unit) => unit.assetUnitId);
          await this.lockAssetUnits(tx, unitIds);
          await tx.assetUnit.updateMany({
            where: { id: { in: unitIds }, status: "RESERVED" },
            data: { status: "ACTIVE", updatedAt: cancelledAt },
          });
          const batchId = randomUUID();
          await tx.assetUnitEventBatch.create({
            data: {
              id: batchId,
              description: "Normalized legacy reservation state",
              performedBy: actor.user.id,
            },
          });
          await tx.assetUnitEvent.createMany({
            data: legacyReservedUnits.map((unit) => ({
              id: randomUUID(),
              batchId,
              assetUnitId: unit.assetUnitId,
              eventType: "ADJUSTMENT",
              fromStatus: "RESERVED",
              toStatus: "ACTIVE",
              reservationItemId: unit.reservationItemId,
              reason: "Reservation cancelled during status migration",
            })),
          });
        }
        await tx.reservationItemUnit.deleteMany({
          where: { id: { in: preparedUnits.map((unit) => unit.id) } },
        });
      }

      await tx.reservationItem.updateMany({
        where: {
          reservationId,
          status: { in: ["PENDING", "PREPARED"] },
        },
        data: {
          status: "REJECTED",
          updatedAt: cancelledAt,
        },
      });
      await this.logActivity(tx, {
        reservationId,
        actorId: actor.user.id,
        action: "RESERVATION_CANCELLED",
        entityType: "RESERVATION",
        entityId: reservationId,
        details: { reason: input?.reason ?? null },
      });
    });
    this.reservationEvents.emitCancelled({
      reservationId,
      requesterId: reservation.requesterId,
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
        ["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(
          reservation.status,
        ) &&
        (this.areaIsPermitted(approveAreaIds, item.asset.managementAreaId) ||
          this.areaIsPermitted(rejectAreaIds, item.asset.managementAreaId)),
    ).length;
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
        (statusCounts.PREPARED ?? 0) +
        (statusCounts.DELIVERED ?? 0) +
        (statusCounts.RETURNED ?? 0),
      rejectedItemCount: statusCounts.REJECTED ?? 0,
      pendingDecisionCount: actionableItems,
      capabilities: {
        canSubmit: canManage && reservation.status === "DRAFT",
        canReview: actionableItems > 0,
        canConfirmDelivery:
          ["APPROVED", "PARTIALLY_APPROVED"].includes(reservation.status) &&
          reservation.items.some(
            (item) =>
              item.status === "PREPARED" &&
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
        status: { in: ["PENDING_APPROVAL", "PARTIALLY_APPROVED"] },
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
    return conditions;
  }

  private approvalHistoryConditions(
    actorId: string,
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
        status: {
          in: [
            "APPROVED",
            "PARTIALLY_APPROVED",
            "DELIVERY_CONFIRMED",
            "RETURN_PENDING",
            "COMPLETED",
            "REJECTED",
          ],
        },
        items: {
          some: {
            approval: { is: { approverId: actorId } },
            ...(decisionAreaIds === null
              ? {}
              : {
                  asset: { managementAreaId: { in: decisionAreaIds } },
                }),
          },
        },
      });
    }
    return conditions;
  }

  private async logActivity(
    tx: Prisma.TransactionClient | PrismaService,
    data: {
      reservationId?: string;
      actorId: string;
      action: string;
      entityType: string;
      entityId?: string;
      details?: Prisma.InputJsonValue;
    },
  ) {
    try {
      await tx.activityLog.create({
        data: {
          id: randomUUID(),
          reservationId: data.reservationId ?? null,
          actorId: data.actorId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId ?? null,
          details: data.details ?? Prisma.JsonNull,
        },
      });
    } catch {
      // Non-blocking activity log
    }
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
    const returns = reservation.returns.map((item) => {
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
        note: item.note,
        returnedAt: item.returnedAt?.toISOString() ?? null,
        returnedBy: item.returnedBy,
        returner: this.userDto(item.returner),
        items: item.items.map((retItem) => ({
          id: retItem.id,
          returnId: retItem.returnId,
          reservationItemId: retItem.reservationItemId,
          assetId: retItem.reservationItem.asset.id,
          assetName: retItem.reservationItem.asset.name,
          managementArea: {
            id: retItem.reservationItem.asset.managementArea.id,
            name: retItem.reservationItem.asset.managementArea.name,
          },
          description: retItem.description,
          pictureUrl: retItem.pictureUrl,
          units: retItem.units.map((unit) => ({
            id: unit.id,
            returnItemId: unit.returnItemId,
            reservationItemUnitId: unit.reservationItemUnitId,
            assetUnitId: unit.reservationItemUnit.assetUnitId,
            serialNumber: unit.reservationItemUnit.assetUnit.serialNumber,
            condition: unit.condition,
            pictureUrl: unit.pictureUrl,
            note: unit.note,
            createdAt: unit.createdAt.toISOString(),
          })),
          createdAt: retItem.createdAt.toISOString(),
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
    });
    const canDecideReturn = returns.some(
      (r) => r.status === "PENDING" && r.capabilities.canApprove,
    );
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
        const units = item.unitAssignments;
        const returnedGoodCount = units.filter(
          (unit) => unit.status === "RETURNED_GOOD",
        ).length;
        const returnedBrokenCount = units.filter(
          (unit) => unit.status === "RETURNED_BROKEN",
        ).length;
        const returnedLostCount = units.filter(
          (unit) => unit.status === "RETURNED_LOST",
        ).length;
        const checkedOutCount = units.filter(
          (unit) => unit.status === "CHECKED_OUT",
        ).length;
        const itemUnitIds = new Set(units.map((unit) => unit.id));
        const pendingReturnCount = reservation.returns
          .flatMap((r) => r.items)
          .flatMap((ri) => ri.units)
          .filter(
            (unit) =>
              unit.condition === null &&
              itemUnitIds.has(unit.reservationItemUnitId),
          ).length;
        const remainingReturnQuantity = Math.max(
          0,
          checkedOutCount - pendingReturnCount,
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
          },
          quantity: item.quantity,
          status: item.status,
          units: units.map((unit) => ({
            id: unit.id,
            assetUnitId: unit.assetUnitId,
            serialNumber: unit.assetUnit.serialNumber,
            status: unit.status,
            assignmentStartAt: unit.assignmentStartAt.toISOString(),
            assignmentEndAt: unit.assignmentEndAt.toISOString(),
          })),
          returnSummary: {
            totalUnits: units.length,
            returnedGoodCount,
            returnedBrokenCount,
            returnedLostCount,
            pendingReturnCount,
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
              ["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(
                reservation.status,
              ) &&
              hasAreaPermission(
                actor,
                "reservation:approve",
                item.asset.managementAreaId,
              ),
            canReject:
              item.status === "PENDING" &&
              ["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(
                reservation.status,
              ) &&
              hasAreaPermission(
                actor,
                "reservation:reject",
                item.asset.managementAreaId,
              ),
            canConfirmDelivery:
              ["APPROVED", "PARTIALLY_APPROVED", "DELIVERY_CONFIRMED"].includes(
                reservation.status,
              ) &&
              item.status === "PREPARED" &&
              this.canConfirmDeliveryItem(actor, reservation, item),
            canReturn:
              ["DELIVERY_CONFIRMED", "RETURN_PENDING"].includes(
                reservation.status,
              ) &&
              item.status !== "REJECTED" &&
              item.status !== "PENDING" &&
              // Cancelled at handover -- nothing left the store room (§7.8).
              item.status !== "CANCELLED" &&
              remainingReturnQuantity > 0,
          },
        };
      }),
      returns,
      capabilities: {
        canSubmit: canManage && reservation.status === "DRAFT",
        canConfirmDelivery:
          ["APPROVED", "PARTIALLY_APPROVED", "DELIVERY_CONFIRMED"].includes(
            reservation.status,
          ) &&
          reservation.items.some(
            (item) =>
              item.status === "PREPARED" &&
              this.canConfirmDeliveryItem(actor, reservation, item),
          ),
        canCancel:
          canManage &&
          [
            "DRAFT",
            "PENDING_APPROVAL",
            "PARTIALLY_APPROVED",
            "APPROVED",
          ].includes(reservation.status),
        canReturn:
          ["DELIVERY_CONFIRMED", "RETURN_PENDING"].includes(
            reservation.status,
          ) &&
          reservation.items.some(
            (item) =>
              item.status !== "REJECTED" &&
              item.status !== "PENDING" &&
              item.status !== "CANCELLED",
          ),
        canDecideReturn,
      },
      activityLogs: (reservation.activityLogs ?? []).map((log: any) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: log.details,
        actor: this.userDto(log.actor),
        createdAt: log.createdAt.toISOString(),
      })),
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
    const totalQuantities = await this.totalUnitQuantities(db, uniqueAssetIds);
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
        unitAssignments: {
          where: {
            status: { in: ACTIVE_ASSIGNMENT_STATUSES },
            assignmentStartAt: { lt: endAt },
            assignmentEndAt: { gt: startAt },
            assetUnit: { status: { in: SCHEDULABLE_ASSET_UNIT_STATUSES } },
          },
          select: { assetUnitId: true },
        },
      },
    });
    const result = new Map<string, Availability>();
    for (const assetId of uniqueAssetIds) {
      const totalQuantity = totalQuantities.get(assetId) ?? 0;
      const approved = overlapping.filter(
        (item) =>
          item.assetId === assetId &&
          allocatedItemStatuses.includes(item.status) &&
          allocatedReservationStatuses.includes(item.reservation.status),
      );
      const pending = overlapping.filter(
        (item) =>
          item.assetId === assetId &&
          item.status === "PENDING" &&
          ["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(
            item.reservation.status,
          ),
      );
      const approvedQuantity = new Set(
        approved.flatMap((item) =>
          item.unitAssignments.map((unit) => unit.assetUnitId),
        ),
      ).size;
      const pendingQuantity = pending.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      result.set(assetId, {
        assetId,
        totalQuantity,
        approvedQuantity,
        pendingQuantity,
        availableQuantity: Math.max(0, totalQuantity - approvedQuantity),
        pendingReservationCount: new Set(
          pending.map((item) => item.reservationId),
        ).size,
      });
    }
    return result;
  }

  private async totalUnitQuantities(db: ReservationDb, assetIds: string[]) {
    const result = new Map<string, number>();
    if (!assetIds.length) return result;
    const rows = await db.assetUnit.groupBy({
      by: ["assetId"],
      // Broken, lost, in-repair, and inactive units are never reservable
      // capacity. RESERVED/CHECKED_OUT units remain part of the schedulable
      // pool because their overlapping reservation is deducted separately.
      where: {
        assetId: { in: assetIds },
        status: { in: ["ACTIVE", "RESERVED", "CHECKED_OUT"] },
      },
      _count: { _all: true },
    });
    for (const row of rows) result.set(row.assetId, row._count._all);
    return result;
  }

  private async assertAvailability(
    db: ReservationDb,
    items: ReadonlyArray<ReservationItemInputDto>,
    assets: ReadonlyArray<{ id: string }>,
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
    const now = new Date(Date.now() - 60_000);
    if (startAt < now) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The reservation start time cannot be in the past.",
        { startAt: "startAt must be in the future." },
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

  private reservationStatusFromItems(statuses: string[]) {
    // Items skip a standalone APPROVED resting state (§7.5 -- approval
    // assigns serial units in the same request), so "approved" is anything
    // that made it past decision: PREPARED, DELIVERED, or RETURNED.
    const approvedLike = ["PREPARED", "DELIVERED", "RETURNED"];
    if (statuses.every((status) => approvedLike.includes(status))) {
      return "APPROVED";
    }
    if (statuses.every((status) => status === "REJECTED")) return "REJECTED";
    if (
      statuses.every(
        (status) => approvedLike.includes(status) || status === "REJECTED",
      )
    ) {
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

    const hasScopedView =
      reservation.items.length === 0
        ? hasGlobalPermission(actor, "reservation:view")
        : reservation.items.some((item) =>
            hasAreaPermission(
              actor,
              "reservation:view",
              item.asset.managementAreaId,
            ),
          );
    if (hasScopedView && reservation.status !== "DRAFT") return;

    // Operational permissions do not grant general cross-user visibility.
    // They only open a detail that is currently actionable in the actor's
    // scoped queue, which the frontend needs in order to make the decision.
    const canDecidePendingItem =
      ["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(reservation.status) &&
      reservation.items.some(
        (item) =>
          item.status === "PENDING" &&
          (hasAreaPermission(
            actor,
            "reservation:approve",
            item.asset.managementAreaId,
          ) ||
            hasAreaPermission(
              actor,
              "reservation:reject",
              item.asset.managementAreaId,
            )),
      );
    const canDecidePendingReturn = reservation.returns.some(
      (returnRecord) =>
        returnRecord.status === "PENDING" &&
        returnRecord.items.some((returnItem) =>
          hasAreaPermission(
            actor,
            "return:approve",
            returnItem.reservationItem.asset.managementAreaId,
          ),
        ),
    );
    const canViewOwnDecisionHistory = reservation.items.some(
      (item) =>
        item.approval?.approverId === actor.user.id &&
        (hasAreaPermission(
          actor,
          "reservation:approve",
          item.asset.managementAreaId,
        ) ||
          hasAreaPermission(
            actor,
            "reservation:reject",
            item.asset.managementAreaId,
          )),
    );
    if (
      !canDecidePendingItem &&
      !canDecidePendingReturn &&
      !canViewOwnDecisionHistory
    ) {
      this.permissionDenied();
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

  private async lockReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "reservations"
      WHERE "id" = ${reservationId}::uuid
      FOR UPDATE
    `;
  }

  private async lockAssetUnits(
    tx: Prisma.TransactionClient,
    assetUnitIds: string[],
  ) {
    for (const assetUnitId of [...new Set(assetUnitIds)].sort()) {
      await tx.$queryRaw`
        SELECT "id"
        FROM "asset_units"
        WHERE "id" = ${assetUnitId}::uuid
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

  private isAssignmentOverlapError(error: unknown): boolean {
    if (this.prismaCode(error) !== "P2004") return false;
    if (typeof error !== "object" || error === null || !("meta" in error)) {
      return false;
    }
    const metadata = JSON.stringify(error.meta);
    return (
      metadata.includes("23P01") ||
      metadata.includes("reservation_item_units_no_overlapping_assignments")
    );
  }

  private userDto(user: {
    id: string;
    email: string | null;
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
