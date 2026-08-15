import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { SearchPaginationQueryDto } from "../common/dto.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
import type {
  CreateManagementAreaDto,
  UpdateManagementAreaDto,
} from "./management-areas.dto.js";

@Injectable()
export class ManagementAreasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SearchPaginationQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const conditions: Prisma.ManagementAreaWhereInput[] = [];
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
    const rows = await this.prisma.managementArea.findMany({
      where: conditions.length ? { AND: conditions } : {},
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((area) => ({
        id: area.id,
        name: area.name,
        description: area.description,
        createdAt: area.createdAt.toISOString(),
        updatedAt: area.updatedAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async get(id: string) {
    const area = await this.prisma.managementArea.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assets: true,
            userRoles: true,
          },
        },
      },
    });
    if (!area) {
      throw new NotFoundException(`Management area not found.`);
    }
    return {
      id: area.id,
      name: area.name,
      description: area.description,
      assetCount: area._count.assets,
      userRoleCount: area._count.userRoles,
      createdAt: area.createdAt.toISOString(),
      updatedAt: area.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateManagementAreaDto) {
    const existing = await this.prisma.managementArea.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Management area "${dto.name}" already exists.`,
      );
    }
    const now = new Date();
    const created = await this.prisma.managementArea.create({
      data: {
        id: randomUUID(),
        name: dto.name,
        description: dto.description || null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return {
      id: created.id,
      name: created.name,
      description: created.description,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async update(id: string, dto: UpdateManagementAreaDto) {
    const existing = await this.prisma.managementArea.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Management area not found.`);
    }
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.managementArea.findUnique({
        where: { name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException(
          `Management area "${dto.name}" already exists.`,
        );
      }
    }
    const updated = await this.prisma.managementArea.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description || null }
          : {}),
        updatedAt: new Date(),
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async delete(id: string) {
    const existing = await this.prisma.managementArea.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assets: true,
            userRoles: true,
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Management area not found.`);
    }
    if (existing._count.assets > 0) {
      throw new BadRequestException(
        `Cannot delete management area with ${existing._count.assets} active assets.`,
      );
    }
    await this.prisma.managementArea.delete({
      where: { id },
    });
    return { success: true, id };
  }
}
