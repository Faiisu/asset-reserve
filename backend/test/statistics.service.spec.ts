import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { StatisticsService } from "../src/statistics/statistics.service.js";

const areaId = "00000000-0000-4000-8000-000000000301";
const assetA = "00000000-0000-4000-8000-000000000401";
const assetB = "00000000-0000-4000-8000-000000000402";

const actor: AuthenticatedActor = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "manager",
    email: "manager@example.com",
    isActive: true,
    profile: null,
    linkedProviders: ["google"],
    accountLinkRequired: false,
  },
  roles: [],
  effectivePermissions: {
    global: [],
    byManagementArea: [
      { managementAreaId: areaId, permissions: ["asset:view"] },
    ],
  },
};

function prismaWith(
  assets: Array<{
    id: string;
    name: string;
    partNumber: string | null;
    managementArea: { id: string; name: string };
  }>,
  approvals: Array<{ status: "APPROVED" | "REJECTED"; assetId: string }> = [],
) {
  return {
    asset: { findMany: vi.fn().mockResolvedValue(assets) },
    reservationItemApproval: {
      findMany: vi.fn().mockResolvedValue(
        approvals.map((approval) => ({
          status: approval.status,
          reservationItem: { assetId: approval.assetId },
        })),
      ),
    },
  } as unknown as PrismaService;
}

describe("StatisticsService.reservationsByAsset", () => {
  it("rejects when the actor has no viewable management areas", async () => {
    const noAreaActor: AuthenticatedActor = {
      ...actor,
      effectivePermissions: { global: [], byManagementArea: [] },
    };
    const service = new StatisticsService({} as unknown as PrismaService);

    await expect(
      service.reservationsByAsset(noAreaActor, {
        start: "2026-08-01",
        end: "2026-08-31",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("includes every permitted asset, defaulting to zero approved/rejected", async () => {
    const assets = [
      { id: assetA, name: "Camera", partNumber: "CAM-1", managementArea: { id: areaId, name: "Studio A" } },
      { id: assetB, name: "Tripod", partNumber: "TRI-1", managementArea: { id: areaId, name: "Studio A" } },
    ];
    const prisma = prismaWith(assets, [
      { status: "APPROVED", assetId: assetA },
      { status: "APPROVED", assetId: assetA },
      { status: "REJECTED", assetId: assetA },
    ]);
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { managementAreaId: { in: [areaId] } },
      }),
    );
    const where = (prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].where;
    expect(where.status).toEqual({ in: ["APPROVED", "REJECTED"] });
    expect(where.reservationItem).toEqual(
      expect.objectContaining({ assetId: { in: [assetA, assetB] } }),
    );
    expect(where.reservationItem.reservation).toEqual({
      startAt: { lt: expect.any(Date) },
      endAt: { gt: expect.any(Date) },
    });
    // Sorted by approved+rejected desc, so Camera (2+1) leads Tripod (0+0).
    expect(result.data).toEqual([
      expect.objectContaining({
        assetId: assetA,
        approvedCount: 2,
        rejectedCount: 1,
      }),
      expect.objectContaining({
        assetId: assetB,
        approvedCount: 0,
        rejectedCount: 0,
      }),
    ]);
  });

  it("keeps approved and rejected counts separate per asset", async () => {
    const assets = [
      { id: assetA, name: "Camera", partNumber: "CAM-1", managementArea: { id: areaId, name: "Studio A" } },
      { id: assetB, name: "Tripod", partNumber: "TRI-1", managementArea: { id: areaId, name: "Studio A" } },
    ];
    const prisma = prismaWith(assets, [
      { status: "REJECTED", assetId: assetA },
      { status: "REJECTED", assetId: assetA },
      { status: "APPROVED", assetId: assetB },
    ]);
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(result.data).toEqual([
      // Both totals tie at 2, so the tiebreaker (name asc) puts Camera first.
      expect.objectContaining({
        assetId: assetA,
        approvedCount: 0,
        rejectedCount: 2,
      }),
      expect.objectContaining({
        assetId: assetB,
        approvedCount: 1,
        rejectedCount: 0,
      }),
    ]);
  });

  it("ignores approvals still pending a decision", async () => {
    // Only APPROVED/REJECTED should ever be requested from the database --
    // a PENDING row belongs in neither bar.
    const assets = [
      { id: assetA, name: "Camera", partNumber: "CAM-1", managementArea: { id: areaId, name: "Studio A" } },
    ];
    const prisma = prismaWith(assets);
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    const where = (prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].where;
    expect(where.status).toEqual({ in: ["APPROVED", "REJECTED"] });
  });

  it("resolves a start/end calendar range to a bounded [start, end) UTC window", async () => {
    const service = new StatisticsService(prismaWith([]));

    // end=2026-08-31 must include the whole of Aug 31, so the exclusive
    // upper bound rolls to Sep 1.
    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(result.periodStart).toBe("2026-08-01T00:00:00.000Z");
    expect(result.periodEnd).toBe("2026-09-01T00:00:00.000Z");
  });

  it("resolves a single-day range (start === end) to one full day", async () => {
    const service = new StatisticsService(prismaWith([]));

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-24",
      end: "2026-08-24",
    });

    expect(result.periodStart).toBe("2026-08-24T00:00:00.000Z");
    expect(result.periodEnd).toBe("2026-08-25T00:00:00.000Z");
  });

  it("rolls the end bound across a month/year boundary", async () => {
    const service = new StatisticsService(prismaWith([]));

    const result = await service.reservationsByAsset(actor, {
      start: "2026-12-01",
      end: "2026-12-31",
    });

    expect(result.periodEnd).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rejects an end date before the start date", async () => {
    const service = new StatisticsService(prismaWith([]));

    await expect(
      service.reservationsByAsset(actor, {
        start: "2026-08-31",
        end: "2026-08-01",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a date that cannot be parsed", async () => {
    const service = new StatisticsService(prismaWith([]));

    await expect(
      service.reservationsByAsset(actor, { start: "not-a-date", end: "2026-08-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("bounds the window on both ends so bookings outside the range are excluded", async () => {
    const prisma = prismaWith([
      { id: assetA, name: "Camera", partNumber: "CAM-1", managementArea: { id: areaId, name: "Studio A" } },
    ]);
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, { start: "2026-08-01", end: "2026-08-31" });

    const { reservation } = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where.reservationItem;
    expect(reservation.startAt.lt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(reservation.endAt.gt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});
