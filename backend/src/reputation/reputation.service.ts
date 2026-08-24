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
   * with the return decision itself. The caller guards this return against
   * being decided twice (see decide()'s claim-via-updateMany check), so
   * this always runs at most once per return.
   *
   * Every responsible person -- the reservation's requester and every
   * participant, deduped -- gets the same deltas: +-5 for on-time/late
   * (returnedAt, when the borrower actually returned the equipment,
   * compared against the reservation's overall endAt -- not decidedAt,
   * which is only when an approver got to it, and not a per-unit
   * schedule), and -5 for each unit that came back broken or lost. One
   * ReputationEvent row is written per person per effect (the audit trail
   * "user behavior" views read from) via a single batched createMany, then
   * User.reputation is updated for every affected user in one clamped
   * atomic increment via raw SQL (every affected user gets the identical
   * totalDelta) -- avoids both a read-modify-write race and N sequential
   * round-trips inside the surrounding SERIALIZABLE transaction.
   */
  async recordReturnOutcome(
    tx: Prisma.TransactionClient,
    params: {
      reservationId: string;
      returnId: string;
      decidedAt: Date;
      returnedAt: Date;
      reservationEndAt: Date;
      affectedUserIds: Iterable<string>;
      unitConditions: ReturnUnitCondition[];
    },
  ): Promise<void> {
    const {
      reservationId,
      returnId,
      decidedAt,
      returnedAt,
      reservationEndAt,
      unitConditions,
    } = params;
    const userIds = [...new Set(params.affectedUserIds)];
    if (userIds.length === 0) return;

    const isLate = returnedAt > reservationEndAt;
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

    await tx.reputationEvent.createMany({
      data: userIds.flatMap((userId) =>
        events.map((event) => ({
          id: randomUUID(),
          userId,
          reservationId,
          returnId,
          type: event.type,
          delta: event.delta,
          createdAt: decidedAt,
        })),
      ),
    });
    await tx.$executeRaw`UPDATE "users" SET "reputation" = LEAST(${REPUTATION_MAX}, GREATEST(${REPUTATION_MIN}, "reputation" + ${totalDelta})) WHERE "id" = ANY(${userIds}::uuid[])`;
  }

  async getForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        // Score changes are written via raw SQL (see recordReturnOutcome),
        // which never touches users.updated_at -- so "when did this score
        // last move" has to come from the audit trail's own timestamp, not
        // the user row. Null means the score has never moved from its
        // starting value.
        reputationEvents: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!user) return null;
    return {
      userId: user.id,
      name: user.profile?.name ?? null,
      email: user.email,
      score: user.reputation,
      updatedAt: user.reputationEvents[0]?.createdAt.toISOString() ?? null,
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
      include: {
        profile: true,
        reputationEvents: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const page = pageInfo(rows, query.limit);
    return {
      data: page.data.map((user) => ({
        userId: user.id,
        name: user.profile?.name ?? null,
        email: user.email,
        score: user.reputation,
        updatedAt: user.reputationEvents[0]?.createdAt.toISOString() ?? null,
      })),
      pageInfo: page.pageInfo,
    };
  }
}
