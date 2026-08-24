import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import { decodeCursor, pageInfo } from "../common/pagination.js";
import { PrismaService } from "../database/prisma.service.js";
import type { PaginationQueryDto, SearchPaginationQueryDto } from "../common/dto.js";

const REPUTATION_MIN = 0;
const REPUTATION_MAX = 100;
const REPUTATION_DELTA = 5;

export type ReturnUnitCondition = "GOOD" | "BROKEN" | "LOST";

@Injectable()
export class ReputationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies reputation deltas for one just-approved return -- called from
   * inside ReturnsService.decide()'s existing transaction (same `tx`
   * client), never on its own, so reputation changes commit atomically
   * with the return decision itself.
   *
   * Every responsible person -- the reservation's requester and every
   * participant, deduped -- gets the same deltas: +-5 for on-time/late
   * (decidedAt vs. the reservation's overall endAt, not a per-unit
   * schedule), and -5 for each unit that came back broken or lost. One
   * ReputationEvent row is written per person per effect (the audit trail
   * "user behavior" views read from), then User.reputation is updated once
   * per person with a single clamped atomic increment via raw SQL --
   * avoids a read-modify-write race entirely (on top of the surrounding
   * SERIALIZABLE transaction already covering it).
   */
  async recordReturnOutcome(
    tx: Prisma.TransactionClient,
    params: {
      reservationId: string;
      returnId: string;
      decidedAt: Date;
      reservationEndAt: Date;
      affectedUserIds: Iterable<string>;
      unitConditions: ReturnUnitCondition[];
    },
  ): Promise<void> {
    const { reservationId, returnId, decidedAt, reservationEndAt, unitConditions } = params;
    const userIds = [...new Set(params.affectedUserIds)];
    if (userIds.length === 0) return;

    const isLate = decidedAt > reservationEndAt;
    const brokenOrLost = unitConditions.filter(
      (condition) => condition === "BROKEN" || condition === "LOST",
    );
    const events: Array<{ type: string; delta: number }> = [
      {
        type: isLate ? "RETURN_LATE" : "RETURN_ON_TIME",
        delta: isLate ? -REPUTATION_DELTA : REPUTATION_DELTA,
      },
      ...brokenOrLost.map((condition) => ({
        type: condition === "BROKEN" ? "ASSET_BROKEN" : "ASSET_LOST",
        delta: -REPUTATION_DELTA,
      })),
    ];
    const totalDelta = events.reduce((sum, event) => sum + event.delta, 0);

    for (const userId of userIds) {
      for (const event of events) {
        await tx.reputationEvent.create({
          data: {
            id: randomUUID(),
            userId,
            reservationId,
            returnId,
            type: event.type,
            delta: event.delta,
            createdAt: decidedAt,
          },
        });
      }
      await tx.$executeRaw`UPDATE "users" SET "reputation" = LEAST(${REPUTATION_MAX}, GREATEST(${REPUTATION_MIN}, "reputation" + ${totalDelta})) WHERE "id" = ${userId}::uuid`;
    }
  }

  async getForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) return null;
    return {
      userId: user.id,
      name: user.profile?.name ?? null,
      email: user.email,
      score: user.reputation,
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async listEvents(userId: string, query: PaginationQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const where: Prisma.ReputationEventWhereInput = {
      userId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.reputationEvent.findMany({
      where,
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((event) => ({
        id: event.id,
        userId: event.userId,
        type: event.type,
        delta: event.delta,
        note: event.note,
        reservationId: event.reservationId,
        returnId: event.returnId,
        createdAt: event.createdAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }

  async listUsers(query: SearchPaginationQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const conditions: Prisma.UserWhereInput[] = [];
    if (query.search) {
      conditions.push({
        OR: [
          { username: { contains: query.search, mode: "insensitive" } },
          { email: { contains: query.search, mode: "insensitive" } },
          { profile: { name: { contains: query.search, mode: "insensitive" } } },
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
    const where: Prisma.UserWhereInput = conditions.length ? { AND: conditions } : {};
    const rows = await this.prisma.user.findMany({
      where,
      take: query.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { profile: true },
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((user) => ({
        userId: user.id,
        name: user.profile?.name ?? null,
        email: user.email,
        score: user.reputation,
        updatedAt: user.updatedAt.toISOString(),
      })),
      pageInfo: page.pageInfo,
    };
  }
}
