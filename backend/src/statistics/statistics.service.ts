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

    const periodStart = this.periodStart(query.period);
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
        periodStart: periodStart.toISOString(),
        data: [],
      };
    }

    const counts = await this.prisma.reservationItem.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assets.map((asset) => asset.id) },
        createdAt: { gte: periodStart },
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
      periodStart: periodStart.toISOString(),
      data,
    };
  }

  /** Start of the current UTC day/ISO-week(Monday)/month/year -- same
   * calendar-boundary convention the frontend's activityBuckets.ts uses for
   * the per-unit history chart, kept consistent across both statistics. */
  private periodStart(period: StatisticsPeriod): Date {
    const now = new Date();
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    if (period === "day") return day;
    if (period === "week") {
      const weekday = day.getUTCDay();
      const diffToMonday = (weekday + 6) % 7;
      day.setUTCDate(day.getUTCDate() - diffToMonday);
      return day;
    }
    if (period === "month") {
      return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    }
    return new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  }
}
