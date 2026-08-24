import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  SCHEDULABLE_ASSET_UNIT_STATUSES,
} from "../common/reservation-allocation.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  assertAreaPermission,
  permittedAreaIds,
} from "./asset-access.js";
import type {
  AssetUnitListQueryDto,
  AssetUnitSearchQueryDto,
  RegisterAssetUnitsDto,
  RetireAssetUnitsDto,
  UpdateAssetUnitStatusDto,
} from "./assets.dto.js";

@Injectable()
export class AssetUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthenticatedActor,
    assetId: string,
    query: AssetUnitListQueryDto,
  ) {
    const asset = await this.findAssetOrThrow(assetId);
    assertAreaPermission(actor, "asset:view", asset.managementAreaId);

    const cursor = decodeCursor(query.cursor);
    const range = this.assignmentRange(query.from, query.to);
    const conditions: Prisma.AssetUnitWhereInput[] = [{ assetId }];
    if (query.status) conditions.push({ status: query.status });
    if (range) {
      conditions.push(
        { status: { in: SCHEDULABLE_ASSET_UNIT_STATUSES } },
        {
          reservationItemUnits: {
            none: {
              status: { in: ACTIVE_ASSIGNMENT_STATUSES },
              assignmentStartAt: { lt: range.endAt },
              assignmentEndAt: { gt: range.startAt },
            },
          },
        },
      );
    }
    if (query.search) {
      conditions.push({
        serialNumber: { contains: query.search, mode: "insensitive" },
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

    const rows = await this.prisma.assetUnit.findMany({
      where: { AND: conditions },
      include: {
        reservationItemUnits: {
          where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((unit) => this.unitDto(unit)),
      pageInfo: page.pageInfo,
    };
  }

  async search(actor: AuthenticatedActor, query: AssetUnitSearchQueryDto) {
    const allowedAreaIds = permittedAreaIds(actor, "asset:view");
    if (allowedAreaIds !== null && allowedAreaIds.length === 0) {
      throw new ApiException(
        403,
        "PERMISSION_DENIED",
        "You do not have permission to view assets.",
      );
    }

    const cursor = decodeCursor(query.cursor);
    const conditions: Prisma.AssetUnitWhereInput[] = [];
    if (allowedAreaIds !== null) {
      conditions.push({ asset: { managementAreaId: { in: allowedAreaIds } } });
    }
    if (query.search) {
      conditions.push({
        serialNumber: { contains: query.search, mode: "insensitive" },
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

    const rows = await this.prisma.assetUnit.findMany({
      where: conditions.length ? { AND: conditions } : {},
      include: {
        asset: { select: { id: true, name: true, partNumber: true } },
        reservationItemUnits: {
          where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((unit) => ({
        ...this.unitDto(unit),
        asset: unit.asset,
      })),
      pageInfo: page.pageInfo,
    };
  }

  async getHistory(actor: AuthenticatedActor, assetUnitId: string) {
    const unit = await this.prisma.assetUnit.findUnique({
      where: { id: assetUnitId },
      include: {
        asset: {
          select: { id: true, name: true, partNumber: true, managementAreaId: true },
        },
        reservationItemUnits: {
          where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!unit)
      throw new ApiException(
        404,
        "ASSET_UNIT_NOT_FOUND",
        "The asset unit was not found.",
      );
    assertAreaPermission(actor, "asset:view", unit.asset.managementAreaId);

    const events = await this.prisma.assetUnitEvent.findMany({
      where: { assetUnitId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        batch: { include: { performer: { include: { profile: true } } } },
      },
    });

    const byEventType: Record<string, number> = {};
    for (const event of events) {
      byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + 1;
    }
    const registeredAt =
      events.find((event) => event.eventType === "REGISTERED")?.createdAt ??
      null;

    return {
      unit: {
        ...this.unitDto(unit),
        asset: {
          id: unit.asset.id,
          name: unit.asset.name,
          partNumber: unit.asset.partNumber,
        },
      },
      stats: {
        total: events.length,
        byEventType,
        registeredAt: registeredAt ? registeredAt.toISOString() : null,
        lastEventAt: events[0] ? events[0].createdAt.toISOString() : null,
      },
      events: events.map((event) => ({
        id: event.id,
        batchId: event.batchId,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
        batchDescription: event.batch.description,
        performedBy: this.userDto(event.batch.performer),
      })),
    };
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

  async register(
    actor: AuthenticatedActor,
    assetId: string,
    input: RegisterAssetUnitsDto,
  ) {
    const asset = await this.findAssetOrThrow(assetId);
    assertAreaPermission(actor, "asset:update", asset.managementAreaId);

    const serialNumbers = [...new Set(input.serialNumbers)];
    if (serialNumbers.length !== input.serialNumbers.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A batch cannot contain duplicate serial numbers.",
        { serialNumbers: "Remove duplicate serial numbers." },
      );
    }

    const prepared = serialNumbers.map((serialNumber) => ({
      id: randomUUID(),
      assetId,
      serialNumber,
      status: "ACTIVE" as const,
    }));

    try {
      const units = await this.runSerializable(async (tx) => {
        await tx.assetUnit.createMany({ data: prepared });
        const batchId = randomUUID();
        await tx.assetUnitEventBatch.create({
          data: {
            id: batchId,
            description: input.reason ?? "Registered new asset units",
            performedBy: actor.user.id,
          },
        });
        await tx.assetUnitEvent.createMany({
          data: prepared.map((unit) => ({
            id: randomUUID(),
            batchId,
            assetUnitId: unit.id,
            eventType: "REGISTERED",
            toStatus: "ACTIVE",
            reason: input.reason ?? null,
          })),
        });
        return tx.assetUnit.findMany({
          where: { id: { in: prepared.map((unit) => unit.id) } },
          orderBy: { serialNumber: "asc" },
        });
      });
      return { data: units.map((unit) => this.unitDto(unit)) };
    } catch (error) {
      this.rethrowUnitWrite(error);
    }
  }

  async retire(actor: AuthenticatedActor, input: RetireAssetUnitsDto) {
    const ids = input.items.map((item) => item.assetUnitId);
    this.assertUniqueIds(ids);
    const units = await this.prisma.assetUnit.findMany({
      where: { id: { in: ids } },
      include: { asset: { select: { managementAreaId: true } } },
    });
    if (units.length !== ids.length) {
      throw new ApiException(
        404,
        "ASSET_UNIT_NOT_FOUND",
        "One or more asset units were not found.",
      );
    }
    for (const unit of units) {
      assertAreaPermission(actor, "asset:update", unit.asset.managementAreaId);
    }

    const sorted = [...units].sort((a, b) => a.id.localeCompare(b.id));
    await this.runSerializable(async (tx) => {
      await this.lockAssetUnits(
        tx,
        sorted.map((unit) => unit.id),
      );
      const scheduledUnit = await tx.reservationItemUnit.findFirst({
        where: {
          assetUnitId: { in: ids },
          status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        },
        select: { assetUnitId: true },
      });
      if (scheduledUnit) {
        throw new ApiException(
          409,
          "ASSET_UNIT_IN_USE",
          "Cannot retire a unit that has an active current or future assignment.",
        );
      }
      const batchId = randomUUID();
      await tx.assetUnitEventBatch.create({
        data: {
          id: batchId,
          description: input.reason ?? "Retired asset units",
          performedBy: actor.user.id,
        },
      });
      for (const unit of sorted) {
        const requested = input.items.find(
          (item) => item.assetUnitId === unit.id,
        )!;
        const result = await tx.assetUnit.updateMany({
          where: {
            id: unit.id,
            updatedAt: new Date(requested.expectedUpdatedAt),
            status: { notIn: ["RESERVED", "CHECKED_OUT"] },
          },
          data: { status: "INACTIVE", updatedAt: new Date() },
        });
        if (!result.count) {
          const stillExists = await tx.assetUnit.findUnique({
            where: { id: unit.id },
            select: { status: true },
          });
          if (
            stillExists &&
            ["RESERVED", "CHECKED_OUT"].includes(stillExists.status)
          ) {
            throw new ApiException(
              409,
              "ASSET_UNIT_IN_USE",
              "Cannot retire a unit that is currently reserved or checked out.",
            );
          }
          this.staleWrite();
        }
        await tx.assetUnitEvent.create({
          data: {
            id: randomUUID(),
            batchId,
            assetUnitId: unit.id,
            eventType: "RETIRED",
            fromStatus: unit.status,
            toStatus: "INACTIVE",
            reason: input.reason ?? null,
          },
        });
      }
    });
    return { data: ids.map((id) => ({ id, status: "INACTIVE" as const })) };
  }

  async updateStatus(
    actor: AuthenticatedActor,
    assetUnitId: string,
    input: UpdateAssetUnitStatusDto,
  ) {
    const unit = await this.prisma.assetUnit.findUnique({
      where: { id: assetUnitId },
      include: { asset: { select: { managementAreaId: true } } },
    });
    if (!unit)
      throw new ApiException(
        404,
        "ASSET_UNIT_NOT_FOUND",
        "The asset unit was not found.",
      );
    assertAreaPermission(actor, "asset:update", unit.asset.managementAreaId);
    if (["RESERVED", "CHECKED_OUT"].includes(unit.status)) {
      throw new ApiException(
        409,
        "ASSET_UNIT_IN_USE",
        "Cannot change status of a unit that is currently reserved or checked out.",
      );
    }

    await this.runSerializable(async (tx) => {
      await this.lockAssetUnits(tx, [assetUnitId]);
      if (input.status === "INACTIVE") {
        const scheduledUnit = await tx.reservationItemUnit.findFirst({
          where: {
            assetUnitId,
            status: { in: ACTIVE_ASSIGNMENT_STATUSES },
          },
          select: { id: true },
        });
        if (scheduledUnit) {
          throw new ApiException(
            409,
            "ASSET_UNIT_IN_USE",
            "Cannot deactivate a unit that has an active current or future assignment.",
          );
        }
      }
      const result = await tx.assetUnit.updateMany({
        where: {
          id: assetUnitId,
          updatedAt: new Date(input.expectedUpdatedAt),
          status: { notIn: ["RESERVED", "CHECKED_OUT"] },
        },
        data: { status: input.status, updatedAt: new Date() },
      });
      if (!result.count) this.staleWrite();
      const batchId = randomUUID();
      await tx.assetUnitEventBatch.create({
        data: {
          id: batchId,
          description: input.reason ?? null,
          performedBy: actor.user.id,
        },
      });
      await tx.assetUnitEvent.create({
        data: {
          id: randomUUID(),
          batchId,
          assetUnitId,
          eventType:
            input.status === "ACTIVE" && unit.status !== "ACTIVE"
              ? "REACTIVATED"
              : "ADJUSTMENT",
          fromStatus: unit.status,
          toStatus: input.status,
          reason: input.reason ?? null,
        },
      });
    });
    const updated = await this.prisma.assetUnit.findUniqueOrThrow({
      where: { id: assetUnitId },
      include: {
        reservationItemUnits: {
          where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          select: { id: true },
          take: 1,
        },
      },
    });
    return this.unitDto(updated);
  }

  private async findAssetOrThrow(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, managementAreaId: true },
    });
    if (!asset)
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "The asset was not found.",
      );
    return asset;
  }

  private assignmentRange(from?: string, to?: string) {
    if (Boolean(from) !== Boolean(to)) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "Both from and to are required for schedule-aware unit availability.",
        {
          from: "Set both ends of the assignment range.",
          to: "Set both ends of the assignment range.",
        },
      );
    }
    if (!from || !to) return undefined;
    const startAt = new Date(from);
    const endAt = new Date(to);
    if (endAt <= startAt) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The assignment end time must be later than the start time.",
        { to: "Choose a time later than from." },
      );
    }
    return { startAt, endAt };
  }

  private assertUniqueIds(ids: string[]) {
    if (new Set(ids).size !== ids.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A batch cannot contain duplicate asset units.",
        { items: "Remove duplicate asset unit entries." },
      );
    }
  }

  private unitDto(unit: {
    id: string;
    assetId: string;
    serialNumber: string;
    status: string;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    reservationItemUnits?: Array<{ id: string }>;
  }) {
    return {
      id: unit.id,
      assetId: unit.assetId,
      serialNumber: unit.serialNumber,
      status: unit.status,
      hasActiveAssignment: Boolean(unit.reservationItemUnits?.length),
      note: unit.note,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    };
  }

  private staleWrite(): never {
    throw new ApiException(
      409,
      "STALE_WRITE",
      "The asset unit has changed since it was loaded.",
    );
  }

  private rethrowUnitWrite(error: unknown): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ApiException(
        409,
        "SERIAL_NUMBER_ALREADY_EXISTS",
        "One or more serial numbers are already registered.",
      );
    }
    throw error;
  }

  private async lockAssetUnits(
    tx: Prisma.TransactionClient,
    assetUnitIds: string[],
  ) {
    const sortedIds = [...new Set(assetUnitIds)].sort();
    if (sortedIds.length === 0) return;
    await tx.$queryRaw`
      SELECT "id"
      FROM "asset_units"
      WHERE "id" IN (${Prisma.join(sortedIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "id"
      FOR UPDATE
    `;
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
    throw new Error("Unreachable asset unit transaction state.");
  }

  private prismaCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return undefined;
    }
    return typeof error.code === "string" ? error.code : undefined;
  }
}
