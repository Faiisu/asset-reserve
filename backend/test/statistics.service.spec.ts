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

  it("includes every permitted asset, defaulting to zero reservations", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: assetA, name: "Camera", partNumber: "CAM-1", managementArea: { id: areaId, name: "Studio A" } },
      { id: assetB, name: "Tripod", partNumber: "TRI-1", managementArea: { id: areaId, name: "Studio A" } },
    ]);
    const groupBy = vi.fn().mockResolvedValue([
      { assetId: assetA, _count: { _all: 3 } },
    ]);
    const prisma = {
      asset: { findMany },
      reservationItem: { groupBy },
    } as unknown as PrismaService;
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, { period: "month" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { managementAreaId: { in: [areaId] } },
      }),
    );
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["assetId"],
        where: expect.objectContaining({
          assetId: { in: [assetA, assetB] },
        }),
      }),
    );
    // Counted by the reservation's booked window, never the item row's
    // createdAt -- createdAt puts every freshly-seeded row in "today", which
    // made every period return the same number.
    const where = groupBy.mock.calls[0]![0].where;
    expect(where.createdAt).toBeUndefined();
    expect(where.reservation).toEqual({
      startAt: { lt: expect.any(Date) },
      endAt: { gt: expect.any(Date) },
    });
    // Sorted by reservedCount desc, so Camera (3) comes before Tripod (0).
    expect(result.data).toEqual([
      expect.objectContaining({ assetId: assetA, reservedCount: 3 }),
      expect.objectContaining({ assetId: assetB, reservedCount: 0 }),
    ]);
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
      const prisma = {
        asset: { findMany: vi.fn().mockResolvedValue([]) },
        reservationItem: { groupBy: vi.fn() },
      } as unknown as PrismaService;
      const service = new StatisticsService(prisma);

      const result = await service.reservationsByAsset(actor, { period });

      expect(result.periodStart).toBe(expectedStart);
      expect(result.periodEnd).toBe(expectedEnd);
      vi.useRealTimers();
    },
  );

  it("bounds the window on both ends so later bookings are excluded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T15:00:00.000Z"));
    const groupBy = vi.fn().mockResolvedValue([]);
    const prisma = {
      asset: {
        findMany: vi.fn().mockResolvedValue([
          { id: assetA, name: "Camera", partNumber: "CAM-1", managementArea: { id: areaId, name: "Studio A" } },
        ]),
      },
      reservationItem: { groupBy },
    } as unknown as PrismaService;
    const service = new StatisticsService(prisma);

    await service.reservationsByAsset(actor, { period: "month" });

    const { reservation } = groupBy.mock.calls[0]![0].where;
    expect(reservation.startAt.lt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(reservation.endAt.gt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    vi.useRealTimers();
  });
});
