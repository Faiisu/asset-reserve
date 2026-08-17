import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import { AssetsService } from "../src/assets/assets.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";

const assetId = "00000000-0000-4000-8000-000000000201";
const actor: AuthenticatedActor = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "manager@example.com",
    isActive: true,
    profile: null,
  },
  roles: [],
  effectivePermissions: {
    global: ["asset:view"],
    byManagementArea: [],
  },
};

const asset = {
  id: assetId,
  managementAreaId: "00000000-0000-4000-8000-000000000301",
  createdById: null,
  name: "Stage camera",
  description: null,
  pictureUrl: null,
  totalQuantity: 4,
  isActive: true,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  managementArea: {
    id: "00000000-0000-4000-8000-000000000301",
    name: "Production",
  },
  createdBy: null,
};

describe("time-based asset availability", () => {
  it("deducts approved allocations that overlap the requested range", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue([{ assetId, _sum: { quantity: 4 } }]);
    const service = new AssetsService({
      asset: { findMany: vi.fn().mockResolvedValue([asset]) },
      reservationItem: { groupBy },
    } as unknown as PrismaService);

    const result = await service.list(actor, {
      limit: 20,
      isActive: true,
      from: "2026-08-18T02:00:00.000Z",
      to: "2026-08-18T10:00:00.000Z",
    });

    expect(result.data[0]).toMatchObject({
      allocatedQuantity: 4,
      availableQuantity: 0,
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assetId: { in: [assetId] },
          reservation: expect.objectContaining({
            startAt: { lt: new Date("2026-08-18T10:00:00.000Z") },
            endAt: { gt: new Date("2026-08-18T02:00:00.000Z") },
          }),
        }),
      }),
    );
  });

  it("does not deduct booked quantities when no date range filter is provided in general asset list", async () => {
    const groupBy = vi.fn();
    const service = new AssetsService({
      asset: { findMany: vi.fn().mockResolvedValue([asset]) },
      reservationItem: { groupBy },
    } as unknown as PrismaService);

    const result = await service.list(actor, {
      limit: 20,
      isActive: true,
    });

    expect(result.data[0]).toMatchObject({
      totalQuantity: 4,
      allocatedQuantity: 0,
      availableQuantity: 4,
    });
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("requires both ends of the availability range", async () => {
    const service = new AssetsService({} as PrismaService);

    await expect(
      service.list(actor, {
        limit: 20,
        from: "2026-08-18T02:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
