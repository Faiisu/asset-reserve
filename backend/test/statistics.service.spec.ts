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
      service.reservationsByAsset(noAreaActor, { period: "month" }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("includes every permitted asset, defaulting to zero approved/rejected", async () => {
    const assets = [
      {
        id: assetA,
        name: "Camera",
        partNumber: "CAM-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
      {
        id: assetB,
        name: "Tripod",
        partNumber: "TRI-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
    ];
    const prisma = prismaWith(assets, [
      { status: "APPROVED", assetId: assetA },
      { status: "APPROVED", assetId: assetA },
      { status: "REJECTED", assetId: assetA },
    ]);
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      period: "month",
    });

    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { managementAreaId: { in: [areaId] } },
      }),
    );
    const where = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where;
    expect(where.status).toEqual({ in: ["APPROVED", "REJECTED"] });
    expect(where.reservationItem).toEqual(
      expect.objectContaining({ assetId: { in: [assetA, assetB] } }),
    );
    // Counted by the reservation's booked window, never a decision
    // timestamp -- decidedAt/createdAt cluster around whenever approvals
    // were processed, which would put every decision in "today".
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
      {
        id: assetA,
        name: "Camera",
        partNumber: "CAM-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
      {
        id: assetB,
        name: "Tripod",
        partNumber: "TRI-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
    ];
    const prisma = prismaWith(assets, [
      { status: "REJECTED", assetId: assetA },
      { status: "REJECTED", assetId: assetA },
      { status: "APPROVED", assetId: assetB },
    ]);
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      period: "month",
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
      {
        id: assetA,
        name: "Camera",
        partNumber: "CAM-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
    ];
    const prisma = prismaWith(assets);
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, { period: "month" });

    const where = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where;
    expect(where.status).toEqual({ in: ["APPROVED", "REJECTED"] });
  });

  it.each([
    ["day", "2026-08-19T00:00:00.000Z", "2026-08-20T00:00:00.000Z"],
    // Wednesday the 19th sits in the week starting Monday the 17th.
    ["week", "2026-08-17T00:00:00.000Z", "2026-08-24T00:00:00.000Z"],
    ["month", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"],
    ["year", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
  ] as const)(
    "resolves %s to a bounded [start, end) UTC window",
    async (period, expectedStart, expectedEnd) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-19T15:00:00.000Z")); // a Wednesday
      const service = new StatisticsService(prismaWith([]));

      const result = await service.reservationsByAsset(actor, { period });

      expect(result.periodStart).toBe(expectedStart);
      expect(result.periodEnd).toBe(expectedEnd);
      vi.useRealTimers();
    },
  );

  it.each([
    // A past month, nowhere near "now".
    [
      "month",
      "2026-02-14",
      "2026-02-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ],
    // Rolls into the next year rather than month 12.
    [
      "month",
      "2025-12-09",
      "2025-12-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ],
    [
      "year",
      "2024-06-30",
      "2024-01-01T00:00:00.000Z",
      "2025-01-01T00:00:00.000Z",
    ],
    [
      "day",
      "2026-02-28",
      "2026-02-28T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ],
    // A Sunday anchors to the Monday six days earlier, not the next one.
    [
      "week",
      "2026-08-23",
      "2026-08-17T00:00:00.000Z",
      "2026-08-24T00:00:00.000Z",
    ],
    // A week straddling a month boundary keeps running into the next month.
    [
      "week",
      "2026-09-01",
      "2026-08-31T00:00:00.000Z",
      "2026-09-07T00:00:00.000Z",
    ],
  ] as const)(
    "anchors the %s window to the supplied date (%s)",
    async (period, anchor, expectedStart, expectedEnd) => {
      const service = new StatisticsService(prismaWith([]));

      const result = await service.reservationsByAsset(actor, {
        period,
        anchor,
      });

      expect(result.periodStart).toBe(expectedStart);
      expect(result.periodEnd).toBe(expectedEnd);
    },
  );

  it("falls back to the period containing now when no anchor is given", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T15:00:00.000Z"));
    const service = new StatisticsService(prismaWith([]));

    const result = await service.reservationsByAsset(actor, {
      period: "month",
    });

    expect(result.periodStart).toBe("2026-08-01T00:00:00.000Z");
    vi.useRealTimers();
  });

  it("bounds the window on both ends so later bookings are excluded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T15:00:00.000Z"));
    const prisma = prismaWith([
      {
        id: assetA,
        name: "Camera",
        partNumber: "CAM-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
    ]);
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, { period: "month" });

    const { reservation } = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where.reservationItem;
    expect(reservation.startAt.lt.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    expect(reservation.endAt.gt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    vi.useRealTimers();
  });
});
