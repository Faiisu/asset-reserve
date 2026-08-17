import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import { ReservationLifecycleEvents } from "../src/common/reservation-lifecycle.events.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { ReturnsService } from "../src/returns/returns.service.js";

const reservationEvents = new ReservationLifecycleEvents();

const requesterId = "00000000-0000-4000-8000-000000000001";
const managerId = "00000000-0000-4000-8000-000000000002";
const otherManagerId = "00000000-0000-4000-8000-000000000003";
const reservationId = "00000000-0000-4000-8000-000000000101";
const itemId = "00000000-0000-4000-8000-000000000201";
const assetId = "00000000-0000-4000-8000-000000000301";
const areaId = "00000000-0000-4000-8000-000000000401";
const otherAreaId = "00000000-0000-4000-8000-000000000402";
const returnId = "00000000-0000-4000-8000-000000000701";

const requesterActor: AuthenticatedActor = {
  user: {
    id: requesterId,
    email: "requester@example.com",
    isActive: true,
    profile: null,
  },
  roles: [],
  effectivePermissions: {
    global: ["reservation:create"],
    byManagementArea: [],
  },
};

const areaManagerActor: AuthenticatedActor = {
  user: {
    id: managerId,
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
        permissions: ["return:approve", "reservation:approve"],
      },
    ],
  },
};

const otherAreaManagerActor: AuthenticatedActor = {
  user: {
    id: otherManagerId,
    email: "other@example.com",
    isActive: true,
    profile: null,
  },
  roles: [],
  effectivePermissions: {
    global: [],
    byManagementArea: [
      {
        managementAreaId: otherAreaId,
        permissions: ["return:approve"],
      },
    ],
  },
};

const userRecord = {
  id: requesterId,
  email: "requester@example.com",
  profile: null,
};

const managerRecord = {
  id: managerId,
  email: "manager@example.com",
  profile: null,
};

function sampleReservation(status = "APPROVED") {
  return {
    id: reservationId,
    requesterId,
    eventName: "Product Demo",
    description: null,
    startAt: new Date("2026-09-01T09:00:00.000Z"),
    endAt: new Date("2026-09-01T11:00:00.000Z"),
    status,
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    updatedAt: new Date("2026-08-15T00:00:00.000Z"),
    requester: userRecord,
    participants: [],
    items: [
      {
        id: itemId,
        reservationId,
        assetId,
        quantity: 2,
        status:
          status === "DELIVERY_CONFIRMED"
            ? "DELIVERED"
            : status === "APPROVED"
              ? "APPROVED"
              : "PENDING",
        preparedBy: null,
        preparedAt: null,
        checkedOutBy: null,
        checkedOutAt: null,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        asset: {
          id: assetId,
          assetTemplateId: null,
          managementAreaId: areaId,
          createdById: requesterId,
          name: "Camera",
          description: null,
          pictureUrl: null,
          totalQuantity: 5,
          isActive: true,
          createdAt: new Date("2026-08-15T00:00:00.000Z"),
          updatedAt: new Date("2026-08-15T00:00:00.000Z"),
          managementArea: {
            id: areaId,
            name: "Media Lab",
            description: null,
            createdAt: new Date("2026-08-15T00:00:00.000Z"),
            updatedAt: new Date("2026-08-15T00:00:00.000Z"),
          },
          assetTemplate: null,
        },
        returnItems: [],
      },
    ],
  };
}

function sampleReturnRecord(status = "PENDING") {
  return {
    id: returnId,
    reservationId,
    returnedBy: requesterId,
    status,
    returnedAt: new Date("2026-09-01T12:00:00.000Z"),
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    returner: userRecord,
    reservation: {
      id: reservationId,
      eventName: "Product Demo",
      requester: userRecord,
      participants: [],
      items: [
        {
          id: itemId,
          quantity: 2,
          status: "APPROVED",
          assetId,
          asset: {
            id: assetId,
            name: "Camera",
            managementAreaId: areaId,
            managementArea: { id: areaId, name: "Media Lab" },
          },
        },
      ],
    },
    items: [
      {
        id: "00000000-0000-4000-8000-000000000801",
        returnId,
        reservationItemId: itemId,
        quantityReturned: 2,
        quantityBroken: 0,
        quantityLost: 0,
        description: "Returned in good condition.",
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        reservationItem: {
          id: itemId,
          quantity: 2,
          status: "APPROVED",
          assetId,
          asset: {
            id: assetId,
            name: "Camera",
            managementAreaId: areaId,
            managementArea: { id: areaId, name: "Media Lab" },
            assetTemplate: null,
          },
        },
      },
    ],
    approval: {
      id: "00000000-0000-4000-8000-000000000901",
      returnId,
      approverId: requesterId,
      status: "PENDING",
      description: null,
      decidedAt: null,
      approver: userRecord,
    },
  };
}

describe("ReturnsService", () => {
  it("creates a return record for a delivery confirmed reservation", async () => {
    const reservation = sampleReservation("DELIVERY_CONFIRMED");
    const returnRecord = sampleReturnRecord("PENDING");

    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      return: {
        create: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(returnRecord),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: {
            create: vi.fn().mockResolvedValue(returnRecord),
          },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    const result = await service.create(requesterActor, reservationId, {
      items: [
        {
          reservationItemId: itemId,
          quantityReturned: 2,
          quantityBroken: 0,
          quantityLost: 0,
          description: "All intact",
        },
      ],
    });

    expect(result.id).toBe(returnId);
    expect(result.status).toBe("PENDING");
    expect(result.items[0]?.quantityReturned).toBe(2);
  });

  it("rejects return creation on an unconfirmed delivery reservation", async () => {
    const reservation = sampleReservation("APPROVED");
    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await expect(
      service.create(requesterActor, reservationId, {
        items: [
          {
            reservationItemId: itemId,
            quantityReturned: 1,
            quantityBroken: 0,
            quantityLost: 0,
          },
        ],
      }),
    ).rejects.toThrow(/Cannot create return for a reservation with status APPROVED/);
  });

  it("rejects return quantity exceeding remaining unreturned units", async () => {
    const reservation = sampleReservation("DELIVERY_CONFIRMED");
    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(prismaMock)),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await expect(
      service.create(requesterActor, reservationId, {
        items: [
          {
            reservationItemId: itemId,
            quantityReturned: 5, // Approved quantity is only 2
            quantityBroken: 0,
            quantityLost: 0,
          },
        ],
      }),
    ).rejects.toThrow(/exceeds remaining unreturned quantity/);
  });

  it("approves return and completes reservation when area manager decides", async () => {
    const returnRecord = sampleReturnRecord("PENDING");
    const updatedReturnRecord = {
      ...returnRecord,
      status: "COMPLETED",
      approval: {
        ...returnRecord.approval,
        approverId: managerId,
        status: "APPROVED",
        description: "Looks good",
        decidedAt: new Date(),
        approver: managerRecord,
      },
    };

    const updateReturn = vi.fn().mockResolvedValue(updatedReturnRecord);
    const upsertApproval = vi.fn().mockResolvedValue(updatedReturnRecord.approval);
    const createBatch = vi.fn().mockResolvedValue({ id: "batch-1" });
    const createTransaction = vi.fn().mockResolvedValue({});
    const updateItem = vi.fn().mockResolvedValue({});
    const updateReservation = vi.fn().mockResolvedValue({});
    const findReturnItems = vi.fn().mockResolvedValue([
      {
        quantityReturned: 2,
        quantityBroken: 0,
        quantityLost: 0,
      },
    ]);
    const findReservationItems = vi.fn().mockResolvedValue([
      { id: itemId, status: "RETURNED" },
    ]);

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(updatedReturnRecord),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: { update: updateReturn },
          returnApproval: { upsert: upsertApproval },
          assetTransactionBatch: { create: createBatch },
          assetTransaction: { create: createTransaction },
          returnItem: { findMany: findReturnItems },
          reservationItem: {
            update: updateItem,
            findMany: findReservationItems,
          },
          reservation: { update: updateReservation },
        });
      }),
    } as unknown as PrismaService;

    // Fresh event bus (not the shared module-level one) so the listener
    // added here doesn't linger and accumulate across every other test in
    // this file.
    const events = new ReservationLifecycleEvents();
    const returnDecidedSpy = vi.fn();
    events.onReturnDecided(returnDecidedSpy);
    const service = new ReturnsService(prismaMock, events);
    const result = await service.decide(areaManagerActor, reservationId, returnId, {
      decision: "APPROVE",
      description: "Looks good",
    });

    expect(result.status).toBe("COMPLETED");
    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(returnDecidedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId, returnId, decision: "APPROVED" }),
    );
  });

  it("forbids a manager from deciding returns for an unassigned management area", async () => {
    const returnRecord = sampleReturnRecord("PENDING");

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
      },
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await expect(
      service.decide(otherAreaManagerActor, reservationId, returnId, {
        decision: "APPROVE",
      }),
    ).rejects.toThrow(/You do not have the return:approve permission for this management area/);
  });

  it("allows returning and recovering a previously lost item when found", async () => {
    const reservationWithLost = {
      id: reservationId,
      eventName: "Town Hall",
      requesterId: requesterActor.user.id,
      status: "COMPLETED",
      participants: [],
      items: [
        {
          id: itemId,
          assetId,
          quantity: 2,
          status: "RETURNED",
          asset: { id: assetId, managementAreaId: "area-1" },
          returnItems: [
            {
              id: "prev-ret-item",
              quantityReturned: 1,
              quantityBroken: 0,
              quantityLost: 1,
              return: {
                status: "COMPLETED",
                approval: { status: "APPROVED" },
              },
            },
          ],
        },
      ],
    };

    const updateAsset = vi.fn().mockResolvedValue({});
    const createTransaction = vi.fn().mockResolvedValue({});
    const createReturn = vi.fn().mockResolvedValue({});

    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservationWithLost),
      },
      return: {
        create: createReturn,
        findUnique: vi.fn().mockResolvedValue(sampleReturnRecord("PENDING")),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: { create: createReturn },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    const created = await service.create(requesterActor, reservationId, {
      items: [
        {
          reservationItemId: itemId,
          quantityReturned: 1,
          description: "Found the missing unit in drawer",
        },
      ],
    });

    expect(created.status).toBe("PENDING");
    expect(createReturn).toHaveBeenCalled();
  });

  it("decrements asset totalQuantity when items are returned as broken or lost", async () => {
    const returnRecord = sampleReturnRecord("PENDING");
    const updatedReturnRecord = {
      ...returnRecord,
      status: "COMPLETED",
      approval: {
        ...returnRecord.approval,
        approverId: managerId,
        status: "APPROVED",
        description: "1 broken, 1 lost",
        decidedAt: new Date(),
        approver: managerRecord,
      },
    };

    const updateAsset = vi.fn().mockResolvedValue({});
    const updateReturn = vi.fn().mockResolvedValue(updatedReturnRecord);
    const updateReturnItem = vi.fn().mockResolvedValue({});
    const upsertApproval = vi.fn().mockResolvedValue(updatedReturnRecord.approval);
    const createBatch = vi.fn().mockResolvedValue({ id: "batch-1" });
    const createTransaction = vi.fn().mockResolvedValue({});
    const updateItem = vi.fn().mockResolvedValue({});
    const updateReservation = vi.fn().mockResolvedValue({});
    const findReturnItems = vi.fn().mockResolvedValue([
      {
        quantityReturned: 0,
        quantityBroken: 1,
        quantityLost: 1,
      },
    ]);
    const findReservationItems = vi.fn().mockResolvedValue([
      { id: itemId, status: "RETURNED" },
    ]);

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(updatedReturnRecord),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          asset: { update: updateAsset },
          return: { update: updateReturn },
          returnItem: {
            update: updateReturnItem,
            findMany: findReturnItems,
          },
          returnApproval: { upsert: upsertApproval },
          assetTransactionBatch: { create: createBatch },
          assetTransaction: { create: createTransaction },
          reservationItem: {
            update: updateItem,
            findMany: findReservationItems,
          },
          reservation: { update: updateReservation },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    const result = await service.decide(areaManagerActor, reservationId, returnId, {
      decision: "APPROVE",
      items: [
        {
          reservationItemId: itemId,
          quantityReturned: 0,
          quantityBroken: 1,
          quantityLost: 1,
          description: "1 broken lens, 1 lost tripod",
        },
      ],
      description: "1 broken, 1 lost",
    });

    expect(result.status).toBe("COMPLETED");
    expect(updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assetId },
        data: expect.objectContaining({
          totalQuantity: { decrement: 1 },
        }),
      }),
    );
  });

  it("rejects return approval when sum of good, broken, and lost exceeds returned quantity", async () => {
    const returnRecord = sampleReturnRecord("PENDING");
    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => callback(prismaMock)),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await expect(
      service.decide(areaManagerActor, reservationId, returnId, {
        decision: "APPROVE",
        items: [
          {
            reservationItemId: itemId,
            quantityReturned: 2,
            quantityBroken: 1,
            quantityLost: 1, // Total = 4, but returned limit was only 2
          },
        ],
      }),
    ).rejects.toThrow(/cannot exceed the returned quantity/);
  });
});

