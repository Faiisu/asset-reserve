import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { normalizePermissions } from "../access-control/permissions.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
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
  assetTemplate: true,
  managementArea: true,
  createdBy: { include: { profile: true } },
} satisfies Prisma.AssetInclude;

const allocatedItemStatuses = ["APPROVED", "PREPARED", "CHECKED_OUT"];
const allocatedReservationStatuses = [
  "PARTIALLY_APPROVED",
  "APPROVED",
  "ACTIVE",
];

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
    if (query.templateId)
      conditions.push({ assetTemplateId: query.templateId });
    if (query.isActive !== undefined)
      conditions.push({ isActive: query.isActive });
    if (query.search) {
      conditions.push({
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
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
    const allocated = await this.allocatedQuantities(
      page.data.map((asset) => asset.id),
      availabilityRange,
    );
    return {
      data: page.data.map((asset) =>
        this.assetDto(actor, asset, allocated.get(asset.id) ?? 0),
      ),
      pageInfo: page.pageInfo,
    };
  }

  async get(actor: AuthenticatedActor, assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        ...assetInclude,
        assetTransactions: {
          take: 50,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            batch: { include: { performer: { include: { profile: true } } } },
          },
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

    const allocatedQuantity = asset.reservationItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const editableByRoles = await this.editableRoleNames();
    return {
      ...this.assetDto(actor, asset, allocatedQuantity),
      editPolicy: {
        permission: "asset:update",
        roles: editableByRoles,
      },
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
      inventoryLedger: asset.assetTransactions.map((transaction) => ({
        id: transaction.id,
        batchId: transaction.batchId,
        transactionType: transaction.transactionType,
        quantityDelta: transaction.quantityDelta,
        reason: transaction.reason,
        createdAt: transaction.createdAt.toISOString(),
        batchDescription: transaction.batch.description,
        performedBy: this.userDto(transaction.batch.performer),
      })),
    };
  }

  async create(actor: AuthenticatedActor, input: CreateAssetDto) {
    const result = await this.createBatch(actor, {
      items: [input],
      description: "Initial asset inventory",
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
      assetTemplateId: item.assetTemplateId ?? null,
      managementAreaId: item.managementAreaId,
      createdById: actor.user.id,
      name: item.name,
      description: item.description ?? null,
      pictureUrl: item.pictureUrl ?? null,
      totalQuantity: item.totalQuantity,
      isActive: item.isActive ?? true,
    }));
    try {
      const rows = await this.prisma.$transaction(
        async (tx) => {
          await tx.asset.createMany({ data: prepared });
          const inventoryItems = prepared.filter(
            (item) => item.totalQuantity > 0,
          );
          if (inventoryItems.length) {
            const batchId = randomUUID();
            await tx.assetTransactionBatch.create({
              data: {
                id: batchId,
                description: input.description ?? "Initial asset inventory",
                performedBy: actor.user.id,
              },
            });
            await tx.assetTransaction.createMany({
              data: inventoryItems.map((item) => ({
                id: randomUUID(),
                batchId,
                assetId: item.id,
                transactionType: "ADD",
                quantityDelta: item.totalQuantity,
                reason: "Opening quantity",
              })),
            });
          }
          return tx.asset.findMany({
            where: { id: { in: prepared.map((item) => item.id) } },
            include: assetInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      const byId = new Map(rows.map((asset) => [asset.id, asset] as const));
      return {
        data: prepared.map((item) =>
          this.assetDto(actor, byId.get(item.id)!, 0),
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
        assetTemplateId:
          input.assetTemplateId === undefined
            ? current.assetTemplateId
            : input.assetTemplateId,
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
          ...(input.assetTemplateId !== undefined
            ? { assetTemplateId: input.assetTemplateId }
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
      data: { isActive: input.status === "ACTIVE", updatedAt: new Date() },
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

  private async allocatedQuantities(
    assetIds: string[],
    range?: { startAt: Date; endAt: Date },
  ) {
    if (!assetIds.length) return new Map<string, number>();
    const rows = await this.prisma.reservationItem.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assetIds },
        status: { in: allocatedItemStatuses },
        reservation: {
          status: { in: allocatedReservationStatuses },
          ...(range
            ? {
                startAt: { lt: range.endAt },
                endAt: { gt: range.startAt },
              }
            : {}),
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
    const allocated = await this.allocatedQuantities([assetId]);
    return this.assetDto(actor, asset, allocated.get(assetId) ?? 0);
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
      assetTemplateId?: string | null;
    }>,
  ) {
    const areaIds = [...new Set(items.map((item) => item.managementAreaId))];
    const templateIds = [
      ...new Set(
        items.flatMap((item) =>
          item.assetTemplateId ? [item.assetTemplateId] : [],
        ),
      ),
    ];
    const [areas, templates] = await Promise.all([
      this.prisma.managementArea.findMany({
        where: { id: { in: areaIds } },
        select: { id: true },
      }),
      templateIds.length
        ? this.prisma.assetTemplate.findMany({
            where: { id: { in: templateIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    if (areas.length !== areaIds.length) {
      throw new ApiException(
        404,
        "MANAGEMENT_AREA_NOT_FOUND",
        "One or more management areas were not found.",
      );
    }
    if (templates.length !== templateIds.length) {
      throw new ApiException(
        404,
        "ASSET_TEMPLATE_NOT_FOUND",
        "One or more asset templates were not found.",
      );
    }
  }

  private assertUniqueAssetInputs(items: CreateAssetDto[]) {
    const keys = items.map(
      (item) => `${item.managementAreaId}\u0000${item.name}`,
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
    allocatedQuantity: number,
  ) {
    return {
      id: asset.id,
      name: asset.name,
      description: asset.description,
      pictureUrl: asset.pictureUrl,
      totalQuantity: asset.totalQuantity,
      allocatedQuantity,
      availableQuantity: Math.max(asset.totalQuantity - allocatedQuantity, 0),
      isActive: asset.isActive,
      status: asset.isActive ? ("ACTIVE" as const) : ("INACTIVE" as const),
      assetTemplate: asset.assetTemplate
        ? {
            id: asset.assetTemplate.id,
            name: asset.assetTemplate.name,
            description: asset.assetTemplate.description,
          }
        : null,
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
        canAdjustQuantity: hasAreaPermission(
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
