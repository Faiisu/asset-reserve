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
  options: {
    approvals?: Array<{ status: "APPROVED" | "REJECTED"; assetId: string }>;
    unitCounts?: Array<{ assetId: string; count: number }>;
    assignments?: Array<{
      assetId: string;
      checkedOutAt: Date;
      returnedAt: Date | null;
    }>;
    dispositions?: Array<{
      assetId: string;
      status: "RETURNED_BROKEN" | "RETURNED_LOST";
    }>;
  } = {},
) {
  const {
    approvals = [],
    unitCounts = [],
    assignments = [],
    dispositions = [],
  } = options;
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
    assetUnit: {
      groupBy: vi.fn().mockResolvedValue(
        unitCounts.map((row) => ({
          assetId: row.assetId,
          _count: { _all: row.count },
        })),
      ),
    },
    reservationItemUnit: {
      // utilization() and damage() both read this table for different
      // things, so the mock dispatches on which one is asking rather than
      // handing utilization's checked-out rows to the damage tally (where a
      // row with no `status` would silently count as lost).
      findMany: vi.fn().mockImplementation((args: { where?: unknown }) => {
        const where = (args?.where ?? {}) as {
          status?: { in?: string[] };
        };
        if (where.status?.in?.includes("RETURNED_BROKEN")) {
          return Promise.resolve(
            dispositions.map((disposition) => ({
              status: disposition.status,
              reservationItem: { assetId: disposition.assetId },
            })),
          );
        }
        return Promise.resolve(
          assignments.map((assignment) => ({
            checkedOutAt: assignment.checkedOutAt,
            returnedAt: assignment.returnedAt,
            reservationItem: { assetId: assignment.assetId },
          })),
        );
      }),
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
    const prisma = prismaWith(assets, {
      approvals: [
        { status: "APPROVED", assetId: assetA },
        { status: "APPROVED", assetId: assetA },
        { status: "REJECTED", assetId: assetA },
      ],
    });
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
    const where = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where;
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
    const prisma = prismaWith(assets, {
      approvals: [
        { status: "REJECTED", assetId: assetA },
        { status: "REJECTED", assetId: assetA },
        { status: "APPROVED", assetId: assetB },
      ],
    });
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
      {
        id: assetA,
        name: "Camera",
        partNumber: "CAM-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
    ];
    const prisma = prismaWith(assets);
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    const where = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where;
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
      service.reservationsByAsset(actor, {
        start: "not-a-date",
        end: "2026-08-01",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("bounds the window on both ends so bookings outside the range are excluded", async () => {
    const prisma = prismaWith([
      {
        id: assetA,
        name: "Camera",
        partNumber: "CAM-1",
        managementArea: { id: areaId, name: "Studio A" },
      },
    ]);
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    const { reservation } = (
      prisma.reservationItemApproval.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where.reservationItem;
    expect(reservation.startAt.lt.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    expect(reservation.endAt.gt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("StatisticsService.reservationsByAsset -- utilizationPercent", () => {
  const assets = [
    {
      id: assetA,
      name: "Camera",
      partNumber: "CAM-1",
      managementArea: { id: areaId, name: "Studio A" },
    },
  ];

  it("is null when the asset has no active units", async () => {
    const prisma = prismaWith(assets, { unitCounts: [] });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-02",
    });

    expect(result.data[0]).toMatchObject({
      activeUnitCount: 0,
      utilizationPercent: null,
    });
  });

  it("computes checked-out hours as a fraction of unit-hours in the window", async () => {
    // One unit, a 2-day window (48h), checked out for exactly 12h -> 25%.
    const prisma = prismaWith(assets, {
      unitCounts: [{ assetId: assetA, count: 1 }],
      assignments: [
        {
          assetId: assetA,
          checkedOutAt: new Date("2026-08-01T00:00:00.000Z"),
          returnedAt: new Date("2026-08-01T12:00:00.000Z"),
        },
      ],
    });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-02",
    });

    expect(result.data[0]).toMatchObject({
      activeUnitCount: 1,
      utilizationPercent: 25,
    });
  });

  it("clips an assignment that starts before the window to the window start", async () => {
    // Checked out the day before the window opens, returned 12h into it --
    // only those 12h of a 24h single-unit window should count (50%), not
    // the hours before the window. start === end names one calendar day,
    // which resolveRange turns into exactly a 24h [start, start+1day) window.
    const prisma = prismaWith(assets, {
      unitCounts: [{ assetId: assetA, count: 1 }],
      assignments: [
        {
          assetId: assetA,
          checkedOutAt: new Date("2026-07-31T00:00:00.000Z"),
          returnedAt: new Date("2026-08-01T12:00:00.000Z"),
        },
      ],
    });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-01",
    });

    expect(result.data[0]!.utilizationPercent).toBe(50);
  });

  it("treats a still-checked-out unit (no returnedAt) as occupied through the window end", async () => {
    const prisma = prismaWith(assets, {
      unitCounts: [{ assetId: assetA, count: 1 }],
      assignments: [
        {
          assetId: assetA,
          checkedOutAt: new Date("2026-08-01T12:00:00.000Z"),
          returnedAt: null,
        },
      ],
    });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-01",
    });

    // Occupied from noon through the window's end (2026-08-02 00:00) = 12h
    // of a 24h single-unit window = 50%.
    expect(result.data[0]!.utilizationPercent).toBe(50);
  });

  it("divides used hours across every active unit, not just the busiest one", async () => {
    // Two units, each checked out for the full 24h window -> 48h used of
    // 48h capacity = 100%, not 200%.
    const prisma = prismaWith(assets, {
      unitCounts: [{ assetId: assetA, count: 2 }],
      assignments: [
        {
          assetId: assetA,
          checkedOutAt: new Date("2026-08-01T00:00:00.000Z"),
          returnedAt: new Date("2026-08-02T00:00:00.000Z"),
        },
        {
          assetId: assetA,
          checkedOutAt: new Date("2026-08-01T00:00:00.000Z"),
          returnedAt: new Date("2026-08-02T00:00:00.000Z"),
        },
      ],
    });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-01",
    });

    expect(result.data[0]!.utilizationPercent).toBe(100);
  });

  it("excludes retired units from both the query and the denominator", async () => {
    const prisma = prismaWith(assets, {
      unitCounts: [{ assetId: assetA, count: 1 }],
      assignments: [
        {
          assetId: assetA,
          checkedOutAt: new Date("2026-08-01T00:00:00.000Z"),
          returnedAt: new Date("2026-08-01T06:00:00.000Z"),
        },
      ],
    });
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-02",
    });

    const unitWhere = (prisma.assetUnit.groupBy as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0].where;
    expect(unitWhere.status).toEqual({ not: "INACTIVE" });
    const assignmentWhere = (
      prisma.reservationItemUnit.findMany as ReturnType<typeof vi.fn>
    ).mock.calls[0]![0].where;
    expect(assignmentWhere.assetUnit).toEqual(
      expect.objectContaining({ status: { not: "INACTIVE" } }),
    );
  });
});

describe("StatisticsService.reservationsByAsset -- broken/lost", () => {
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

  it("defaults both counts to zero for an asset with no dispositions", async () => {
    const service = new StatisticsService(prismaWith(assets));

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    expect(result.data.map((row) => [row.brokenCount, row.lostCount])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("tallies broken and lost separately per asset", async () => {
    const prisma = prismaWith(assets, {
      dispositions: [
        { assetId: assetA, status: "RETURNED_BROKEN" },
        { assetId: assetA, status: "RETURNED_BROKEN" },
        { assetId: assetA, status: "RETURNED_LOST" },
        { assetId: assetB, status: "RETURNED_LOST" },
      ],
    });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    const byId = new Map(result.data.map((row) => [row.assetId, row]));
    expect(byId.get(assetA)).toMatchObject({ brokenCount: 2, lostCount: 1 });
    expect(byId.get(assetB)).toMatchObject({ brokenCount: 0, lostCount: 1 });
  });

  it("scopes dispositions by returnedAt over the resolved half-open window", async () => {
    const prisma = prismaWith(assets, {
      dispositions: [{ assetId: assetA, status: "RETURNED_BROKEN" }],
    });
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    const damageCall = (
      prisma.reservationItemUnit.findMany as ReturnType<typeof vi.fn>
    ).mock.calls.find((call) =>
      call[0]?.where?.status?.in?.includes("RETURNED_BROKEN"),
    );
    expect(damageCall).toBeDefined();
    // Counted when the inspection recorded the condition, not by the
    // reservation's booked window the way approvedCount is -- and `end`
    // is advanced to the start of the next day so 2026-08-31 counts whole.
    expect(damageCall![0].where.returnedAt).toEqual({
      gte: new Date("2026-08-01T00:00:00.000Z"),
      lt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(damageCall![0].where.status).toEqual({
      in: ["RETURNED_BROKEN", "RETURNED_LOST"],
    });
  });

  it("does not let damage counts affect the approved+rejected ranking", async () => {
    const prisma = prismaWith(assets, {
      approvals: [{ status: "APPROVED", assetId: assetB }],
      dispositions: [
        { assetId: assetA, status: "RETURNED_LOST" },
        { assetId: assetA, status: "RETURNED_LOST" },
      ],
    });
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, {
      start: "2026-08-01",
      end: "2026-08-31",
    });

    // Tripod leads on decisions despite Camera being the damaged one; the
    // frontend re-ranks for its own damage chart rather than relying on this.
    expect(result.data[0]!.assetId).toBe(assetB);
  });
});
