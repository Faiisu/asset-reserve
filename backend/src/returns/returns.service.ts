import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { type PermissionKey } from "../access-control/permissions.js";
import {
  hasAreaPermission,
  hasGlobalPermission,
} from "../assets/asset-access.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { ReservationLifecycleEvents } from "../common/reservation-lifecycle.events.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  CreateReturnDto,
  ReturnDecisionDto,
  ReturnListQueryDto,
} from "./returns.dto.js";

const assetUnitStatusByCondition: Record<"GOOD" | "BROKEN" | "LOST", string> = {
  GOOD: "ACTIVE",
  BROKEN: "BROKEN",
  LOST: "LOST",
};

const returnDetailInclude = {
  returner: { include: { profile: true } },
  reservation: {
    include: {
      requester: { include: { profile: true } },
      participants: { include: { user: { include: { profile: true } } } },
    },
  },
  items: {
    include: {
      reservationItem: {
        include: {
          asset: {
            include: {
              managementArea: true,
            },
          },
        },
      },
      units: {
        include: {
          reservationItemUnit: { include: { assetUnit: true } },
        },
      },
    },
  },
  approval: {
    include: {
      approver: { include: { profile: true } },
    },
  },
} satisfies Prisma.ReturnInclude;

type ReturnDetailRecord = Prisma.ReturnGetPayload<{
  include: typeof returnDetailInclude;
}>;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationEvents: ReservationLifecycleEvents,
  ) {}

  async list(actor: AuthenticatedActor, query: ReturnListQueryDto) {
    const limit = Math.min(query.limit ?? 20, 100);
    const cursor = decodeCursor(query.cursor);
    const conditions: Prisma.ReturnWhereInput[] = [];

    if (query.view === "APPROVALS") {
      const approveAreaIds = this.areaIdsForPermission(actor, "return:approve");
      if (approveAreaIds !== null && approveAreaIds.length === 0) {
        return { data: [], pageInfo: { nextCursor: null, hasNextPage: false } };
      }
      conditions.push({
        status: query.status ?? "PENDING",
        items: {
          some: {
            reservationItem: {
              asset: {
                ...(approveAreaIds !== null
                  ? { managementAreaId: { in: approveAreaIds } }
                  : {}),
              },
            },
          },
        },
      });
    } else if (query.view === "MINE") {
      conditions.push({
        OR: [
          { returnedBy: actor.user.id },
          { reservation: { requesterId: actor.user.id } },
          {
            reservation: {
              participants: { some: { userId: actor.user.id } },
            },
          },
        ],
      });
      if (query.status) conditions.push({ status: query.status });
    } else {
      // ALL view - requires permission
      const hasView =
        hasGlobalPermission(actor, "return:approve") ||
        hasGlobalPermission(actor, "reservation:approve");
      if (!hasView) {
        const approveAreaIds = this.areaIdsForPermission(
          actor,
          "return:approve",
        );
        if (approveAreaIds !== null && approveAreaIds.length === 0) {
          conditions.push({
            OR: [
              { returnedBy: actor.user.id },
              { reservation: { requesterId: actor.user.id } },
            ],
          });
        } else if (approveAreaIds !== null) {
          conditions.push({
            OR: [
              { returnedBy: actor.user.id },
              { reservation: { requesterId: actor.user.id } },
              {
                items: {
                  some: {
                    reservationItem: {
                      asset: { managementAreaId: { in: approveAreaIds } },
                    },
                  },
                },
              },
            ],
          });
        }
      }
      if (query.status) conditions.push({ status: query.status });
    }

    if (query.areaId) {
      conditions.push({
        items: {
          some: {
            reservationItem: {
              asset: { managementAreaId: query.areaId },
            },
          },
        },
      });
    }

    if (query.reservationId) {
      conditions.push({ reservationId: query.reservationId });
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      conditions.push({
        OR: [
          {
            reservation: {
              eventName: { contains: search, mode: "insensitive" },
            },
          },
          {
            items: {
              some: {
                reservationItem: {
                  asset: { name: { contains: search, mode: "insensitive" } },
                },
              },
            },
          },
        ],
      });
    }

    if (cursor) {
      conditions.push({
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      });
    }

    const where: Prisma.ReturnWhereInput = conditions.length
      ? { AND: conditions }
      : {};

    const rows = await this.prisma.return.findMany({
      where,
      include: returnDetailInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = pageInfo(rows, limit);

    return {
      data: page.data.map((record) => this.returnDto(actor, record)),
      pageInfo: page.pageInfo,
    };
  }

  async get(actor: AuthenticatedActor, returnId: string) {
    const record = await this.prisma.return.findUnique({
      where: { id: returnId },
      include: returnDetailInclude,
    });
    if (!record) {
      throw new ApiException(
        404,
        "RETURN_NOT_FOUND",
        "The return was not found.",
      );
    }
    return this.returnDto(actor, record);
  }

  async create(
    actor: AuthenticatedActor,
    reservationId: string,
    input: CreateReturnDto,
  ) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        requester: { include: { profile: true } },
        participants: true,
        items: { include: { asset: true } },
      },
    });

    if (!reservation) {
      throw new ApiException(
        404,
        "RESERVATION_NOT_FOUND",
        "The reservation was not found.",
      );
    }

    const canEnterReturnFlow = [
      "DELIVERY_CONFIRMED",
      "RETURN_PENDING",
    ].includes(reservation.status);
    if (!canEnterReturnFlow) {
      throw new ApiException(
        409,
        "INVALID_STATUS",
        `Cannot create return for a reservation with status ${reservation.status}.`,
      );
    }
    // No lower time bound: an event that wraps up early hands its equipment
    // back early. What is returnable is decided per unit below -- a unit has
    // to be CHECKED_OUT, which already means it physically went out.

    const isRequester = reservation.requesterId === actor.user.id;
    const isParticipant = reservation.participants.some(
      (p) => p.userId === actor.user.id,
    );
    const hasAreaApprovalPermission = reservation.items.some((item) =>
      hasAreaPermission(actor, "return:approve", item.asset.managementAreaId),
    );

    if (!isRequester && !isParticipant && !hasAreaApprovalPermission) {
      throw new ApiException(
        403,
        "INSUFFICIENT_PERMISSIONS",
        "You do not have permission to initiate returns for this reservation.",
      );
    }

    const itemMap = new Map(reservation.items.map((item) => [item.id, item]));

    for (let i = 0; i < input.items.length; i += 1) {
      const line = input.items[i]!;
      const item = itemMap.get(line.reservationItemId);
      if (!item) {
        throw new ApiException(
          404,
          "RESERVATION_ITEM_NOT_FOUND",
          `Reservation item ${line.reservationItemId} not found in this reservation.`,
          {
            [`items.${i}.reservationItemId`]: "Item not found in reservation.",
          },
        );
      }
      if (["REJECTED", "PENDING"].includes(item.status)) {
        throw new ApiException(
          409,
          "INVALID_ITEM_STATUS",
          `Cannot return item in status ${item.status}.`,
          { [`items.${i}.reservationItemId`]: `Item is ${item.status}.` },
        );
      }
    }

    const allUnitIds = input.items.flatMap(
      (line) => line.reservationItemUnitIds,
    );
    if (new Set(allUnitIds).size !== allUnitIds.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A return cannot list the same unit twice.",
        { items: "Remove duplicate asset units." },
      );
    }

    const units = await this.prisma.reservationItemUnit.findMany({
      where: { id: { in: allUnitIds } },
      include: { returnItemUnit: true },
    });
    const unitsById = new Map(units.map((unit) => [unit.id, unit] as const));

    for (let i = 0; i < input.items.length; i += 1) {
      const line = input.items[i]!;
      for (const unitId of line.reservationItemUnitIds) {
        const unit = unitsById.get(unitId);
        if (!unit) {
          throw new ApiException(
            404,
            "ASSET_UNIT_NOT_FOUND",
            `Reservation item unit ${unitId} was not found.`,
            { [`items.${i}.reservationItemUnitIds`]: "Unit not found." },
          );
        }
        if (unit.reservationItemId !== line.reservationItemId) {
          throw new ApiException(
            400,
            "INVALID_UNIT_SELECTION",
            `Unit ${unitId} does not belong to reservation item ${line.reservationItemId}.`,
            {
              [`items.${i}.reservationItemUnitIds`]:
                "Unit belongs to a different item.",
            },
          );
        }
        if (unit.status !== "CHECKED_OUT") {
          throw new ApiException(
            409,
            "INVALID_UNIT_STATUS",
            `Unit ${unitId} is not checked out (status: ${unit.status}).`,
            {
              [`items.${i}.reservationItemUnitIds`]: "Unit is not checked out.",
            },
          );
        }
        if (unit.returnItemUnit) {
          throw new ApiException(
            409,
            "UNIT_ALREADY_CLAIMED",
            `Unit ${unitId} is already part of another return.`,
            {
              [`items.${i}.reservationItemUnitIds`]:
                "Unit already submitted for return.",
            },
          );
        }
      }
    }

    const returnId = randomUUID();
    const now = new Date();

    try {
      await this.runSerializable(async (tx) => {
        await tx.return.create({
          data: {
            id: returnId,
            reservationId,
            returnedBy: actor.user.id,
            status: "PENDING",
            note: input.note ?? null,
            returnedAt: now,
            items: {
              create: input.items.map((line) => ({
                id: randomUUID(),
                reservationItemId: line.reservationItemId,
                description: line.description ?? null,
                units: {
                  create: line.reservationItemUnitIds.map((unitId) => ({
                    id: randomUUID(),
                    reservationItemUnitId: unitId,
                    condition: null,
                  })),
                },
              })),
            },
            approval: {
              create: {
                id: randomUUID(),
                approverId: actor.user.id,
                status: "PENDING",
                description: null,
              },
            },
          },
        });

        if (reservation.status === "DELIVERY_CONFIRMED") {
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: "RETURN_PENDING", updatedAt: now },
          });
        }

        await this.logActivity(tx, {
          reservationId,
          actorId: actor.user.id,
          action: "RETURN_SUBMITTED",
          entityType: "RETURN",
          entityId: returnId,
          details: { itemCount: input.items.length },
        });
      });
    } catch (error) {
      if (this.prismaCode(error) === "P2002") {
        throw new ApiException(
          409,
          "UNIT_ALREADY_CLAIMED",
          "One or more selected units are already part of another return.",
        );
      }
      throw error;
    }

    return this.get(actor, returnId);
  }

  async decide(
    actor: AuthenticatedActor,
    reservationId: string,
    returnId: string,
    input: ReturnDecisionDto,
  ) {
    const returnRecord = await this.prisma.return.findFirst({
      where: { id: returnId, reservationId },
      include: {
        reservation: {
          include: {
            items: { include: { asset: true } },
          },
        },
        items: {
          include: {
            reservationItem: { include: { asset: true } },
            units: { include: { reservationItemUnit: true } },
          },
        },
        approval: true,
      },
    });

    if (!returnRecord) {
      throw new ApiException(
        404,
        "RETURN_NOT_FOUND",
        "The return record was not found.",
      );
    }

    if (returnRecord.status !== "PENDING") {
      throw new ApiException(
        409,
        "INVALID_STATUS",
        `This return has already been decided (status: ${returnRecord.status}).`,
      );
    }

    for (const returnItem of returnRecord.items) {
      this.assertArea(
        actor,
        "return:approve",
        returnItem.reservationItem.asset.managementAreaId,
      );
    }

    const conditionByUnitId = new Map<
      string,
      {
        condition: "GOOD" | "BROKEN" | "LOST";
      }
    >();
    if (input.decision === "APPROVE") {
      const allUnitIds = new Set(
        returnRecord.items.flatMap((item) =>
          item.units.map((u) => u.reservationItemUnitId),
        ),
      );
      for (const line of input.items ?? []) {
        for (const unit of line.units ?? []) {
          if (!allUnitIds.has(unit.reservationItemUnitId)) {
            throw new ApiException(
              400,
              "INVALID_UNIT_SELECTION",
              `Unit ${unit.reservationItemUnitId} is not part of this return.`,
            );
          }
          conditionByUnitId.set(unit.reservationItemUnitId, {
            condition: unit.condition,
          });
        }
      }
      // Per docs/software_spec/business-rules-and-validation.md §3 (Return):
      // the decision must specify a condition per unit -- no silent default.
      if (conditionByUnitId.size !== allUnitIds.size) {
        throw new ApiException(
          400,
          "MISSING_UNIT_CONDITION",
          "Every serial unit in this return must have a condition (GOOD/BROKEN/LOST) before it can be approved.",
        );
      }
    }

    const decidedAt = new Date();

    await this.runSerializable(async (tx) => {
      if (input.decision === "APPROVE") {
        await tx.return.update({
          where: { id: returnId },
          data: { status: "COMPLETED", updatedAt: decidedAt },
        });

        if (input.items) {
          for (const line of input.items) {
            if (line.description === undefined) continue;
            const returnItem = returnRecord.items.find(
              (item) => item.reservationItemId === line.reservationItemId,
            );
            if (!returnItem) continue;
            await tx.returnItem.update({
              where: { id: returnItem.id },
              data: { description: line.description },
            });
          }
        }

        await tx.returnApproval.upsert({
          where: { returnId },
          create: {
            id: randomUUID(),
            returnId,
            approverId: actor.user.id,
            status: "APPROVED",
            description: input.description ?? null,
            decidedAt,
          },
          update: {
            approverId: actor.user.id,
            status: "APPROVED",
            description: input.description ?? null,
            decidedAt,
          },
        });

        const batchId = randomUUID();
        let batchCreated = false;
        for (const returnItem of returnRecord.items) {
          for (const unit of returnItem.units) {
            const decision = conditionByUnitId.get(
              unit.reservationItemUnitId,
            ) ?? { condition: "GOOD" as const };
            const assetUnitStatus =
              assetUnitStatusByCondition[decision.condition];

            await tx.returnItemUnit.update({
              where: { id: unit.id },
              data: {
                condition: decision.condition,
              },
            });
            await tx.reservationItemUnit.update({
              where: { id: unit.reservationItemUnitId },
              data: {
                status: `RETURNED_${decision.condition}`,
                returnedAt: decidedAt,
              },
            });
            await tx.assetUnit.update({
              where: { id: unit.reservationItemUnit.assetUnitId },
              data: { status: assetUnitStatus, updatedAt: decidedAt },
            });

            if (!batchCreated) {
              await tx.assetUnitEventBatch.create({
                data: {
                  id: batchId,
                  description: `Return confirmed for "${returnRecord.reservation.eventName}"`,
                  performedBy: actor.user.id,
                },
              });
              batchCreated = true;
            }
            await tx.assetUnitEvent.create({
              data: {
                id: randomUUID(),
                batchId,
                assetUnitId: unit.reservationItemUnit.assetUnitId,
                eventType: `RETURNED_${decision.condition}`,
                fromStatus: "CHECKED_OUT",
                toStatus: assetUnitStatus,
                reservationItemId: returnItem.reservationItemId,
              },
            });
          }
        }

        for (const item of returnRecord.reservation.items) {
          const allUnits = await tx.reservationItemUnit.findMany({
            where: { reservationItemId: item.id },
            select: { status: true },
          });
          const allTerminal =
            allUnits.length > 0 &&
            allUnits.every((unit) => unit.status.startsWith("RETURNED_"));
          if (allTerminal && item.status !== "RETURNED") {
            await tx.reservationItem.update({
              where: { id: item.id },
              data: { status: "RETURNED", updatedAt: decidedAt },
            });
          }
        }

        const currentItems = await tx.reservationItem.findMany({
          where: { reservationId },
        });
        const activeOrApprovedItems = currentItems.filter(
          (item) => item.status !== "REJECTED",
        );
        const allReturned =
          activeOrApprovedItems.length > 0 &&
          activeOrApprovedItems.every((item) => item.status === "RETURNED");
        if (allReturned) {
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: "COMPLETED", updatedAt: decidedAt },
          });
        } else {
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: "DELIVERY_CONFIRMED", updatedAt: decidedAt },
          });
        }
      } else {
        // REJECT: free the claimed units so they can be resubmitted in a
        // later return -- they were never mutated at submission time, so
        // there's nothing else to undo.
        await tx.returnItemUnit.deleteMany({
          where: {
            returnItemId: { in: returnRecord.items.map((item) => item.id) },
          },
        });
        await tx.return.update({
          where: { id: returnId },
          data: { status: "REJECTED", updatedAt: decidedAt },
        });
        await tx.returnApproval.upsert({
          where: { returnId },
          create: {
            id: randomUUID(),
            returnId,
            approverId: actor.user.id,
            status: "REJECTED",
            description: input.description ?? null,
            decidedAt,
          },
          update: {
            approverId: actor.user.id,
            status: "REJECTED",
            description: input.description ?? null,
            decidedAt,
          },
        });

        if (returnRecord.reservation.status === "RETURN_PENDING") {
          const otherPendingReturns = await tx.return.count({
            where: {
              reservationId,
              status: "PENDING",
              id: { not: returnId },
            },
          });
          if (otherPendingReturns === 0) {
            await tx.reservation.update({
              where: { id: reservationId },
              data: { status: "DELIVERY_CONFIRMED", updatedAt: decidedAt },
            });
          }
        }
      }

      await this.logActivity(tx, {
        reservationId,
        actorId: actor.user.id,
        action:
          input.decision === "APPROVE" ? "RETURN_APPROVED" : "RETURN_REJECTED",
        entityType: "RETURN",
        entityId: returnId,
        details: { description: input.description ?? null },
      });
    });

    const detail = await this.get(actor, returnId);
    this.reservationEvents.emitReturnDecided({
      reservationId,
      returnId,
      eventName: detail.reservation.eventName,
      decision: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
      requester: {
        email: detail.reservation.requester.email,
        name: detail.reservation.requester.name ?? "A user",
      },
    });
    return detail;
  }

  private returnDto(actor: AuthenticatedActor, record: ReturnDetailRecord) {
    const canApprove =
      record.status === "PENDING" &&
      record.items.every((item) =>
        hasAreaPermission(
          actor,
          "return:approve",
          item.reservationItem.asset.managementAreaId,
        ),
      );

    return {
      id: record.id,
      reservationId: record.reservationId,
      status: record.status,
      note: record.note,
      returnedAt: record.returnedAt?.toISOString() ?? null,
      returnedBy: record.returnedBy,
      returner: this.userDto(record.returner),
      reservation: {
        id: record.reservation.id,
        eventName: record.reservation.eventName,
        requester: this.userDto(record.reservation.requester),
      },
      items: record.items.map((item) => ({
        id: item.id,
        returnId: item.returnId,
        reservationItemId: item.reservationItemId,
        assetId: item.reservationItem.asset.id,
        assetName: item.reservationItem.asset.name,
        managementArea: {
          id: item.reservationItem.asset.managementArea.id,
          name: item.reservationItem.asset.managementArea.name,
        },
        description: item.description,
        pictureUrl: item.pictureUrl,
        units: item.units.map((unit) => ({
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
        createdAt: item.createdAt.toISOString(),
      })),
      approval: record.approval
        ? {
            id: record.approval.id,
            status: record.approval.status,
            description: record.approval.description,
            decidedAt: record.approval.decidedAt?.toISOString() ?? null,
            approver: this.userDto(record.approval.approver),
          }
        : null,
      capabilities: {
        canApprove,
        canReject: canApprove,
      },
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private areaIdsForPermission(
    actor: AuthenticatedActor,
    permission: PermissionKey,
  ): string[] | null {
    if (hasGlobalPermission(actor, permission)) return null;
    return actor.effectivePermissions.byManagementArea
      .filter((entry) => entry.permissions.includes(permission))
      .map((entry) => entry.managementAreaId);
  }

  private assertArea(
    actor: AuthenticatedActor,
    permission: PermissionKey,
    managementAreaId: string,
  ) {
    if (!hasAreaPermission(actor, permission, managementAreaId)) {
      throw new ApiException(
        403,
        "INSUFFICIENT_PERMISSIONS",
        `You do not have the ${permission} permission for this management area.`,
      );
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
    throw new Error("Unreachable return transaction state.");
  }

  private prismaCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return undefined;
    }
    return typeof error.code === "string" ? error.code : undefined;
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
}
