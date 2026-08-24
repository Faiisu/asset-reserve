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

/** Response caps at this many assets (highest approved+rejected first) so a
 * very large catalog can't blow up the chart payload -- mirrors the array
 * caps used elsewhere in this API (e.g. RegisterAssetUnitsDto.serialNumbers). */
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

    const { start, end } = this.periodRange(query.period, query.anchor);
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

    // ReservationItemApproval has no assetId of its own -- it hangs off
    // ReservationItem, which does -- so this can't be a single groupBy the
    // way AssetsService.unitCounts() groups AssetUnit by (assetId, status)
    // directly. Fetch the decided rows and reduce them by hand instead.
    const approvals = await this.prisma.reservationItemApproval.findMany({
      where: {
        status: { in: ["APPROVED", "REJECTED"] },
        reservationItem: {
          assetId: { in: assets.map((asset) => asset.id) },
          // Counted by the reservation's *booked window*, not when the
          // decision was made: createdAt/decidedAt cluster around whenever
          // approvals happened to be processed, so a freshly-seeded or
          // batch-approved database would put every decision in "today" and
          // every period would return an identical number -- the same
          // failure mode the reserved-count metric this replaced had with
          // ReservationItem.createdAt. Overlap (starts before the period
          // ends AND ends after it begins) is the same half-open convention
          // used for unit availability in AssetUnitsService.list().
          reservation: { startAt: { lt: end }, endAt: { gt: start } },
        },
      },
      select: { status: true, reservationItem: { select: { assetId: true } } },
    });

    const approvedByAsset = new Map<string, number>();
    const rejectedByAsset = new Map<string, number>();
    for (const approval of approvals) {
      const byAsset =
        approval.status === "APPROVED" ? approvedByAsset : rejectedByAsset;
      const assetId = approval.reservationItem.assetId;
      byAsset.set(assetId, (byAsset.get(assetId) ?? 0) + 1);
    }

    const data = assets
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        partNumber: asset.partNumber,
        managementArea: asset.managementArea,
        approvedCount: approvedByAsset.get(asset.id) ?? 0,
        rejectedCount: rejectedByAsset.get(asset.id) ?? 0,
      }))
      .sort((a, b) => {
        const totalDelta =
          b.approvedCount +
          b.rejectedCount -
          (a.approvedCount + a.rejectedCount);
        return totalDelta || a.name.localeCompare(b.name);
      })
      .slice(0, MAX_ASSETS);

    return {
      period: query.period,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      data,
    };
  }

  /** The UTC day / ISO-week (Monday) / month / year containing `anchor` as a
   * half-open [start, end) range. The range is bounded on both ends so
   * "August" excludes reservations booked for later periods. `anchor` may be
   * any instant inside the wanted period; without one it is right now. */
  private periodRange(
    period: StatisticsPeriod,
    anchor?: string,
  ): { start: Date; end: Date } {
    const now = anchor ? new Date(anchor) : new Date();
    if (Number.isNaN(now.getTime())) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The anchor date could not be read.",
        { anchor: "Provide a calendar date such as 2026-08-24." },
      );
    }
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const date = now.getUTCDate();

    if (period === "day") {
      const start = new Date(Date.UTC(year, month, date));
      return { start, end: new Date(Date.UTC(year, month, date + 1)) };
    }
    if (period === "week") {
      const diffToMonday =
        (new Date(Date.UTC(year, month, date)).getUTCDay() + 6) % 7;
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
