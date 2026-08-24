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
    // Sorted by reservedCount desc, so Camera (3) comes before Tripod (0).
    expect(result.data).toEqual([
      expect.objectContaining({ assetId: assetA, reservedCount: 3 }),
      expect.objectContaining({ assetId: assetB, reservedCount: 0 }),
    ]);
  });

  it("computes the current-week start as the preceding Monday (UTC)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T15:00:00.000Z")); // a Wednesday
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      asset: { findMany },
      reservationItem: { groupBy: vi.fn() },
    } as unknown as PrismaService;
    const service = new StatisticsService(prisma);

    const result = await service.reservationsByAsset(actor, { period: "week" });

    expect(result.periodStart).toBe("2026-08-17T00:00:00.000Z");
    vi.useRealTimers();
  });
});
