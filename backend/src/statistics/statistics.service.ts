import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { permittedAreaIds } from "../assets/asset-access.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type {
  ReservationsByAssetQueryDto,
  StatisticsPeriod,
} from "./statistics.dto.js";

/** Response caps at this many assets (highest reservedCount first) so a very
 * large catalog can't blow up the chart payload -- mirrors the array caps
 * used elsewhere in this API (e.g. RegisterAssetUnitsDto.serialNumbers). */
const MAX_ASSETS = 200;

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async reservationsByAsset(
    actor: AuthenticatedActor,
    query: ReservationsByAssetQueryDto,
  ) {
    const allowedAreaIds = permittedAreaIds(actor, "asset:view");
    if (allowedAreaIds !== null && allowedAreaIds.length === 0) {
      throw new ApiException(
        403,
        "PERMISSION_DENIED",
        "You do not have permission to view assets.",
      );
    }

    const { start, end } = this.periodRange(query.period);
    const assetWhere: Prisma.AssetWhereInput =
      allowedAreaIds !== null
        ? { managementAreaId: { in: allowedAreaIds } }
        : {};

    const assets = await this.prisma.asset.findMany({
      where: assetWhere,
      select: {
        id: true,
        name: true,
        partNumber: true,
        managementArea: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    if (assets.length === 0) {
      return {
        period: query.period,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        data: [],
      };
    }

    const counts = await this.prisma.reservationItem.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assets.map((asset) => asset.id) },
        // Counted by the reservation's *booked window*, not the item row's
        // createdAt: createdAt is when the request was typed in, so a
        // freshly-imported or freshly-seeded database puts every row in
        // "today" and every period returns an identical number. Overlap
        // (starts before the period ends AND ends after it begins) is the
        // same half-open convention used for unit availability in
        // AssetUnitsService.list().
        reservation: { startAt: { lt: end }, endAt: { gt: start } },
      },
      _count: { _all: true },
    });
    const countByAsset = new Map(
      counts.map((row) => [row.assetId, row._count._all]),
    );

    const data = assets
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        partNumber: asset.partNumber,
        managementArea: asset.managementArea,
        reservedCount: countByAsset.get(asset.id) ?? 0,
      }))
      .sort(
        (a, b) => b.reservedCount - a.reservedCount || a.name.localeCompare(b.name),
      )
      .slice(0, MAX_ASSETS);

    return {
      period: query.period,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      data,
    };
  }

  /** The current UTC day / ISO-week (Monday) / month / year as a half-open
   * [start, end) range -- same calendar-boundary convention the frontend's
   * activityBuckets.ts uses for the per-unit history chart, kept consistent
   * across both statistics. The range is bounded on both ends so "this month"
   * excludes reservations booked for later periods. */
  private periodRange(period: StatisticsPeriod): { start: Date; end: Date } {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();

    if (period === "day") {
      const start = new Date(Date.UTC(year, month, date));
      return { start, end: new Date(Date.UTC(year, month, date + 1)) };
    }
    if (period === "week") {
      const diffToMonday = (new Date(Date.UTC(year, month, date)).getUTCDay() + 6) % 7;
      const start = new Date(Date.UTC(year, month, date - diffToMonday));
      return {
        start,
        end: new Date(Date.UTC(year, month, date - diffToMonday + 7)),
      };
    }
    if (period === "month") {
      return {
        start: new Date(Date.UTC(year, month, 1)),
        end: new Date(Date.UTC(year, month + 1, 1)),
      };
    }
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }
}
