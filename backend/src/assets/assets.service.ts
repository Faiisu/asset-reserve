import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { normalizePermissions } from "../access-control/permissions.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  HARD_ALLOCATION_ITEM_STATUSES,
  HARD_ALLOCATION_RESERVATION_STATUSES,
} from "../common/reservation-allocation.js";
import {
  assertAreaPermission,
  hasAreaPermission,
  permittedAreaIds,
} from "./asset-access.js";
import type {
  AssetListQueryDto,
  BatchCreateAssetsDto,
  BatchRemoveAssetsDto,
  CreateAssetDto,
  UpdateAssetDto,
  UpdateAssetStatusDto,
} from "./assets.dto.js";

const assetInclude = {
  managementArea: true,
  createdBy: { include: { profile: true } },
} satisfies Prisma.AssetInclude;

const allocatedItemStatuses = HARD_ALLOCATION_ITEM_STATUSES;
const allocatedReservationStatuses = HARD_ALLOCATION_RESERVATION_STATUSES;

type UnitCounts = {
  total: number;
  active: number;
  reserved: number;
  checkedOut: number;
  broken: number;
  lost: number;
  inRepair: number;
  inactive: number;
};

const emptyUnitCounts = (): UnitCounts => ({
  total: 0,
  active: 0,
  reserved: 0,
  checkedOut: 0,
  broken: 0,
  lost: 0,
  inRepair: 0,
  inactive: 0,
});

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, query: AssetListQueryDto) {
    const availabilityRange = this.availabilityRange(query.from, query.to);
    const allowedAreaIds = permittedAreaIds(actor, "asset:view");
    if (allowedAreaIds !== null && allowedAreaIds.length === 0) {
      throw new ApiException(
        403,
        "PERMISSION_DENIED",
        "You do not have permission to view assets.",
      );
    }
    if (
      query.areaId &&
      allowedAreaIds !== null &&
      !allowedAreaIds.includes(query.areaId)
    ) {
      throw new ApiException(
        403,
        "PERMISSION_DENIED",
        "You do not have permission in the requested management area.",
      );
    }

    const cursor = decodeCursor(query.cursor);
    const conditions: Prisma.AssetWhereInput[] = [];
    if (allowedAreaIds !== null) {
      conditions.push({ managementAreaId: { in: allowedAreaIds } });
    }
    if (query.areaId) conditions.push({ managementAreaId: query.areaId });
    if (query.isActive !== undefined)
      conditions.push({ isActive: query.isActive });
    if (query.search) {
      conditions.push({
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
          { partNumber: { contains: query.search, mode: "insensitive" } },
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

    const rows = await this.prisma.asset.findMany({
      where: conditions.length ? { AND: conditions } : {},
      include: assetInclude,
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    const assetIds = page.data.map((asset) => asset.id);
    const [unitCountsById, allocated] = await Promise.all([
      this.unitCounts(assetIds),
      this.allocatedQuantities(assetIds, availabilityRange),
    ]);
    return {
      data: page.data.map((asset) =>
        this.assetDto(
          actor,
          asset,
          unitCountsById.get(asset.id) ?? emptyUnitCounts(),
          allocated.get(asset.id) ?? 0,
        ),
      ),
      pageInfo: page.pageInfo,
    };
  }

  async get(actor: AuthenticatedActor, assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        ...assetInclude,
        units: {
          orderBy: [{ serialNumber: "asc" }],
          take: 500,
        },
        reservationItems: {
          where: {
            status: { in: allocatedItemStatuses },
            reservation: { status: { in: allocatedReservationStatuses } },
          },
          include: { reservation: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!asset)
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "The asset was not found.",
      );
    assertAreaPermission(actor, "asset:view", asset.managementAreaId);

    const events = await this.prisma.assetUnitEvent.findMany({
      where: { assetUnit: { assetId } },
      take: 50,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        assetUnit: { select: { id: true, serialNumber: true } },
        batch: { include: { performer: { include: { profile: true } } } },
      },
    });

    const allocatedQuantity = asset.reservationItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const editableByRoles = await this.editableRoleNames();
    return {
      ...this.assetDto(
        actor,
        asset,
        this.countUnits(asset.units),
        allocatedQuantity,
      ),
      editPolicy: {
        permission: "asset:update",
        roles: editableByRoles,
      },
      units: asset.units.map((unit) => ({
        id: unit.id,
        serialNumber: unit.serialNumber,
        status: unit.status,
        note: unit.note,
        createdAt: unit.createdAt.toISOString(),
        updatedAt: unit.updatedAt.toISOString(),
      })),
      activeReservationItems: asset.reservationItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        status: item.status,
        reservation: {
          id: item.reservation.id,
          eventName: item.reservation.eventName,
          status: item.reservation.status,
          startAt: item.reservation.startAt.toISOString(),
          endAt: item.reservation.endAt.toISOString(),
        },
      })),
      unitEventLedger: events.map((event) => ({
        id: event.id,
        batchId: event.batchId,
        assetUnitId: event.assetUnitId,
        serialNumber: event.assetUnit.serialNumber,
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

  async create(actor: AuthenticatedActor, input: CreateAssetDto) {
    const result = await this.createBatch(actor, {
      items: [input],
      description: "Initial asset catalog entry",
    });
    return result.data[0];
  }

  async createBatch(actor: AuthenticatedActor, input: BatchCreateAssetsDto) {
    this.assertUniqueAssetInputs(input.items);
    for (const item of input.items) {
      assertAreaPermission(actor, "asset:create", item.managementAreaId);
    }
    await this.assertReferences(input.items);

    const prepared = input.items.map((item) => ({
      id: randomUUID(),
      managementAreaId: item.managementAreaId,
      createdById: actor.user.id,
      name: item.name,
      partNumber: item.partNumber ?? null,
      description: item.description ?? null,
      pictureUrl: item.pictureUrl ?? null,
      isActive: item.isActive ?? true,
    }));
    try {
      await this.prisma.asset.createMany({ data: prepared });
      const rows = await this.prisma.asset.findMany({
        where: { id: { in: prepared.map((item) => item.id) } },
        include: assetInclude,
      });
      const byId = new Map(rows.map((asset) => [asset.id, asset] as const));
      return {
        data: prepared.map((item) =>
          this.assetDto(actor, byId.get(item.id)!, emptyUnitCounts(), 0),
        ),
      };
    } catch (error) {
      this.rethrowAssetWrite(error);
    }
  }

  async update(
    actor: AuthenticatedActor,
    assetId: string,
    input: UpdateAssetDto,
  ) {
    const current = await this.findAssetOrThrow(assetId);
    assertAreaPermission(actor, "asset:update", current.managementAreaId);
    if (input.managementAreaId) {
      assertAreaPermission(actor, "asset:update", input.managementAreaId);
    }
    const editableValues = Object.entries(input).filter(
      ([key, value]) => key !== "expectedUpdatedAt" && value !== undefined,
    );
    if (!editableValues.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "At least one editable field is required.",
      );
    }
    await this.assertReferences([
      {
        managementAreaId: input.managementAreaId ?? current.managementAreaId,
      },
    ]);
    try {
      const result = await this.prisma.asset.updateMany({
        where: {
          id: assetId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.managementAreaId !== undefined
            ? { managementAreaId: input.managementAreaId }
            : {}),
          ...(input.partNumber !== undefined
            ? { partNumber: input.partNumber }
            : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.pictureUrl !== undefined
            ? { pictureUrl: input.pictureUrl }
            : {}),
          updatedAt: new Date(),
        },
      });
      if (!result.count) this.staleWrite();
      return this.getSummary(actor, assetId);
    } catch (error) {
      this.rethrowAssetWrite(error);
    }
  }

  async updateStatus(
    actor: AuthenticatedActor,
    assetId: string,
    input: UpdateAssetStatusDto,
  ) {
    const current = await this.findAssetOrThrow(assetId);
    assertAreaPermission(
      actor,
      input.status === "INACTIVE" ? "asset:delete" : "asset:update",
      current.managementAreaId,
    );
    const result = await this.prisma.asset.updateMany({
      where: { id: assetId, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        isActive: input.status === "ACTIVE",
        updatedAt: new Date(),
      },
    });
    if (!result.count) this.staleWrite();
    return this.getSummary(actor, assetId);
  }

  async deactivate(actor: AuthenticatedActor, assetId: string) {
    const current = await this.findAssetOrThrow(assetId);
    assertAreaPermission(actor, "asset:delete", current.managementAreaId);
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { isActive: false, updatedAt: new Date() },
    });
    return this.getSummary(actor, assetId);
  }

  async deactivateBatch(
    actor: AuthenticatedActor,
    input: BatchRemoveAssetsDto,
  ) {
    const ids = input.items.map((item) => item.assetId);
    this.assertUniqueIds(ids, "items");
    const current = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      orderBy: { id: "asc" },
    });
    if (current.length !== ids.length) {
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "One or more assets were not found.",
      );
    }
    for (const asset of current) {
      assertAreaPermission(actor, "asset:delete", asset.managementAreaId);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const asset of current) {
        const requested = input.items.find(
          (item) => item.assetId === asset.id,
        )!;
        const result = await tx.asset.updateMany({
          where: {
            id: asset.id,
            updatedAt: new Date(requested.expectedUpdatedAt),
          },
          data: { isActive: false, updatedAt: new Date() },
        });
        if (!result.count) this.staleWrite();
      }
    });
    return { data: ids.map((id) => ({ id, status: "INACTIVE" as const })) };
  }

  private countUnits(
    units: ReadonlyArray<{ status: string }>,
  ): UnitCounts {
    const counts = emptyUnitCounts();
    for (const unit of units) {
      switch (unit.status) {
        case "ACTIVE":
          counts.active += 1;
          break;
        case "RESERVED":
          counts.reserved += 1;
          break;
        case "CHECKED_OUT":
          counts.checkedOut += 1;
          break;
        case "BROKEN":
          counts.broken += 1;
          break;
        case "LOST":
          counts.lost += 1;
          break;
        case "IN_REPAIR":
          counts.inRepair += 1;
          break;
        case "INACTIVE":
          counts.inactive += 1;
          break;
      }
      if (unit.status !== "INACTIVE") counts.total += 1;
    }
    return counts;
  }

  private async unitCounts(assetIds: string[]) {
    const result = new Map<string, UnitCounts>();
    if (!assetIds.length) return result;
    const rows = await this.prisma.assetUnit.groupBy({
      by: ["assetId", "status"],
      where: { assetId: { in: assetIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      const counts = result.get(row.assetId) ?? emptyUnitCounts();
      const count = row._count._all;
      switch (row.status) {
        case "ACTIVE":
          counts.active += count;
          break;
        case "RESERVED":
          counts.reserved += count;
          break;
        case "CHECKED_OUT":
          counts.checkedOut += count;
          break;
        case "BROKEN":
          counts.broken += count;
          break;
        case "LOST":
          counts.lost += count;
          break;
        case "IN_REPAIR":
          counts.inRepair += count;
          break;
        case "INACTIVE":
          counts.inactive += count;
          break;
      }
      if (row.status !== "INACTIVE") counts.total += count;
      result.set(row.assetId, counts);
    }
    return result;
  }

  private async allocatedQuantities(
    assetIds: string[],
    range?: { startAt: Date; endAt: Date },
  ) {
    if (!assetIds.length || !range) return new Map<string, number>();
    const rows = await this.prisma.reservationItem.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assetIds },
        status: { in: allocatedItemStatuses },
        reservation: {
          status: { in: allocatedReservationStatuses },
          startAt: { lt: range.endAt },
          endAt: { gt: range.startAt },
        },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.map((row) => [row.assetId, row._sum.quantity ?? 0] as const),
    );
  }

  private availabilityRange(from?: string, to?: string) {
    if (Boolean(from) !== Boolean(to)) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "Both from and to are required for time-based availability.",
        {
          from: "Set both ends of the availability range.",
          to: "Set both ends of the availability range.",
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
        "The availability end time must be later than the start time.",
        { to: "Choose a time later than from." },
      );
    }
    return { startAt, endAt };
  }

  private async getSummary(actor: AuthenticatedActor, assetId: string) {
    const asset = await this.prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      include: assetInclude,
    });
    const [unitCountsById, allocated] = await Promise.all([
      this.unitCounts([assetId]),
      this.allocatedQuantities([assetId]),
    ]);
    return this.assetDto(
      actor,
      asset,
      unitCountsById.get(assetId) ?? emptyUnitCounts(),
      allocated.get(assetId) ?? 0,
    );
  }

  private async editableRoleNames() {
    const roles = await this.prisma.role.findMany({ orderBy: { name: "asc" } });
    return roles
      .filter((role) =>
        normalizePermissions(role.permissions).includes("asset:update"),
      )
      .map((role) => role.name);
  }

  private async findAssetOrThrow(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });
    if (!asset)
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "The asset was not found.",
      );
    return asset;
  }

  private async assertReferences(
    items: Array<{
      managementAreaId: string;
    }>,
  ) {
    const areaIds = [...new Set(items.map((item) => item.managementAreaId))];
    const areas = await this.prisma.managementArea.findMany({
      where: { id: { in: areaIds } },
      select: { id: true },
    });
    if (areas.length !== areaIds.length) {
      throw new ApiException(
        404,
        "MANAGEMENT_AREA_NOT_FOUND",
        "One or more management areas were not found.",
      );
    }
  }

  private assertUniqueAssetInputs(items: CreateAssetDto[]) {
    const keys = items.map(
      (item) => `${item.managementAreaId} ${item.name}`,
    );
    this.assertUniqueIds(keys, "items");
  }

  private assertUniqueIds(ids: string[], field: string) {
    if (new Set(ids).size !== ids.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A batch cannot contain duplicate assets.",
        { [field]: "Remove duplicate asset entries." },
      );
    }
  }

  private assetDto(
    actor: AuthenticatedActor,
    asset: Prisma.AssetGetPayload<{ include: typeof assetInclude }>,
    unitCounts: UnitCounts,
    allocatedQuantity: number,
  ) {
    const availableQuantity = Math.max(
      unitCounts.active - allocatedQuantity,
      0,
    );
    return {
      id: asset.id,
      name: asset.name,
      partNumber: asset.partNumber,
      description: asset.description,
      pictureUrl: asset.pictureUrl,
      totalQuantity: unitCounts.total,
      allocatedQuantity,
      availableQuantity,
      unitCounts,
      isActive: asset.isActive,
      managementArea: {
        id: asset.managementArea.id,
        name: asset.managementArea.name,
      },
      owner: asset.createdBy ? this.userDto(asset.createdBy) : null,
      capabilities: {
        canEdit: hasAreaPermission(
          actor,
          "asset:update",
          asset.managementAreaId,
        ),
        canDeactivate: hasAreaPermission(
          actor,
          "asset:delete",
          asset.managementAreaId,
        ),
        canManageUnits: hasAreaPermission(
          actor,
          "asset:update",
          asset.managementAreaId,
        ),
      },
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
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

  private staleWrite(): never {
    throw new ApiException(
      409,
      "STALE_WRITE",
      "The asset has changed since it was loaded.",
    );
  }

  private rethrowAssetWrite(error: unknown): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ApiException(
        409,
        "ASSET_NAME_ALREADY_EXISTS",
        "An asset with this name already exists in the management area.",
      );
    }
    throw error;
  }
}
