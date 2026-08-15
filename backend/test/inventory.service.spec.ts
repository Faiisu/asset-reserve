import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { InventoryService } from "../src/assets/inventory.service.js";

const assetId = "00000000-0000-4000-8000-000000000201";
const areaId = "00000000-0000-4000-8000-000000000301";
const actor: AuthenticatedActor = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "manager@example.com",
    isActive: true,
    profile: null,
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

describe("inventory batches", () => {
  it("rejects duplicate asset lines before writing", async () => {
    const prisma = {} as PrismaService;
    const service = new InventoryService(prisma);
    await expect(
      service.add(actor, {
        items: [
          { assetId, quantity: 1 },
          { assetId, quantity: 2 },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("stores removals as negative ledger deltas", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        user: { findFirst: vi.fn().mockResolvedValue({ id: actor.user.id }) },
        assetTransactionBatch: {
          create: vi.fn().mockResolvedValue({}),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "00000000-0000-4000-8000-000000000401",
            description: "Retired stock",
            createdAt: new Date("2026-08-15T00:00:00.000Z"),
            performer: {
              id: actor.user.id,
              email: actor.user.email,
              profile: null,
            },
            transactions: [
              {
                id: "00000000-0000-4000-8000-000000000501",
                assetId,
                quantityDelta: -2,
                reason: "Retired",
                asset: { name: "Projector", totalQuantity: 3 },
              },
            ],
          }),
        },
        asset: { updateMany },
        assetTransaction: { createMany },
      }),
    );
    const prisma = {
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, managementAreaId: areaId }]),
      },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new InventoryService(prisma);

    const result = await service.remove(actor, {
      description: "Retired stock",
      items: [{ assetId, quantity: 2, reason: "Retired" }],
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assetId, totalQuantity: { gte: 2 } },
        data: expect.objectContaining({ totalQuantity: { decrement: 2 } }),
      }),
    );
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          assetId,
          transactionType: "REMOVE",
          quantityDelta: -2,
        }),
      ],
    });
    expect(result.items[0]?.totalQuantity).toBe(3);
  });
});
