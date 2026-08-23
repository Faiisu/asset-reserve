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
const returnItemId = "00000000-0000-4000-8000-000000000801";
const reservationItemUnitId = "00000000-0000-4000-8000-000000000811";
const assetUnitId = "00000000-0000-4000-8000-000000000821";

const requesterActor: AuthenticatedActor = {
  user: {
    id: requesterId,
    username: "requester",
    email: "requester@example.com",
    isActive: true,
    profile: null,
    linkedProviders: ["google"],
    accountLinkRequired: false,
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
        permissions: ["return:approve", "reservation:approve"],
      },
    ],
  },
};

const otherAreaManagerActor: AuthenticatedActor = {
  user: {
    id: otherManagerId,
    username: "other",
    email: "other@example.com",
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
        managementAreaId: otherAreaId,
        permissions: ["return:approve"],
      },
    ],
  },
};

const userRecord = {
  id: requesterId,
  username: "requester",
  email: "requester@example.com",
  profile: null,
};

const managerRecord = {
  id: managerId,
  username: "manager",
  email: "manager@example.com",
  profile: null,
};

function sampleReservation(status = "APPROVED") {
  return {
    id: reservationId,
    requesterId,
    eventName: "Product Demo",
    description: null,
    startAt: new Date("2026-08-01T09:00:00.000Z"),
    endAt: new Date("2026-08-01T11:00:00.000Z"),
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
        quantity: 1,
        status:
          status === "DELIVERY_CONFIRMED"
            ? "DELIVERED"
            : status === "APPROVED"
              ? "PREPARED"
              : "PENDING",
        asset: {
          id: assetId,
          managementAreaId: areaId,
          createdById: requesterId,
          name: "Camera",
          partNumber: null,
          description: null,
          pictureUrl: null,
          isActive: true,
          createdAt: new Date("2026-08-15T00:00:00.000Z"),
          updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        },
      },
    ],
  };
}

function sampleReservationItemUnit(
  overrides: Partial<{ status: string; returnItemUnit: unknown }> = {},
) {
  return {
    id: reservationItemUnitId,
    reservationItemId: itemId,
    assetUnitId,
    status: "CHECKED_OUT",
    returnItemUnit: null,
    ...overrides,
  };
}

function sampleReturnDetailRecord(
  status = "PENDING",
  condition: "GOOD" | "BROKEN" | "LOST" | null = null,
) {
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
    },
    items: [
      {
        id: returnItemId,
        returnId,
        reservationItemId: itemId,
        description: "All intact",
        pictureUrl: null,
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        reservationItem: {
          asset: {
            id: assetId,
            name: "Camera",
            managementArea: { id: areaId, name: "Media Lab" },
          },
        },
        units: [
          {
            id: "00000000-0000-4000-8000-000000000831",
            returnItemId,
            reservationItemUnitId,
            condition,
            pictureUrl: null,
            note: null,
            createdAt: new Date("2026-09-01T12:00:00.000Z"),
            reservationItemUnit: {
              assetUnitId,
              assetUnit: { serialNumber: "SN-001" },
            },
          },
        ],
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

function sampleReturnRecordForDecide(
  status = "PENDING",
  reservationStatus = "RETURN_PENDING",
) {
  return {
    id: returnId,
    reservationId,
    status,
    reservation: {
      status: reservationStatus,
      items: [
        {
          id: itemId,
          status: "DELIVERED",
          asset: { id: assetId, managementAreaId: areaId },
        },
      ],
    },
    items: [
      {
        id: returnItemId,
        reservationItemId: itemId,
        reservationItem: { asset: { id: assetId, managementAreaId: areaId } },
        units: [
          {
            id: "00000000-0000-4000-8000-000000000831",
            reservationItemUnitId,
            reservationItemUnit: { assetUnitId },
          },
        ],
      },
    ],
    approval: { status: "PENDING" },
  };
}

describe("ReturnsService", () => {
  it("uses an opaque createdAt/id cursor for stable list pagination", async () => {
    const first = sampleReturnDetailRecord();
    const second = {
      ...sampleReturnDetailRecord(),
      id: "00000000-0000-4000-8000-000000000702",
      createdAt: new Date("2026-08-31T12:00:00.000Z"),
    };
    const findMany = vi.fn().mockResolvedValue([first, second]);
    const prismaMock = {
      return: { findMany },
    } as unknown as PrismaService;
    const service = new ReturnsService(prismaMock, reservationEvents);

    const result = await service.list(requesterActor, {
      view: "MINE",
      limit: 1,
    });

    expect(result.data).toHaveLength(1);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.nextCursor).not.toBe(first.id);
    expect(
      JSON.parse(
        Buffer.from(result.pageInfo.nextCursor!, "base64url").toString("utf8"),
      ),
    ).toEqual({ createdAt: first.createdAt.toISOString(), id: first.id });
  });

  it("applies both cursor fields to the next return page", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prismaMock = {
      return: { findMany },
    } as unknown as PrismaService;
    const service = new ReturnsService(prismaMock, reservationEvents);
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-09-01T12:00:00.000Z",
        id: returnId,
      }),
    ).toString("base64url");

    await service.list(requesterActor, { view: "MINE", limit: 20, cursor });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                { createdAt: { lt: new Date("2026-09-01T12:00:00.000Z") } },
                {
                  createdAt: new Date("2026-09-01T12:00:00.000Z"),
                  id: { lt: returnId },
                },
              ],
            },
          ]),
        },
      }),
    );
  });

  it("creates a return record for a delivery confirmed reservation", async () => {
    const reservation = sampleReservation("DELIVERY_CONFIRMED");
    const returnDetail = sampleReturnDetailRecord("PENDING");

    const updateReservation = vi.fn().mockResolvedValue({});

    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      reservationItemUnit: {
        findMany: vi.fn().mockResolvedValue([sampleReservationItemUnit()]),
      },
      return: {
        findUnique: vi.fn().mockResolvedValue(returnDetail),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: { create: vi.fn().mockResolvedValue({}) },
          reservation: { update: updateReservation },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    const result = await service.create(requesterActor, reservationId, {
      items: [
        {
          reservationItemId: itemId,
          reservationItemUnitIds: [reservationItemUnitId],
          description: "All intact",
        },
      ],
    });

    expect(result.id).toBe(returnId);
    expect(result.status).toBe("PENDING");
    expect(result.items[0]?.units[0]?.reservationItemUnitId).toBe(
      reservationItemUnitId,
    );
    expect(result.items[0]?.units[0]?.condition).toBeNull();
    expect(typeof result.returnedBy).toBe("string");
    expect(result.returner).toEqual(
      expect.objectContaining({ id: requesterId }),
    );
    expect(result.items[0]?.returnId).toBe(returnId);
    expect(result.items[0]?.createdAt).toBeTruthy();
    expect(result.items[0]?.units[0]?.returnItemId).toBe(returnItemId);
    expect(result.items[0]?.units[0]?.createdAt).toBeTruthy();
    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ status: "RETURN_PENDING" }),
      }),
    );
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
            reservationItemUnitIds: [reservationItemUnitId],
          },
        ],
      }),
    ).rejects.toThrow(
      /Cannot create return for a reservation with status APPROVED/,
    );
  });

  it("creates a return before the reservation end time (event finished early)", async () => {
    const reservation = {
      ...sampleReservation("DELIVERY_CONFIRMED"),
      endAt: new Date("2999-08-01T11:00:00.000Z"),
    };
    const updateReservation = vi.fn().mockResolvedValue({});
    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      reservationItemUnit: {
        findMany: vi.fn().mockResolvedValue([sampleReservationItemUnit()]),
      },
      return: {
        findUnique: vi
          .fn()
          .mockResolvedValue(sampleReturnDetailRecord("PENDING")),
      },
      $transaction: vi.fn().mockImplementation(async (callback) =>
        callback({
          return: { create: vi.fn().mockResolvedValue({}) },
          reservation: { update: updateReservation },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    const result = await service.create(requesterActor, reservationId, {
      items: [
        {
          reservationItemId: itemId,
          reservationItemUnitIds: [reservationItemUnitId],
        },
      ],
    });

    expect(result.status).toBe("PENDING");
    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RETURN_PENDING" }),
      }),
    );
  });

  it("rejects returning a unit that is not checked out", async () => {
    const reservation = sampleReservation("DELIVERY_CONFIRMED");
    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      reservationItemUnit: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            sampleReservationItemUnit({ status: "ASSIGNED" }),
          ]),
      },
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await expect(
      service.create(requesterActor, reservationId, {
        items: [
          {
            reservationItemId: itemId,
            reservationItemUnitIds: [reservationItemUnitId],
          },
        ],
      }),
    ).rejects.toThrow(/is not checked out/);
  });

  it("rejects claiming a unit that is already part of another return", async () => {
    const reservation = sampleReservation("DELIVERY_CONFIRMED");
    const prismaMock = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      reservationItemUnit: {
        findMany: vi.fn().mockResolvedValue([
          sampleReservationItemUnit({
            returnItemUnit: { id: "existing-claim" },
          }),
        ]),
      },
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await expect(
      service.create(requesterActor, reservationId, {
        items: [
          {
            reservationItemId: itemId,
            reservationItemUnitIds: [reservationItemUnitId],
          },
        ],
      }),
    ).rejects.toThrow(/already part of another return/);
  });

  it("approves return, sets the unit condition to good, and completes the reservation", async () => {
    const returnRecord = sampleReturnRecordForDecide("PENDING");
    const returnDetail = sampleReturnDetailRecord("COMPLETED", "GOOD");

    const updateReturn = vi.fn().mockResolvedValue({});
    const upsertApproval = vi.fn().mockResolvedValue({});
    const updateReturnItemUnit = vi.fn().mockResolvedValue({});
    const updateReservationItemUnit = vi
      .fn()
      .mockResolvedValue({ assetUnitId });
    const updateAssetUnit = vi.fn().mockResolvedValue({});
    const createEventBatch = vi.fn().mockResolvedValue({});
    const createEvent = vi.fn().mockResolvedValue({});
    const findReservationItemUnits = vi
      .fn()
      .mockResolvedValue([{ status: "RETURNED_GOOD" }]);
    const updateReservationItem = vi.fn().mockResolvedValue({});
    const findReservationItems = vi
      .fn()
      .mockResolvedValue([{ id: itemId, status: "RETURNED" }]);
    const updateReservation = vi.fn().mockResolvedValue({});

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(returnDetail),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: { update: updateReturn },
          returnApproval: { upsert: upsertApproval },
          returnItemUnit: { update: updateReturnItemUnit },
          reservationItemUnit: {
            update: updateReservationItemUnit,
            findMany: findReservationItemUnits,
          },
          assetUnit: { update: updateAssetUnit },
          assetUnitEventBatch: { create: createEventBatch },
          assetUnitEvent: { create: createEvent },
          reservationItem: {
            update: updateReservationItem,
            findMany: findReservationItems,
          },
          reservation: { update: updateReservation },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        });
      }),
    } as unknown as PrismaService;

    const events = new ReservationLifecycleEvents();
    const returnDecidedSpy = vi.fn();
    events.onReturnDecided(returnDecidedSpy);
    const service = new ReturnsService(prismaMock, events);
    const result = await service.decide(
      areaManagerActor,
      reservationId,
      returnId,
      {
        decision: "APPROVE",
        description: "Looks good",
        items: [
          {
            reservationItemId: itemId,
            units: [{ reservationItemUnitId, condition: "GOOD" }],
          },
        ],
      },
    );

    expect(result.status).toBe("COMPLETED");
    expect(updateAssetUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assetUnitId },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
    expect(updateReservationItemUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationItemUnitId },
        data: expect.objectContaining({ status: "RETURNED_GOOD" }),
      }),
    );
    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(returnDecidedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId,
        returnId,
        decision: "APPROVED",
      }),
    );
  });

  it("forbids a manager from deciding returns for an unassigned management area", async () => {
    const returnRecord = sampleReturnRecordForDecide("PENDING");

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
    ).rejects.toThrow(
      /You do not have the return:approve permission for this management area/,
    );
  });

  it("sets an explicitly reclassified unit's condition to broken", async () => {
    const returnRecord = sampleReturnRecordForDecide("PENDING");
    const returnDetail = sampleReturnDetailRecord("COMPLETED", "BROKEN");

    const updateAssetUnit = vi.fn().mockResolvedValue({});
    const updateReservationItemUnit = vi
      .fn()
      .mockResolvedValue({ assetUnitId });

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(returnDetail),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: { update: vi.fn().mockResolvedValue({}) },
          returnApproval: { upsert: vi.fn().mockResolvedValue({}) },
          returnItemUnit: { update: vi.fn().mockResolvedValue({}) },
          reservationItemUnit: {
            update: updateReservationItemUnit,
            findMany: vi
              .fn()
              .mockResolvedValue([{ status: "RETURNED_BROKEN" }]),
          },
          assetUnit: { update: updateAssetUnit },
          assetUnitEventBatch: { create: vi.fn().mockResolvedValue({}) },
          assetUnitEvent: { create: vi.fn().mockResolvedValue({}) },
          reservationItem: {
            update: vi.fn().mockResolvedValue({}),
            findMany: vi
              .fn()
              .mockResolvedValue([{ id: itemId, status: "RETURNED" }]),
          },
          reservation: { update: vi.fn().mockResolvedValue({}) },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await service.decide(areaManagerActor, reservationId, returnId, {
      decision: "APPROVE",
      items: [
        {
          reservationItemId: itemId,
          units: [{ reservationItemUnitId, condition: "BROKEN" }],
        },
      ],
    });

    expect(updateAssetUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assetUnitId },
        data: expect.objectContaining({ status: "BROKEN" }),
      }),
    );
    expect(updateReservationItemUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationItemUnitId },
        data: expect.objectContaining({ status: "RETURNED_BROKEN" }),
      }),
    );
  });

  it("rejecting a return with no other pending returns reverts the reservation to DELIVERY_CONFIRMED", async () => {
    const returnRecord = sampleReturnRecordForDecide(
      "PENDING",
      "RETURN_PENDING",
    );
    const returnDetail = sampleReturnDetailRecord("REJECTED");

    const deleteManyReturnItemUnits = vi.fn().mockResolvedValue({ count: 1 });
    const countPendingReturns = vi.fn().mockResolvedValue(0);
    const updateReservation = vi.fn().mockResolvedValue({});

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(returnDetail),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          returnItemUnit: { deleteMany: deleteManyReturnItemUnits },
          return: {
            update: vi.fn().mockResolvedValue({}),
            count: countPendingReturns,
          },
          returnApproval: { upsert: vi.fn().mockResolvedValue({}) },
          reservation: { update: updateReservation },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    const result = await service.decide(
      areaManagerActor,
      reservationId,
      returnId,
      { decision: "REJECT", description: "Not what was checked out" },
    );

    expect(result.status).toBe("REJECTED");
    expect(deleteManyReturnItemUnits).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { returnItemId: { in: [returnItemId] } },
      }),
    );
    expect(countPendingReturns).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservationId,
          status: "PENDING",
          id: { not: returnId },
        }),
      }),
    );
    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ status: "DELIVERY_CONFIRMED" }),
      }),
    );
  });

  it("rejecting a return leaves the reservation RETURN_PENDING when another return is still pending", async () => {
    const returnRecord = sampleReturnRecordForDecide(
      "PENDING",
      "RETURN_PENDING",
    );
    const returnDetail = sampleReturnDetailRecord("REJECTED");

    const countPendingReturns = vi.fn().mockResolvedValue(1);
    const updateReservation = vi.fn().mockResolvedValue({});

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(returnDetail),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          returnItemUnit: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          return: {
            update: vi.fn().mockResolvedValue({}),
            count: countPendingReturns,
          },
          returnApproval: { upsert: vi.fn().mockResolvedValue({}) },
          reservation: { update: updateReservation },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await service.decide(areaManagerActor, reservationId, returnId, {
      decision: "REJECT",
    });

    expect(updateReservation).not.toHaveBeenCalled();
  });

  it("approves return partially, keeping the reservation DELIVERY_CONFIRMED when items remain outstanding", async () => {
    const returnRecord = sampleReturnRecordForDecide(
      "PENDING",
      "RETURN_PENDING",
    );
    const returnDetail = sampleReturnDetailRecord("COMPLETED", "GOOD");

    const updateReservation = vi.fn().mockResolvedValue({});

    const prismaMock = {
      return: {
        findFirst: vi.fn().mockResolvedValue(returnRecord),
        findUnique: vi.fn().mockResolvedValue(returnDetail),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({
          return: { update: vi.fn().mockResolvedValue({}) },
          returnApproval: { upsert: vi.fn().mockResolvedValue({}) },
          returnItemUnit: { update: vi.fn().mockResolvedValue({}) },
          reservationItemUnit: {
            update: vi.fn().mockResolvedValue({ assetUnitId }),
            findMany: vi.fn().mockResolvedValue([{ status: "RETURNED_GOOD" }]),
          },
          assetUnit: { update: vi.fn().mockResolvedValue({}) },
          assetUnitEventBatch: { create: vi.fn().mockResolvedValue({}) },
          assetUnitEvent: { create: vi.fn().mockResolvedValue({}) },
          reservationItem: {
            update: vi.fn().mockResolvedValue({}),
            findMany: vi.fn().mockResolvedValue([
              { id: itemId, status: "RETURNED" },
              {
                id: "00000000-0000-4000-8000-000000000202",
                status: "DELIVERED",
              },
            ]),
          },
          reservation: { update: updateReservation },
          activityLog: { create: vi.fn().mockResolvedValue({}) },
        });
      }),
    } as unknown as PrismaService;

    const service = new ReturnsService(prismaMock, reservationEvents);
    await service.decide(areaManagerActor, reservationId, returnId, {
      decision: "APPROVE",
      items: [
        {
          reservationItemId: itemId,
          units: [{ reservationItemUnitId, condition: "GOOD" }],
        },
      ],
    });

    expect(updateReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ status: "DELIVERY_CONFIRMED" }),
      }),
    );
  });
});
