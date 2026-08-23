import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { AssetUnitsService } from "../src/assets/asset-units.service.js";

const assetId = "00000000-0000-4000-8000-000000000201";
const areaId = "00000000-0000-4000-8000-000000000301";
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
      {
        managementAreaId: areaId,
        permissions: ["asset:view", "asset:update"],
      },
    ],
  },
};

describe("asset unit registration", () => {
  it("rejects duplicate serial numbers before writing", async () => {
    const prisma = {
      asset: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: assetId, managementAreaId: areaId }),
      },
    } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);
    await expect(
      service.register(actor, assetId, {
        serialNumbers: ["SN-001", "SN-001"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("registers a unit per serial number and writes a REGISTERED event", async () => {
    const createManyUnits = vi.fn().mockResolvedValue({ count: 1 });
    const createManyEvents = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        assetUnit: {
          createMany: createManyUnits,
          findMany: vi.fn().mockResolvedValue([
            {
              id: "00000000-0000-4000-8000-000000000501",
              assetId,
              serialNumber: "SN-001",
              status: "ACTIVE",
              note: null,
              createdAt: new Date("2026-08-15T00:00:00.000Z"),
              updatedAt: new Date("2026-08-15T00:00:00.000Z"),
            },
          ]),
        },
        assetUnitEventBatch: { create: vi.fn().mockResolvedValue({}) },
        assetUnitEvent: { createMany: createManyEvents },
      }),
    );
    const prisma = {
      asset: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: assetId, managementAreaId: areaId }),
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    const result = await service.register(actor, assetId, {
      serialNumbers: ["SN-001"],
    });

    expect(createManyUnits).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          assetId,
          serialNumber: "SN-001",
          status: "ACTIVE",
        }),
      ],
    });
    expect(createManyEvents).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: "REGISTERED",
          toStatus: "ACTIVE",
        }),
      ],
    });
    expect(result.data[0]?.serialNumber).toBe("SN-001");
  });
});

describe("schedule-aware asset units", () => {
  it("lists only physically schedulable units without an overlapping assignment", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000501",
        assetId,
        serialNumber: "SN-001",
        status: "CHECKED_OUT",
        note: null,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        reservationItemUnits: [],
      },
    ]);
    const prisma = {
      asset: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: assetId, managementAreaId: areaId }),
      },
      assetUnit: { findMany },
    } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    const result = await service.list(actor, assetId, {
      from: "2026-09-01T09:00:00.000Z",
      to: "2026-09-01T11:00:00.000Z",
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { status: { in: ["ACTIVE", "RESERVED", "CHECKED_OUT"] } },
            {
              reservationItemUnits: {
                none: {
                  status: { in: ["ASSIGNED", "CHECKED_OUT"] },
                  assignmentStartAt: {
                    lt: new Date("2026-09-01T11:00:00.000Z"),
                  },
                  assignmentEndAt: {
                    gt: new Date("2026-09-01T09:00:00.000Z"),
                  },
                },
              },
            },
          ]),
        },
      }),
    );
    expect(result.data[0]).toMatchObject({
      serialNumber: "SN-001",
      status: "CHECKED_OUT",
      hasActiveAssignment: false,
    });
  });

  it("blocks retirement while a current or future assignment is active", async () => {
    const unit = {
      id: "00000000-0000-4000-8000-000000000501",
      assetId,
      serialNumber: "SN-001",
      status: "ACTIVE",
      note: null,
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
      updatedAt: new Date("2026-08-15T00:00:00.000Z"),
      asset: { managementAreaId: areaId },
    };
    const eventBatchCreate = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: unit.id }]),
      reservationItemUnit: {
        findFirst: vi.fn().mockResolvedValue({ assetUnitId: unit.id }),
      },
      assetUnitEventBatch: { create: eventBatchCreate },
    };
    const prisma = {
      assetUnit: { findMany: vi.fn().mockResolvedValue([unit]) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    await expect(
      service.retire(actor, {
        items: [
          {
            assetUnitId: unit.id,
            expectedUpdatedAt: unit.updatedAt.toISOString(),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "ASSET_UNIT_IN_USE" });
    expect(eventBatchCreate).not.toHaveBeenCalled();
  });
});
