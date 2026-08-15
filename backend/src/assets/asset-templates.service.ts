import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import type { SearchPaginationQueryDto } from "../common/dto.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
import { assertAnyPermission, assertAreaPermission } from "./asset-access.js";
import type {
  CreateAssetTemplateDto,
  SaveAssetAsTemplateDto,
  UpdateAssetTemplateDto,
} from "./assets.dto.js";

@Injectable()
export class AssetTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedActor, query: SearchPaginationQueryDto) {
    assertAnyPermission(actor, "asset:view");
    const cursor = decodeCursor(query.cursor);
    const rows = await this.prisma.assetTemplate.findMany({
      where: {
        AND: [
          ...(query.search
            ? [
                {
                  OR: [
                    {
                      name: {
                        contains: query.search,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      description: {
                        contains: query.search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ]
            : []),
          ...(cursor
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(cursor.createdAt) } },
                    {
                      createdAt: new Date(cursor.createdAt),
                      id: { lt: cursor.id },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((template) => this.templateDto(template)),
      pageInfo: page.pageInfo,
    };
  }

  async create(actor: AuthenticatedActor, input: CreateAssetTemplateDto) {
    assertAnyPermission(actor, "asset:create");
    return this.createRecord(input.name, input.description ?? null);
  }

  async saveFromAsset(
    actor: AuthenticatedActor,
    assetId: string,
    input: SaveAssetAsTemplateDto = {},
  ) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: {
        name: true,
        description: true,
        managementAreaId: true,
      },
    });
    if (!asset)
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "The asset was not found.",
      );
    assertAreaPermission(actor, "asset:create", asset.managementAreaId);
    return this.createRecord(
      input.name ?? asset.name,
      input.description === undefined ? asset.description : input.description,
    );
  }

  async update(
    actor: AuthenticatedActor,
    templateId: string,
    input: UpdateAssetTemplateDto,
  ) {
    assertAnyPermission(actor, "asset:update");
    if (input.name === undefined && input.description === undefined) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "At least one editable field is required.",
      );
    }
    const existing = await this.prisma.assetTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!existing) {
      throw new ApiException(
        404,
        "ASSET_TEMPLATE_NOT_FOUND",
        "The asset template was not found.",
      );
    }
    try {
      const result = await this.prisma.assetTemplate.updateMany({
        where: {
          id: templateId,
          updatedAt: new Date(input.expectedUpdatedAt),
        },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          updatedAt: new Date(),
        },
      });
      if (!result.count) {
        throw new ApiException(
          409,
          "STALE_WRITE",
          "The asset template has changed since it was loaded.",
        );
      }
      return this.templateDto(
        await this.prisma.assetTemplate.findUniqueOrThrow({
          where: { id: templateId },
        }),
      );
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  private async createRecord(name: string, description: string | null) {
    try {
      return this.templateDto(
        await this.prisma.assetTemplate.create({
          data: { id: randomUUID(), name, description },
        }),
      );
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  private templateDto(template: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    };
  }

  private rethrowUnique(error: unknown): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ApiException(
        409,
        "ASSET_TEMPLATE_NAME_ALREADY_EXISTS",
        "An asset template with this name already exists.",
      );
    }
    throw error;
  }
}
