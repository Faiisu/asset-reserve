import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { type PermissionKey } from "../access-control/permissions.js";
import {
  hasAreaPermission,
  hasGlobalPermission,
} from "../assets/asset-access.js";
import { ApiException } from "../common/api-exception.js";
import { ReservationLifecycleEvents } from "../common/reservation-lifecycle.events.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  CreateReturnDto,
  ReturnDecisionDto,
  ReturnListQueryDto,
} from "./returns.dto.js";

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
              assetTemplate: true,
            },
          },
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
          { reservation: { eventName: { contains: search, mode: "insensitive" } } },
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

    const where: Prisma.ReturnWhereInput = conditions.length
      ? { AND: conditions }
      : {};

    const rows = await this.prisma.return.findMany({
      where,
      include: returnDetailInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
    });

    const hasNextPage = rows.length > limit;
    const data = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage ? data[data.length - 1]?.id ?? null : null;

    return {
      data: data.map((record) => this.returnDto(actor, record)),
      pageInfo: { nextCursor, hasNextPage },
    };
  }

  async get(actor: AuthenticatedActor, returnId: string) {
    const record = await this.prisma.return.findUnique({
      where: { id: returnId },
      include: returnDetailInclude,
    });
    if (!record) {
      throw new ApiException(404, "RETURN_NOT_FOUND", "The return was not found.");
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
        items: {
          include: {
            asset: true,
            returnItems: {
              include: {
                return: { include: { approval: true } },
              },
            },
          },
        },
      },
    });

    if (!reservation) {
      throw new ApiException(
        404,
        "RESERVATION_NOT_FOUND",
        "The reservation was not found.",
      );
    }

    const allowedReservationStatuses = [
      "DELIVERY_CONFIRMED",
      "ACTIVE",
      "RETURN",
      "RETURN_PENDING",
      "RETURN_CONFIRMED",
      "COMPLETED",
    ];
    if (!allowedReservationStatuses.includes(reservation.status)) {
      throw new ApiException(
        409,
        "INVALID_STATUS",
        `Cannot create return for a reservation with status ${reservation.status}.`,
      );
    }

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

    const returnId = randomUUID();
    const now = new Date();

    // Validate return lines
    const itemMap = new Map(reservation.items.map((item) => [item.id, item]));

    for (let i = 0; i < input.items.length; i += 1) {
      const line = input.items[i]!;
      const item = itemMap.get(line.reservationItemId);
      if (!item) {
        throw new ApiException(
          404,
          "RESERVATION_ITEM_NOT_FOUND",
          `Reservation item ${line.reservationItemId} not found in this reservation.`,
          { [`items.${i}.reservationItemId`]: "Item not found in reservation." },
        );
      }

      if (item.status === "REJECTED" || item.status === "PENDING") {
        throw new ApiException(
          409,
          "INVALID_ITEM_STATUS",
          `Cannot return item in status ${item.status}.`,
          { [`items.${i}.reservationItemId`]: `Item is ${item.status}.` },
        );
      }

      const lineTotal =
        (line.quantityReturned ?? 0) +
        (line.quantityBroken ?? 0) +
        (line.quantityLost ?? 0);

      if (lineTotal <= 0) {
        throw new ApiException(
          422,
          "VALIDATION_ERROR",
          "Total return quantity (returned + broken + lost) must be greater than 0.",
          { [`items.${i}.quantityReturned`]: "Quantity must be at least 1." },
        );
      }

      // Calculate existing approved and pending counts
      let approvedReturnedOrBroken = 0;
      let approvedLost = 0;
      let pendingReturnedOrBroken = 0;
      let pendingLost = 0;

      for (const returnItem of item.returnItems) {
        const retStatus = returnItem.return.status;
        const appStatus = returnItem.return.approval?.status;
        if (
          retStatus === "COMPLETED" ||
          retStatus === "APPROVED" ||
          appStatus === "APPROVED"
        ) {
          approvedReturnedOrBroken +=
            returnItem.quantityReturned + returnItem.quantityBroken;
          approvedLost += returnItem.quantityLost;
        } else if (
          (retStatus === "PENDING" || appStatus === "PENDING") &&
          retStatus !== "REJECTED" &&
          appStatus !== "REJECTED"
        ) {
          pendingReturnedOrBroken +=
            returnItem.quantityReturned + returnItem.quantityBroken;
          pendingLost += returnItem.quantityLost;
        }
      }

      const maxReturnableIntactOrBroken = Math.max(
        0,
        item.quantity - (approvedReturnedOrBroken + pendingReturnedOrBroken),
      );

      const maxReportableLost = Math.max(
        0,
        item.quantity -
          (approvedReturnedOrBroken +
            approvedLost +
            pendingReturnedOrBroken +
            pendingLost),
      );

      const returnedOrBrokenRequested =
        (line.quantityReturned ?? 0) + (line.quantityBroken ?? 0);
      const lostRequested = line.quantityLost ?? 0;

      if (lostRequested > maxReportableLost) {
        throw new ApiException(
          409,
          "EXCEEDS_UNRETURNED_QUANTITY",
          `Lost quantity (${lostRequested}) exceeds unreturned units available to report lost (${maxReportableLost}).`,
          {
            [`items.${i}.quantityLost`]: `Only ${maxReportableLost} unit(s) can be newly reported lost.`,
          },
        );
      }

      if (returnedOrBrokenRequested > maxReturnableIntactOrBroken) {
        throw new ApiException(
          409,
          "EXCEEDS_UNRETURNED_QUANTITY",
          `Return quantity (${returnedOrBrokenRequested}) exceeds remaining unreturned quantity (${maxReturnableIntactOrBroken}).`,
          {
            [`items.${i}.quantityReturned`]: `Only ${maxReturnableIntactOrBroken} unit(s) remaining to return.`,
          },
        );
      }

      if (lineTotal > maxReturnableIntactOrBroken) {
        throw new ApiException(
          409,
          "EXCEEDS_UNRETURNED_QUANTITY",
          `Total return quantity (${lineTotal}) exceeds allowable remaining units (${maxReturnableIntactOrBroken}).`,
          {
            [`items.${i}.quantityReturned`]: `Only ${maxReturnableIntactOrBroken} unit(s) remaining to return.`,
          },
        );
      }
    }

    await this.runSerializable(async (tx) => {
      await tx.return.create({
        data: {
          id: returnId,
          reservationId,
          returnedBy: actor.user.id,
          status: "PENDING",
          returnedAt: now,
          items: {
            create: input.items.map((line) => ({
              id: randomUUID(),
              reservationItemId: line.reservationItemId,
              quantityReturned: line.quantityReturned ?? 0,
              quantityBroken: line.quantityBroken ?? 0,
              quantityLost: line.quantityLost ?? 0,
              description: line.description ?? input.note ?? null,
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
    });

    if (input.immediateApprove) {
      // Check if actor has return:approve for all areas
      const canImmediateApprove = input.items.every((line) => {
        const item = itemMap.get(line.reservationItemId)!;
        return hasAreaPermission(
          actor,
          "return:approve",
          item.asset.managementAreaId,
        );
      });

      if (canImmediateApprove) {
        return this.decide(actor, reservationId, returnId, {
          decision: "APPROVE",
          description: input.note ?? "Approved upon return recording.",
        });
      }
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
            items: {
              include: {
                asset: true,
              },
            },
          },
        },
        items: {
          include: {
            reservationItem: {
              include: {
                asset: true,
              },
            },
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

    // Check area-scoped permission for every asset in this return
    for (const returnItem of returnRecord.items) {
      this.assertArea(
        actor,
        "return:approve",
        returnItem.reservationItem.asset.managementAreaId,
      );
    }

    // Validate condition breakdown before processing decision
    if (input.decision === "APPROVE" && input.items && input.items.length > 0) {
      for (const [index, itemInput] of input.items.entries()) {
        const line = returnRecord.items.find(
          (it) => it.reservationItemId === itemInput.reservationItemId,
        );
        if (line) {
          const good = itemInput.quantityReturned ?? 0;
          const broken = itemInput.quantityBroken ?? 0;
          const lost = itemInput.quantityLost ?? 0;

          if (good < 0 || broken < 0 || lost < 0) {
            throw new ApiException(
              422,
              "VALIDATION_ERROR",
              "Inspected quantities cannot be negative.",
            );
          }

          const maxAllowed = line.quantityReturned;
          const totalInspected = good + broken + lost;
          if (totalInspected > maxAllowed) {
            const assetName = line.reservationItem?.asset?.name ?? "asset";
            throw new ApiException(
              422,
              "VALIDATION_ERROR",
              `Total inspected units (${totalInspected}) cannot exceed the returned quantity of ${maxAllowed} for ${assetName}.`,
              {
                [`items.${index}`]: `Good (${good}) + Broken (${broken}) + Lost (${lost}) = ${totalInspected} exceeds returned limit of ${maxAllowed}.`,
              },
            );
          }
        }
      }
    }

    const decidedAt = new Date();

    await this.runSerializable(async (tx) => {
      if (input.decision === "APPROVE") {
        // 1. Update Return status to COMPLETED
        await tx.return.update({
          where: { id: returnId },
          data: {
            status: "COMPLETED",
            updatedAt: decidedAt,
          },
        });

        // 1.1 Update item quantities during decision
        if (input.items && input.items.length > 0) {
          for (const itemInput of input.items) {
            const line = returnRecord.items.find(
              (it) => it.reservationItemId === itemInput.reservationItemId,
            );
            if (line) {
              line.quantityReturned = itemInput.quantityReturned ?? 0;
              line.quantityBroken = itemInput.quantityBroken ?? 0;
              line.quantityLost = itemInput.quantityLost ?? 0;
              if (itemInput.description !== undefined) {
                line.description = itemInput.description;
              }
              await tx.returnItem.update({
                where: { id: line.id },
                data: {
                  quantityReturned: line.quantityReturned,
                  quantityBroken: line.quantityBroken,
                  quantityLost: line.quantityLost,
                  description: line.description,
                },
              });
            }
          }
        }

        // 2. Update or create ReturnApproval
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

        // 3. Create inventory transactions batch
        const batchId = randomUUID();
        await tx.assetTransactionBatch.create({
          data: {
            id: batchId,
            description: `Return confirmed for "${returnRecord.reservation.eventName}"`,
            performedBy: actor.user.id,
          },
        });

        for (const line of returnRecord.items) {
          const assetId = line.reservationItem.assetId;

          // Check if this return recovers previously lost units
          const otherApprovedReturns = await tx.returnItem.findMany({
            where: {
              reservationItemId: line.reservationItemId,
              return: { status: { in: ["APPROVED", "COMPLETED"] } },
              id: { not: line.id },
            },
          });
          const priorLost = otherApprovedReturns.reduce(
            (sum, r) => sum + r.quantityLost,
            0,
          );
          const priorReturnedOrBroken = otherApprovedReturns.reduce(
            (sum, r) => sum + r.quantityReturned + r.quantityBroken,
            0,
          );
          const itemTotalQuantity = line.reservationItem.quantity;
          const priorNetLost = Math.max(
            0,
            priorLost -
              Math.max(
                0,
                priorReturnedOrBroken - (itemTotalQuantity - priorLost),
              ),
          );

          const returnedOrBrokenThisLine =
            line.quantityReturned + line.quantityBroken;
          const recoveredFromLost = Math.min(
            priorNetLost,
            returnedOrBrokenThisLine,
          );

          if (recoveredFromLost > 0) {
            // Restore totalQuantity for recovered units that were previously decremented
            await tx.asset.update({
              where: { id: assetId },
              data: {
                totalQuantity: { increment: recoveredFromLost },
                updatedAt: decidedAt,
              },
            });
          }

          if (line.quantityReturned > 0) {
            await tx.assetTransaction.create({
              data: {
                id: randomUUID(),
                batchId,
                assetId,
                transactionType: "RETURN",
                quantityDelta: recoveredFromLost > 0 ? recoveredFromLost : 0,
                reason:
                  line.description ??
                  (recoveredFromLost > 0
                    ? `Returned intact (recovered ${recoveredFromLost} previously lost unit)`
                    : "Returned intact"),
              },
            });
          }

          if (line.quantityBroken > 0) {
            await tx.assetTransaction.create({
              data: {
                id: randomUUID(),
                batchId,
                assetId,
                transactionType: "BROKEN",
                quantityDelta: -line.quantityBroken,
                reason: line.description ?? "Returned damaged/broken",
              },
            });

            // Decrement totalQuantity for broken asset from available pool
            await tx.asset.update({
              where: { id: assetId },
              data: {
                totalQuantity: { decrement: line.quantityBroken },
                updatedAt: decidedAt,
              },
            });
          }

          if (line.quantityLost > 0) {
            await tx.assetTransaction.create({
              data: {
                id: randomUUID(),
                batchId,
                assetId,
                transactionType: "LOST",
                quantityDelta: -line.quantityLost,
                reason: line.description ?? "Missing / lost during return",
              },
            });

            // Decrement totalQuantity for lost asset
            await tx.asset.update({
              where: { id: assetId },
              data: {
                totalQuantity: { decrement: line.quantityLost },
                updatedAt: decidedAt,
              },
            });
          }
        }

        // 4. Update ReservationItem statuses if fully returned
        for (const item of returnRecord.reservation.items) {
          const approvedReturnItems = await tx.returnItem.findMany({
            where: {
              reservationItemId: item.id,
              return: { status: { in: ["APPROVED", "COMPLETED"] } },
            },
          });

          const totalReturned = approvedReturnItems.reduce(
            (sum, r) =>
              sum + r.quantityReturned + r.quantityBroken + r.quantityLost,
            0,
          );

          if (totalReturned >= item.quantity && item.status !== "RETURNED") {
            await tx.reservationItem.update({
              where: { id: item.id },
              data: {
                status: "RETURNED",
                updatedAt: decidedAt,
              },
            });
          }
        }

        // 5. Update Reservation status if all approved items are RETURNED
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
            data: {
              status: "COMPLETED",
              updatedAt: decidedAt,
            },
          });
        }
      } else {
        // REJECT decision
        await tx.return.update({
          where: { id: returnId },
          data: {
            status: "REJECTED",
            updatedAt: decidedAt,
          },
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
      }
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
      returnedAt: record.returnedAt?.toISOString() ?? null,
      returnedBy: this.userDto(record.returner),
      reservation: {
        id: record.reservation.id,
        eventName: record.reservation.eventName,
        requester: this.userDto(record.reservation.requester),
      },
      items: record.items.map((item) => ({
        id: item.id,
        reservationItemId: item.reservationItemId,
        assetId: item.reservationItem.asset.id,
        assetName: item.reservationItem.asset.name,
        managementArea: {
          id: item.reservationItem.asset.managementArea.id,
          name: item.reservationItem.asset.managementArea.name,
        },
        quantityReturned: item.quantityReturned,
        quantityBroken: item.quantityBroken,
        quantityLost: item.quantityLost,
        description: item.description,
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
}
