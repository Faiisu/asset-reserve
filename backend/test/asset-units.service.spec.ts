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
        permissions: ["asset:update"],
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
        expect.objectContaining({ assetId, serialNumber: "SN-001", status: "ACTIVE" }),
      ],
    });
    expect(createManyEvents).toHaveBeenCalledWith({
      data: [expect.objectContaining({ eventType: "REGISTERED", toStatus: "ACTIVE" })],
    });
    expect(result.data[0]?.serialNumber).toBe("SN-001");
  });
});
