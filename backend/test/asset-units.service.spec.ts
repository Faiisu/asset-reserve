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

describe("cross-asset unit search", () => {
  it("scopes the search to management areas the actor can view", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000501",
        assetId,
        serialNumber: "SN-001",
        status: "ACTIVE",
        note: null,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        asset: { id: assetId, name: "Camera", partNumber: "CAM-1" },
        reservationItemUnits: [],
      },
    ]);
    const prisma = { assetUnit: { findMany } } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    const result = await service.search(actor, { search: "SN-001", limit: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { asset: { managementAreaId: { in: [areaId] } } },
            { serialNumber: { contains: "SN-001", mode: "insensitive" } },
          ]),
        },
      }),
    );
    expect(result.data[0]).toMatchObject({
      serialNumber: "SN-001",
      asset: { id: assetId, name: "Camera" },
    });
  });

  it("rejects a search when the actor has no viewable management areas", async () => {
    const noAreaActor: AuthenticatedActor = {
      ...actor,
      effectivePermissions: { global: [], byManagementArea: [] },
    };
    const prisma = {} as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    await expect(
      service.search(noAreaActor, { limit: 20 }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

describe("asset unit history", () => {
  it("returns 404 when the unit does not exist", async () => {
    const prisma = {
      assetUnit: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    await expect(
      service.getHistory(actor, "00000000-0000-4000-8000-000000000999"),
    ).rejects.toMatchObject({ code: "ASSET_UNIT_NOT_FOUND" });
  });

  it("summarizes event counts and the events list for one unit", async () => {
    const unitId = "00000000-0000-4000-8000-000000000501";
    const unit = {
      id: unitId,
      assetId,
      serialNumber: "SN-001",
      status: "ACTIVE",
      note: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-15T00:00:00.000Z"),
      asset: {
        id: assetId,
        name: "Camera",
        partNumber: "CAM-1",
        managementAreaId: areaId,
      },
      reservationItemUnits: [],
    };
    const performer = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "manager@example.com",
      profile: null,
    };
    const events = [
      {
        id: "e2",
        batchId: "b2",
        assetUnitId: unitId,
        eventType: "RESERVED",
        fromStatus: "ACTIVE",
        toStatus: "RESERVED",
        reason: null,
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        batch: { description: "Reserved", performer },
      },
      {
        id: "e1",
        batchId: "b1",
        assetUnitId: unitId,
        eventType: "REGISTERED",
        fromStatus: null,
        toStatus: "ACTIVE",
        reason: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        batch: { description: "Registered", performer },
      },
    ];
    const prisma = {
      assetUnit: { findUnique: vi.fn().mockResolvedValue(unit) },
      assetUnitEvent: { findMany: vi.fn().mockResolvedValue(events) },
    } as unknown as PrismaService;
    const service = new AssetUnitsService(prisma);

    const result = await service.getHistory(actor, unitId);

    expect(result.unit).toMatchObject({
      serialNumber: "SN-001",
      asset: { id: assetId, name: "Camera" },
    });
    expect(result.stats).toMatchObject({
      total: 2,
      byEventType: { RESERVED: 1, REGISTERED: 1 },
      registeredAt: "2026-08-01T00:00:00.000Z",
      lastEventAt: "2026-08-10T00:00:00.000Z",
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({ eventType: "RESERVED" });
  });
});
