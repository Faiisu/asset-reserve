import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { permittedAreaIds } from "../assets/asset-access.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { ReservationsByAssetQueryDto } from "./statistics.dto.js";

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

    const { start, end } = this.resolveRange(query.start, query.end);
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
          // every window would return an identical number. Overlap (starts
          // before the window ends AND ends after it begins) is the same
          // half-open convention used for unit availability in
          // AssetUnitsService.list().
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

    const assetIds = assets.map((asset) => asset.id);
    const { activeUnitCountByAsset, utilizationPercentByAsset } =
      await this.utilization(assetIds, start, end);
    const { brokenByAsset, lostByAsset } = await this.damage(
      assetIds,
      start,
      end,
    );

    const data = assets
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        partNumber: asset.partNumber,
        managementArea: asset.managementArea,
        approvedCount: approvedByAsset.get(asset.id) ?? 0,
        rejectedCount: rejectedByAsset.get(asset.id) ?? 0,
        activeUnitCount: activeUnitCountByAsset.get(asset.id) ?? 0,
        utilizationPercent: utilizationPercentByAsset.get(asset.id) ?? null,
        brokenCount: brokenByAsset.get(asset.id) ?? 0,
        lostCount: lostByAsset.get(asset.id) ?? 0,
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
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      data,
    };
  }

  /** How many of an asset's units came back damaged or never came back at
   * all, counted per asset over the window.
   *
   * Scoped by `returnedAt` -- when the return inspection actually recorded
   * the condition -- rather than by the reservation's booked window the way
   * approvedCount/rejectedCount are. Those two count a *decision about a
   * booking*, so the booking's dates are the honest axis; these count a
   * *physical event discovered at inspection*, and an inspection is what
   * creates the fact. A unit booked in January and found broken when it was
   * finally inspected in March belongs to March here: that is when the
   * breakage entered the record, and it is the month whose report should
   * show a loss to explain. returns.service sets `returnedAt` in the same
   * write that sets `RETURNED_BROKEN`/`RETURNED_LOST`, so the two can never
   * disagree about when a disposition happened. */
  private async damage(
    assetIds: string[],
    start: Date,
    end: Date,
  ): Promise<{
    brokenByAsset: Map<string, number>;
    lostByAsset: Map<string, number>;
  }> {
    // Same shape as the approvals reduce above and for the same reason:
    // ReservationItemUnit has no assetId of its own, it hangs off
    // ReservationItem, so a single Prisma groupBy can't reach the asset.
    const dispositions = await this.prisma.reservationItemUnit.findMany({
      where: {
        status: { in: ["RETURNED_BROKEN", "RETURNED_LOST"] },
        returnedAt: { gte: start, lt: end },
        reservationItem: { assetId: { in: assetIds } },
      },
      select: {
        status: true,
        reservationItem: { select: { assetId: true } },
      },
    });

    const brokenByAsset = new Map<string, number>();
    const lostByAsset = new Map<string, number>();
    for (const disposition of dispositions) {
      const byAsset =
        disposition.status === "RETURNED_BROKEN" ? brokenByAsset : lostByAsset;
      const assetId = disposition.reservationItem.assetId;
      byAsset.set(assetId, (byAsset.get(assetId) ?? 0) + 1);
    }

    return { brokenByAsset, lostByAsset };
  }

  /** What fraction of an asset's own capacity actually got used: for each
   * asset, (hours its non-retired units spent checked out during
   * [start, end)) / (non-retired unit count * window hours). Two assets
   * can have the same approvedCount and still tell a different story here
   * -- one might be a single unit in constant use, the other ten units
   * that are mostly idle. */
  private async utilization(
    assetIds: string[],
    start: Date,
    end: Date,
  ): Promise<{
    activeUnitCountByAsset: Map<string, number>;
    utilizationPercentByAsset: Map<string, number>;
  }> {
    const unitCounts = await this.prisma.assetUnit.groupBy({
      by: ["assetId"],
      where: {
        assetId: { in: assetIds },
        // A retired unit can never be checked out again, so it shouldn't
        // dilute the denominator -- same exclusion AssetSummary.unitCounts
        // already applies when it reports a "total" unit count.
        status: { not: "INACTIVE" },
        // Not yet registered when the window ends is not capacity either.
        createdAt: { lt: end },
      },
      _count: { _all: true },
    });
    const activeUnitCountByAsset = new Map(
      unitCounts.map((row) => [row.assetId, row._count._all]),
    );

    const assignments = await this.prisma.reservationItemUnit.findMany({
      where: {
        checkedOutAt: { not: null, lt: end },
        OR: [{ returnedAt: null }, { returnedAt: { gt: start } }],
        reservationItem: { assetId: { in: assetIds } },
        // Matches the same unit set the denominator counts -- otherwise a
        // unit retired after being heavily used could push usedMs above
        // the capacity it no longer counts toward, reading over 100%.
        assetUnit: { status: { not: "INACTIVE" }, createdAt: { lt: end } },
      },
      select: {
        checkedOutAt: true,
        returnedAt: true,
        reservationItem: { select: { assetId: true } },
      },
    });

    const usedMsByAsset = new Map<string, number>();
    for (const assignment of assignments) {
      const checkedOutAt = assignment.checkedOutAt!;
      const overlapStart = checkedOutAt > start ? checkedOutAt : start;
      const overlapEnd =
        assignment.returnedAt && assignment.returnedAt < end
          ? assignment.returnedAt
          : end;
      const ms = overlapEnd.getTime() - overlapStart.getTime();
      if (ms <= 0) continue;
      const assetId = assignment.reservationItem.assetId;
      usedMsByAsset.set(assetId, (usedMsByAsset.get(assetId) ?? 0) + ms);
    }

    // windowMs > 0 is guaranteed by resolveRange, and every entry in
    // activeUnitCountByAsset has unitCount >= 1 (groupBy only returns rows
    // that matched at least one AssetUnit) -- so capacityMs is always > 0
    // here and every asset with any active unit gets a percent.
    const windowMs = end.getTime() - start.getTime();
    const utilizationPercentByAsset = new Map<string, number>();
    for (const [assetId, unitCount] of activeUnitCountByAsset) {
      const capacityMs = unitCount * windowMs;
      const usedMs = usedMsByAsset.get(assetId) ?? 0;
      utilizationPercentByAsset.set(
        assetId,
        Math.round((usedMs / capacityMs) * 1000) / 10,
      );
    }

    return { activeUnitCountByAsset, utilizationPercentByAsset };
  }

  /** `start`/`end` are calendar dates naming an inclusive range (the caller
   * picked them from a plain date input), so `end` is advanced to the start
   * of the *next* UTC day to make a half-open [start, end) range covering
   * the whole named end day -- same overlap convention used for unit
   * availability elsewhere in this API. */
  private resolveRange(start: string, end: string): { start: Date; end: Date } {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The date range could not be read.",
        { start: "Provide calendar dates such as 2026-08-01." },
      );
    }

    const rangeStart = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
      ),
    );
    const rangeEnd = new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth(),
        endDate.getUTCDate() + 1,
      ),
    );
    if (rangeEnd <= rangeStart) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "The end date must be on or after the start date.",
        { end: "Choose an end date on or after the start date." },
      );
    }
    return { start: rangeStart, end: rangeEnd };
  }
}
