import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import { AssetsService } from "../src/assets/assets.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";

const assetId = "00000000-0000-4000-8000-000000000201";
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
    global: ["asset:view"],
    byManagementArea: [],
  },
};

const asset = {
  id: assetId,
  managementAreaId: "00000000-0000-4000-8000-000000000301",
  createdById: null,
  name: "Stage camera",
  partNumber: null,
  description: null,
  pictureUrl: null,
  isActive: true,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  managementArea: {
    id: "00000000-0000-4000-8000-000000000301",
    name: "Production",
  },
  createdBy: null,
};

const fourActiveUnits = vi
  .fn()
  .mockResolvedValue([{ assetId, status: "ACTIVE", _count: { _all: 4 } }]);

describe("time-based asset availability", () => {
  it("deducts approved allocations that overlap the requested range", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValueOnce([
        { assetId, status: "ACTIVE", _count: { _all: 4 } },
      ])
      .mockResolvedValueOnce([{ assetId, _count: { _all: 4 } }]);
    const service = new AssetsService({
      asset: { findMany: vi.fn().mockResolvedValue([asset]) },
      assetUnit: { groupBy },
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
    expect(groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assetId: { in: [assetId] },
          reservationItemUnits: {
            some: expect.objectContaining({
              assignmentStartAt: {
                lt: new Date("2026-08-18T10:00:00.000Z"),
              },
              assignmentEndAt: {
                gt: new Date("2026-08-18T02:00:00.000Z"),
              },
            }),
          },
        }),
      }),
    );
  });

  it("does not deduct booked quantities when no date range filter is provided in general asset list", async () => {
    const groupBy = vi.fn();
    const service = new AssetsService({
      asset: { findMany: vi.fn().mockResolvedValue([asset]) },
      assetUnit: { groupBy: fourActiveUnits },
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

  it("excludes damaged units but keeps allocated units in the date-based pool", async () => {
    const unitRows = vi
      .fn()
      .mockResolvedValueOnce([
        { assetId, status: "ACTIVE", _count: { _all: 2 } },
        { assetId, status: "RESERVED", _count: { _all: 1 } },
        { assetId, status: "CHECKED_OUT", _count: { _all: 1 } },
        { assetId, status: "BROKEN", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([{ assetId, _count: { _all: 2 } }]);
    const service = new AssetsService({
      asset: { findMany: vi.fn().mockResolvedValue([asset]) },
      assetUnit: { groupBy: unitRows },
    } as unknown as PrismaService);

    const result = await service.list(actor, {
      limit: 20,
      from: "2026-08-18T02:00:00.000Z",
      to: "2026-08-18T10:00:00.000Z",
    });

    expect(result.data[0]).toMatchObject({
      totalQuantity: 7,
      allocatedQuantity: 2,
      availableQuantity: 2,
    });
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
