import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import type { SearchPaginationQueryDto } from "../common/dto.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";

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
}
