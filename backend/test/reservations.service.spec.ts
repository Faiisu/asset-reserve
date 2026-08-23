import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import { ReservationLifecycleEvents } from "../src/common/reservation-lifecycle.events.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { ReservationsService } from "../src/reservations/reservations.service.js";

// Fresh instance per describe/it isn't needed -- nothing here asserts on
// listener state across tests, only whether a given call emits at all
// (see the dedicated "reservation lifecycle events" describe block below).
const reservationEvents = new ReservationLifecycleEvents();

const actorId = "00000000-0000-4000-8000-000000000001";
const reservationId = "00000000-0000-4000-8000-000000000101";
const itemId = "00000000-0000-4000-8000-000000000201";
const assetId = "00000000-0000-4000-8000-000000000301";
const areaId = "00000000-0000-4000-8000-000000000401";

const actor: AuthenticatedActor = {
  user: {
    id: actorId,
    username: "manager",
    email: "manager@example.com",
    isActive: true,
    profile: null,
    linkedProviders: ["google"],
    accountLinkRequired: false,
  },
  roles: [],
  effectivePermissions: {
    global: [
      "reservation:create",
      "reservation:update",
      "reservation:approve",
      "reservation:reject",
    ],
    byManagementArea: [],
  },
};

const user = {
  id: actorId,
  username: "manager",
  email: actor.user.email,
  profile: null,
};

function detailRecord(status = "PENDING_APPROVAL") {
  return {
    id: reservationId,
    requesterId: actorId,
    eventName: "Town hall",
    description: null,
    startAt: new Date("2026-09-01T09:00:00.000Z"),
    endAt: new Date("2026-09-01T11:00:00.000Z"),
    status,
    createdAt: new Date("2026-08-15T00:00:00.000Z"),
    updatedAt: new Date("2026-08-15T00:00:00.000Z"),
    requester: user,
    participants: [],
    items: [
      {
        id: itemId,
        reservationId,
        assetId,
        quantity: 1,
        status: status === "APPROVED" ? "PREPARED" : "PENDING",
        preparedBy: null,
        preparedAt: null,
        checkedOutBy: null,
        checkedOutAt: null,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        unitAssignments: [],
        asset: {
          id: assetId,
          managementAreaId: areaId,
          createdById: actorId,
          name: "Projector",
          partNumber: null,
          description: null,
          pictureUrl: null,
          isActive: true,
          createdAt: new Date("2026-08-15T00:00:00.000Z"),
          updatedAt: new Date("2026-08-15T00:00:00.000Z"),
          managementArea: {
            id: areaId,
            name: "Main office",
            description: null,
            createdAt: new Date("2026-08-15T00:00:00.000Z"),
            updatedAt: new Date("2026-08-15T00:00:00.000Z"),
          },
        },
        approval: null,
      },
    ],
    returns: [],
  };
}

const assetUnitId = "00000000-0000-4000-8000-000000000901";

function unitCountRows(entries: Array<{ assetId: string; count: number }>) {
  return entries.map(({ assetId: id, count }) => ({
    assetId: id,
    status: "ACTIVE",
    _count: { _all: count },
  }));
}

describe("reservation listing", () => {
  it("lists reservations involving the actor with cursor pagination", async () => {
    const reservation = detailRecord();
    const findMany = vi.fn().mockResolvedValue([reservation]);
    const service = new ReservationsService(
      {
        reservation: { findMany },
      } as unknown as PrismaService,
      reservationEvents,
    );

    const result = await service.list(actor, {
      view: "MINE",
      search: "town",
      limit: 20,
    });

    expect(result.data).toEqual([
      expect.objectContaining({
        id: reservationId,
        eventName: "Town hall",
        itemCount: 1,
        totalQuantity: 1,
        pendingItemCount: 1,
      }),
    ]);
    expect(result.pageInfo).toEqual({
      nextCursor: null,
      hasNextPage: false,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: {
          AND: expect.arrayContaining([
            { requesterId: actorId },
            {
              OR: [
                { eventName: { contains: "town", mode: "insensitive" } },
                { description: { contains: "town", mode: "insensitive" } },
              ],
            },
          ]),
        },
      }),
    );
  });

  it("lists reservations where actor is a participant", async () => {
    const reservation = detailRecord();
    const findMany = vi.fn().mockResolvedValue([reservation]);
    const service = new ReservationsService(
      {
        reservation: { findMany },
      } as unknown as PrismaService,
      reservationEvents,
    );

    await service.list(actor, {
      view: "PARTICIPATING",
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              participants: { some: { userId: actorId } },
            },
          ]),
        },
      }),
    );
  });

  it("does not widen ALL browsing with operational area permissions", async () => {
    const scopedManager: AuthenticatedActor = {
      ...actor,
      effectivePermissions: {
        global: [],
        byManagementArea: [
          {
            managementAreaId: areaId,
            permissions: ["reservation:approve", "reservation:update"],
          },
        ],
      },
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReservationsService(
      { reservation: { findMany } } as unknown as PrismaService,
      reservationEvents,
    );

    await service.list(scopedManager, { view: "ALL", limit: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                { requesterId: actorId },
                { participants: { some: { userId: actorId } } },
              ],
            },
          ]),
        },
      }),
    );
  });

  it("lists decided reservations in approval history", async () => {
    const scopedActor: AuthenticatedActor = {
      ...actor,
      effectivePermissions: {
        global: [],
        byManagementArea: [
          {
            managementAreaId: areaId,
            permissions: ["reservation:approve"],
          },
        ],
      },
    };
    const reservation = detailRecord();
    const findMany = vi.fn().mockResolvedValue([reservation]);
    const service = new ReservationsService(
      {
        reservation: { findMany },
      } as unknown as PrismaService,
      reservationEvents,
    );

    await service.list(scopedActor, {
      view: "APPROVAL_HISTORY",
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  items: expect.objectContaining({
                    some: expect.objectContaining({
                      approval: { is: { approverId: actorId } },
                      asset: { managementAreaId: { in: [areaId] } },
                    }),
                  }),
                }),
              ]),
            }),
          ]),
        },
      }),
    );
  });

  it("returns only actionable area-scoped approval work", async () => {
    const scopedActor: AuthenticatedActor = {
      ...actor,
      effectivePermissions: {
        global: [],
        byManagementArea: [
          {
            managementAreaId: areaId,
            permissions: ["reservation:approve"],
          },
        ],
      },
    };
    const reservation = detailRecord();
    const findMany = vi.fn().mockResolvedValue([reservation]);
    const service = new ReservationsService(
      {
        reservation: { findMany },
      } as unknown as PrismaService,
      reservationEvents,
    );

    const result = await service.list(scopedActor, {
      view: "APPROVALS",
      limit: 20,
    });

    expect(result.data[0]).toMatchObject({
      pendingDecisionCount: 1,
      capabilities: { canReview: true },
    });
    expect(JSON.stringify(findMany.mock.calls[0]?.[0])).toContain(areaId);
    expect(JSON.stringify(findMany.mock.calls[0]?.[0])).toContain(
      "PENDING_APPROVAL",
    );
  });

  it("returns an empty approval queue without decision permissions", async () => {
    const findMany = vi.fn();
    const service = new ReservationsService(
      {
        reservation: { findMany },
      } as unknown as PrismaService,
      reservationEvents,
    );

    const result = await service.list(
      {
        ...actor,
        effectivePermissions: { global: [], byManagementArea: [] },
      },
      { view: "APPROVALS", limit: 20 },
    );

    expect(result).toEqual({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("reservation detail visibility", () => {
  it("does not grant general detail access from operational permissions", async () => {
    const otherUserId = "00000000-0000-4000-8000-000000000099";
    const reservation = {
      ...detailRecord("APPROVED"),
      requesterId: otherUserId,
      requester: { ...user, id: otherUserId },
      items: detailRecord("APPROVED").items.map((item) => ({
        ...item,
        asset: { ...item.asset, createdById: otherUserId },
      })),
    };
    const scopedManager: AuthenticatedActor = {
      ...actor,
      effectivePermissions: {
        global: [],
        byManagementArea: [
          {
            managementAreaId: areaId,
            permissions: ["reservation:approve", "reservation:update"],
          },
        ],
      },
    };
    const service = new ReservationsService(
      {
        reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      } as unknown as PrismaService,
      reservationEvents,
    );

    await expect(service.get(scopedManager, reservationId)).rejects.toThrow(
      /permission/i,
    );
  });
});

describe("reservation availability", () => {
  it("returns a soft warning for overlapping unapproved requests", async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue(unitCountRows([{ assetId, count: 2 }]));
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(detailRecord()) },
      assetUnit: {
        groupBy,
      },
      reservationItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            assetId,
            quantity: 1,
            status: "PENDING",
            reservationId: "00000000-0000-4000-8000-000000000999",
            reservation: { status: "PENDING_APPROVAL" },
            unitAssignments: [],
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(actor, reservationId);

    expect(result.items[0]?.availability).toMatchObject({
      approvedQuantity: 0,
      pendingQuantity: 1,
      availableQuantity: 2,
      pendingReservationCount: 1,
    });
    expect(result.items[0]?.warnings).toEqual([
      expect.objectContaining({ code: "PENDING_RESERVATION_OVERLAP" }),
    ]);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId: { in: [assetId] },
          status: { in: ["ACTIVE", "RESERVED", "CHECKED_OUT"] },
        },
      }),
    );
  });

  it("counts one serial once when multiple assignments overlap the requested range", async () => {
    const reusedUnitId = "00000000-0000-4000-8000-000000000811";
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(detailRecord()) },
      assetUnit: {
        groupBy: vi
          .fn()
          .mockResolvedValue(unitCountRows([{ assetId, count: 2 }])),
      },
      reservationItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            assetId,
            quantity: 1,
            status: "PREPARED",
            reservationId: "00000000-0000-4000-8000-000000000998",
            reservation: { status: "APPROVED" },
            unitAssignments: [{ assetUnitId: reusedUnitId }],
          },
          {
            assetId,
            quantity: 1,
            status: "PREPARED",
            reservationId: "00000000-0000-4000-8000-000000000997",
            reservation: { status: "APPROVED" },
            unitAssignments: [{ assetUnitId: reusedUnitId }],
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(actor, reservationId);

    expect(result.items[0]?.availability).toMatchObject({
      approvedQuantity: 1,
      availableQuantity: 1,
    });
  });

  it("approves selected items together and records one shared decision", async () => {
    const secondItemId = "00000000-0000-4000-8000-000000000202";
    const secondAssetId = "00000000-0000-4000-8000-000000000302";
    const reservation = {
      id: reservationId,
      status: "PENDING_APPROVAL",
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T11:00:00.000Z"),
    };
    const items = [
      {
        id: itemId,
        reservationId,
        assetId,
        quantity: 1,
        status: "PENDING",
        reservation,
        asset: {
          id: assetId,
          managementAreaId: areaId,
          totalQuantity: 2,
        },
      },
      {
        id: secondItemId,
        reservationId,
        assetId: secondAssetId,
        quantity: 1,
        status: "PENDING",
        reservation,
        asset: {
          id: secondAssetId,
          managementAreaId: areaId,
          totalQuantity: 3,
        },
      },
    ];
    const unitId = "00000000-0000-4000-8000-000000000811";
    const secondUnitId = "00000000-0000-4000-8000-000000000812";
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const approvalCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const approvalUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const reservationUpdate = vi.fn().mockResolvedValue({});
    const assetUnitFindMany = vi.fn().mockResolvedValue([
      { id: unitId, assetId, status: "ACTIVE" },
      { id: secondUnitId, assetId: secondAssetId, status: "ACTIVE" },
    ]);
    const assetUnitUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const reservationItemUnitCreateMany = vi
      .fn()
      .mockResolvedValue({ count: 1 });
    const assetUnitEventBatchCreate = vi.fn().mockResolvedValue({});
    const assetUnitEventCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(items)
          .mockResolvedValueOnce([
            { status: "PREPARED" },
            { status: "PREPARED" },
          ]),
        updateMany: itemUpdateMany,
      },
      assetUnit: {
        groupBy: vi.fn().mockResolvedValue(
          unitCountRows([
            { assetId, count: 2 },
            { assetId: secondAssetId, count: 3 },
          ]),
        ),
        findMany: assetUnitFindMany,
        updateMany: assetUnitUpdateMany,
      },
      reservationItemUnit: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: reservationItemUnitCreateMany,
      },
      assetUnitEventBatch: { create: assetUnitEventBatchCreate },
      assetUnitEvent: { createMany: assetUnitEventCreateMany },
      reservationItemApproval: {
        createMany: approvalCreateMany,
        updateMany: approvalUpdateMany,
      },
      reservation: { update: reservationUpdate },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      reservationItem: { findMany: vi.fn().mockResolvedValue(items) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    // Fresh event bus (not the shared module-level one) so the listener
    // added here doesn't linger and accumulate across every other test.
    const events = new ReservationLifecycleEvents();
    const decidedSpy = vi.fn();
    events.onDecided(decidedSpy);
    const service = new ReservationsService(prisma, events);
    const detail = {
      id: reservationId,
      eventName: "Town Hall",
      startAt: reservation.startAt.toISOString(),
      endAt: reservation.endAt.toISOString(),
      requester: { id: actorId, email: "manager@example.com", name: "Manager" },
    } as never;
    vi.spyOn(service, "get").mockResolvedValue(detail);

    await expect(
      service.decideItems(actor, reservationId, {
        items: [
          { reservationItemId: secondItemId, assetUnitIds: [secondUnitId] },
          { reservationItemId: itemId, assetUnitIds: [unitId] },
        ],
        decision: "APPROVE",
        comment: "Ready together",
      }),
    ).resolves.toBe(detail);

    expect(decidedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId,
        status: "APPROVED",
        decision: "APPROVE",
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(assetUnitUpdateMany).not.toHaveBeenCalled();
    expect(assetUnitEventBatchCreate).not.toHaveBeenCalled();
    expect(assetUnitEventCreateMany).not.toHaveBeenCalled();
    expect(reservationItemUnitCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            assetUnitId: unitId,
            assignmentStartAt: reservation.startAt,
            assignmentEndAt: reservation.endAt,
          }),
        ]),
      }),
    );
    expect(reservationItemUnitCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            assetUnitId: secondUnitId,
            assignmentStartAt: reservation.startAt,
            assignmentEndAt: reservation.endAt,
          }),
        ]),
      }),
    );
    expect(itemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: itemId }),
        data: expect.objectContaining({
          status: "PREPARED",
          quantity: 1,
          preparedBy: actorId,
        }),
      }),
    );
    expect(itemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: secondItemId }),
        data: expect.objectContaining({
          status: "PREPARED",
          quantity: 1,
          preparedBy: actorId,
        }),
      }),
    );
    expect(approvalCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            reservationItemId: itemId,
            comment: "Ready together",
          }),
          expect.objectContaining({ reservationItemId: secondItemId }),
        ]),
      }),
    );
    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED" }),
      }),
    );
  });

  it("rejects approval when more units are selected than the item's requested quantity", async () => {
    const reservation = {
      id: reservationId,
      status: "PENDING_APPROVAL",
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T11:00:00.000Z"),
    };
    const item = {
      id: itemId,
      reservationId,
      assetId,
      quantity: 1,
      status: "PENDING",
      reservation,
      asset: { id: assetId, managementAreaId: areaId, totalQuantity: 5 },
    };
    const prisma = {
      reservationItem: { findMany: vi.fn().mockResolvedValue([item]) },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    await expect(
      service.decideItem(actor, reservationId, itemId, {
        decision: "APPROVE",
        assetUnitIds: [
          "00000000-0000-4000-8000-000000000811",
          "00000000-0000-4000-8000-000000000812",
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("approves only some of the requested units, cutting the item's quantity down to match (unit-based partial approval)", async () => {
    const reservation = {
      id: reservationId,
      status: "PENDING_APPROVAL",
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T11:00:00.000Z"),
    };
    const item = {
      id: itemId,
      reservationId,
      assetId,
      quantity: 3,
      status: "PENDING",
      reservation,
      asset: { id: assetId, managementAreaId: areaId, totalQuantity: 5 },
    };
    const unitId = "00000000-0000-4000-8000-000000000811";
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([item])
          .mockResolvedValueOnce([{ status: "PREPARED" }]),
        updateMany: itemUpdateMany,
      },
      assetUnit: {
        groupBy: vi
          .fn()
          .mockResolvedValue(unitCountRows([{ assetId, count: 5 }])),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: unitId, assetId, status: "ACTIVE" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      reservationItemUnit: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetUnitEventBatch: { create: vi.fn().mockResolvedValue({}) },
      assetUnitEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reservationItemApproval: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      reservation: { update: vi.fn().mockResolvedValue({}) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      reservationItem: { findMany: vi.fn().mockResolvedValue([item]) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);
    vi.spyOn(service, "get").mockResolvedValue({
      id: reservationId,
      eventName: "Town Hall",
      startAt: reservation.startAt.toISOString(),
      endAt: reservation.endAt.toISOString(),
      requester: { id: actorId, email: "manager@example.com", name: "Manager" },
    } as never);

    await service.decideItem(actor, reservationId, itemId, {
      decision: "APPROVE",
      assetUnitIds: [unitId],
    });

    expect(itemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: itemId }),
        data: expect.objectContaining({ status: "PREPARED", quantity: 1 }),
      }),
    );
  });

  it("rejects approval when a selected unit is not physically schedulable or belongs to a different asset", async () => {
    const reservation = {
      id: reservationId,
      status: "PENDING_APPROVAL",
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T11:00:00.000Z"),
    };
    const item = {
      id: itemId,
      reservationId,
      assetId,
      quantity: 1,
      status: "PENDING",
      reservation,
      asset: { id: assetId, managementAreaId: areaId, totalQuantity: 5 },
    };
    const unitId = "00000000-0000-4000-8000-000000000811";
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([item])
          .mockResolvedValueOnce([]),
      },
      assetUnit: {
        groupBy: vi
          .fn()
          .mockResolvedValue(unitCountRows([{ assetId, count: 5 }])),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: unitId, assetId, status: "BROKEN" }]),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      reservationItem: { findMany: vi.fn().mockResolvedValue([item]) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    await expect(
      service.decideItem(actor, reservationId, itemId, {
        decision: "APPROVE",
        assetUnitIds: [unitId],
      }),
    ).rejects.toMatchObject({ code: "ASSET_UNIT_UNAVAILABLE" });
  });
});

const returnId = "00000000-0000-4000-8000-000000000701";
const returnItemId = "00000000-0000-4000-8000-000000000801";
const returnItemUnitId = "00000000-0000-4000-8000-000000000831";
const reservationItemUnitId = "00000000-0000-4000-8000-000000000811";

function sampleReturn(status = "PENDING") {
  return {
    id: returnId,
    reservationId,
    status,
    note: null,
    returnedAt: new Date("2026-09-01T12:00:00.000Z"),
    returnedBy: actorId,
    returner: user,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    items: [
      {
        id: returnItemId,
        returnId,
        reservationItemId: itemId,
        description: null,
        pictureUrl: null,
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
        reservationItem: {
          asset: {
            id: assetId,
            name: "Projector",
            managementAreaId: areaId,
            managementArea: { id: areaId, name: "Main office" },
          },
        },
        units: [
          {
            id: returnItemUnitId,
            returnItemId,
            reservationItemUnitId,
            condition: null,
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
    approval: null,
  };
}

describe("reservation returns", () => {
  it("sets capabilities.canDecideReturn when a PENDING return exists in an area the actor can decide", async () => {
    const reservation = {
      ...detailRecord("DELIVERY_CONFIRMED"),
      returns: [sampleReturn("PENDING")],
    };
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      assetUnit: { groupBy: vi.fn().mockResolvedValue([]) },
      reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(
      {
        ...actor,
        effectivePermissions: {
          global: [],
          byManagementArea: [
            { managementAreaId: areaId, permissions: ["return:approve"] },
          ],
        },
      },
      reservationId,
    );

    expect(result.capabilities.canDecideReturn).toBe(true);
  });

  it("leaves capabilities.canDecideReturn false when no return is PENDING", async () => {
    const reservation = {
      ...detailRecord("COMPLETED"),
      returns: [sampleReturn("COMPLETED")],
    };
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      assetUnit: { groupBy: vi.fn().mockResolvedValue([]) },
      reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(
      {
        ...actor,
        effectivePermissions: {
          global: [],
          byManagementArea: [
            { managementAreaId: areaId, permissions: ["return:approve"] },
          ],
        },
      },
      reservationId,
    );

    expect(result.capabilities.canDecideReturn).toBe(false);
  });

  it("leaves capabilities.canDecideReturn false when the actor lacks return:approve in the item's area", async () => {
    const reservation = {
      ...detailRecord("DELIVERY_CONFIRMED"),
      returns: [sampleReturn("PENDING")],
    };
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      assetUnit: { groupBy: vi.fn().mockResolvedValue([]) },
      reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(
      { ...actor, effectivePermissions: { global: [], byManagementArea: [] } },
      reservationId,
    );

    expect(result.capabilities.canDecideReturn).toBe(false);
  });

  it("maps returns with the documented field shape", async () => {
    const reservation = {
      ...detailRecord("DELIVERY_CONFIRMED"),
      returns: [sampleReturn("PENDING")],
    };
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      assetUnit: { groupBy: vi.fn().mockResolvedValue([]) },
      reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(actor, reservationId);
    const ret = result.returns[0]!;

    expect(typeof ret.returnedBy).toBe("string");
    expect(ret.returner).toEqual(expect.objectContaining({ id: actorId }));
    expect(ret.items[0]?.returnId).toBe(returnId);
    expect(ret.items[0]?.createdAt).toBeTruthy();
    expect(ret.items[0]?.units[0]?.returnItemId).toBe(returnItemId);
    expect(ret.items[0]?.units[0]?.createdAt).toBeTruthy();
  });
});

describe("reservation lifecycle events", () => {
  it("submit() resolves approvers with reservation:approve in the affected area and emits submitted", async () => {
    const reservation = detailRecord("DRAFT");
    const findUnique = vi.fn().mockResolvedValue(reservation);
    const assetUnitGroupBy = vi
      .fn()
      .mockResolvedValue(unitCountRows([{ assetId, count: 2 }]));
    const reservationItemFindMany = vi.fn().mockResolvedValue([]); // no overlapping bookings
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userRoleFindMany = vi.fn().mockResolvedValue([
      {
        role: { permissions: ["reservation:approve"] },
        user: {
          id: "approver-id",
          username: "area-approver",
          isActive: true,
          email: "approver@example.com",
          profile: { name: "Area Approver" },
        },
      },
      // Inactive user with the right permission -- must be excluded.
      {
        role: { permissions: ["reservation:approve"] },
        user: {
          id: "gone-id",
          username: "gone",
          isActive: false,
          email: "gone@example.com",
          profile: null,
        },
      },
      // Active user without reservation:approve -- must be excluded.
      {
        role: { permissions: ["reservation:update"] },
        user: {
          id: "editor-id",
          username: "editor",
          isActive: true,
          email: "editor@example.com",
          profile: null,
        },
      },
    ]);
    const prisma = {
      reservation: { findUnique, updateMany },
      assetUnit: { groupBy: assetUnitGroupBy },
      reservationItem: { findMany: reservationItemFindMany },
      userRole: { findMany: userRoleFindMany },
    } as unknown as PrismaService;
    const events = new ReservationLifecycleEvents();
    const submittedSpy = vi.fn();
    events.onSubmitted(submittedSpy);
    const service = new ReservationsService(prisma, events);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.submit(actor, reservationId, {
      expectedUpdatedAt: reservation.updatedAt.toISOString(),
    });

    expect(submittedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId,
        eventName: reservation.eventName,
        approverRecipients: [
          { email: "approver@example.com", name: "Area Approver" },
        ],
      }),
    );
  });

  it("submit() dedupes approvers by id and skips those with no email on file", async () => {
    const reservation = detailRecord("DRAFT");
    const findUnique = vi.fn().mockResolvedValue(reservation);
    const assetUnitGroupBy = vi
      .fn()
      .mockResolvedValue(unitCountRows([{ assetId, count: 2 }]));
    const reservationItemFindMany = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userRoleFindMany = vi.fn().mockResolvedValue([
      // Global approver, granted twice (global + area-scoped role) -- must
      // collapse to a single recipient, keyed by id rather than email.
      {
        role: { permissions: ["reservation:approve"] },
        user: {
          id: "dup-id",
          username: "dup-approver",
          isActive: true,
          email: "dup@example.com",
          profile: { name: "Dup Approver" },
        },
      },
      {
        role: { permissions: ["reservation:approve"] },
        user: {
          id: "dup-id",
          username: "dup-approver",
          isActive: true,
          email: "dup@example.com",
          profile: { name: "Dup Approver" },
        },
      },
      // Active approver who hasn't linked Google yet -- no email on file,
      // must be skipped rather than emailed to `null`.
      {
        role: { permissions: ["reservation:approve"] },
        user: {
          id: "unlinked-id",
          username: "unlinked-approver",
          isActive: true,
          email: null,
          profile: null,
        },
      },
    ]);
    const prisma = {
      reservation: { findUnique, updateMany },
      assetUnit: { groupBy: assetUnitGroupBy },
      reservationItem: { findMany: reservationItemFindMany },
      userRole: { findMany: userRoleFindMany },
    } as unknown as PrismaService;
    const events = new ReservationLifecycleEvents();
    const submittedSpy = vi.fn();
    events.onSubmitted(submittedSpy);
    const service = new ReservationsService(prisma, events);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.submit(actor, reservationId, {
      expectedUpdatedAt: reservation.updatedAt.toISOString(),
    });

    expect(submittedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        approverRecipients: [
          { email: "dup@example.com", name: "Dup Approver" },
        ],
      }),
    );
  });


  it("cancel() emits cancelled with the requester id", async () => {
    const reservation = detailRecord("APPROVED");
    const findUnique = vi.fn().mockResolvedValue(reservation);
    const update = vi.fn().mockResolvedValue({});
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      reservation: { findUnique, update },
      reservationItem: { updateMany: itemUpdateMany },
      $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) =>
        work({
          reservation: { findUnique, update },
          reservationItem: { updateMany: itemUpdateMany },
          reservationItemUnit: { findMany: vi.fn().mockResolvedValue([]) },
          $queryRaw: vi.fn().mockResolvedValue([]),
        }),
      ),
    } as unknown as PrismaService;
    const events = new ReservationLifecycleEvents();
    const cancelledSpy = vi.fn();
    events.onCancelled(cancelledSpy);
    const service = new ReservationsService(prisma, events);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.cancel(actor, reservationId);

    expect(cancelledSpy).toHaveBeenCalledWith({
      reservationId,
      requesterId: actorId,
    });
  });

  it("cancel() removes scheduled assignments without changing physical status", async () => {
    const reservation = detailRecord("APPROVED");
    const findUnique = vi.fn().mockResolvedValue(reservation);
    const update = vi.fn().mockResolvedValue({});
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const unitId = "00000000-0000-4000-8000-000000000811";
    const reservationItemUnitRow = {
      id: "00000000-0000-4000-8000-000000000821",
      reservationItemId: itemId,
      assetUnitId: unitId,
      status: "ASSIGNED",
      assetUnit: { status: "ACTIVE" },
    };
    const reservationItemUnitFindMany = vi
      .fn()
      .mockResolvedValue([reservationItemUnitRow]);
    const assetUnitUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const assetUnitEventBatchCreate = vi.fn().mockResolvedValue({});
    const assetUnitEventCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const reservationItemUnitDeleteMany = vi
      .fn()
      .mockResolvedValue({ count: 1 });
    const prisma = {
      reservation: { findUnique, update },
      reservationItem: { updateMany: itemUpdateMany },
      $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) =>
        work({
          reservation: { findUnique, update },
          reservationItem: { updateMany: itemUpdateMany },
          reservationItemUnit: {
            findMany: reservationItemUnitFindMany,
            deleteMany: reservationItemUnitDeleteMany,
          },
          assetUnit: { updateMany: assetUnitUpdateMany },
          assetUnitEventBatch: { create: assetUnitEventBatchCreate },
          assetUnitEvent: { createMany: assetUnitEventCreateMany },
          $queryRaw: vi.fn().mockResolvedValue([]),
        }),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.cancel(actor, reservationId);

    expect(reservationItemUnitFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reservationItem: { reservationId, status: "PREPARED" },
        },
      }),
    );
    expect(assetUnitUpdateMany).not.toHaveBeenCalled();
    expect(assetUnitEventBatchCreate).not.toHaveBeenCalled();
    expect(assetUnitEventCreateMany).not.toHaveBeenCalled();
    expect(reservationItemUnitDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [reservationItemUnitRow.id] } },
      }),
    );
    expect(itemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING", "PREPARED"] },
        }),
      }),
    );
  });

  it("cancel() rechecks status after locking and cannot cancel a handed-over reservation", async () => {
    const reservation = detailRecord("APPROVED");
    const update = vi.fn();
    const tx = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue({
          status: "DELIVERY_CONFIRMED",
        }),
        update,
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    await expect(service.cancel(actor, reservationId)).rejects.toMatchObject({
      code: "INVALID_RESERVATION_STATUS",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("decideItems() does not emit decided when other items in the reservation are still pending", async () => {
    // Two-area reservation: this decision only covers one item, the other
    // (different area, different approver) is untouched and stays PENDING --
    // the aggregate status must stay PENDING_APPROVAL, and no "your
    // reservation was approved" email should go out yet.
    const secondItemId = "00000000-0000-4000-8000-000000000202";
    const reservation = {
      id: reservationId,
      status: "PENDING_APPROVAL",
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T11:00:00.000Z"),
    };
    const decidedItem = {
      id: itemId,
      reservationId,
      assetId,
      quantity: 1,
      status: "PENDING",
      reservation,
      asset: { id: assetId, managementAreaId: areaId, totalQuantity: 2 },
    };
    const unitId = "00000000-0000-4000-8000-000000000811";
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const reservationUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([decidedItem]) // items being decided
          .mockResolvedValueOnce([
            { status: "PREPARED" },
            { status: "PENDING" }, // the other item, untouched
          ]),
        updateMany: itemUpdateMany,
      },
      assetUnit: {
        groupBy: vi
          .fn()
          .mockResolvedValue(unitCountRows([{ assetId, count: 2 }])),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: unitId, assetId, status: "ACTIVE" }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      reservationItemUnit: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assetUnitEventBatch: { create: vi.fn().mockResolvedValue({}) },
      assetUnitEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      reservationItemApproval: { createMany: vi.fn(), updateMany: vi.fn() },
      reservation: { update: reservationUpdate },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = {
      reservationItem: { findMany: vi.fn().mockResolvedValue([decidedItem]) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const events = new ReservationLifecycleEvents();
    const decidedSpy = vi.fn();
    events.onDecided(decidedSpy);
    const service = new ReservationsService(prisma, events);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.decideItems(actor, reservationId, {
      items: [{ reservationItemId: itemId, assetUnitIds: [unitId] }],
      decision: "APPROVE",
    });

    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING_APPROVAL" }),
      }),
    );
    expect(decidedSpy).not.toHaveBeenCalled();
  });
});

describe("confirmDelivery", () => {
  const unitOneId = "00000000-0000-4000-8000-000000000811";
  const unitTwoId = "00000000-0000-4000-8000-000000000812";
  const assetUnitOneId = "00000000-0000-4000-8000-000000000911";
  const assetUnitTwoId = "00000000-0000-4000-8000-000000000912";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T09:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function preparedReservation(
    unitAssignments: Array<{ id: string; assetUnitId: string; status: string }>,
  ) {
    return {
      id: reservationId,
      requesterId: actorId,
      status: "APPROVED",
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T11:00:00.000Z"),
      participants: [],
      items: [
        {
          id: itemId,
          reservationId,
          assetId,
          quantity: unitAssignments.length,
          status: "PREPARED",
          asset: { id: assetId, managementAreaId: areaId, name: "Camera" },
          unitAssignments,
        },
      ],
    };
  }

  function mockTx(
    item: ReturnType<typeof preparedReservation>["items"][number],
    finalItemStatus: string,
    // How many of the item's units end up handed over, once nothing is left
    // ASSIGNED -- drives DELIVERED (>0) vs CANCELLED (0) and the quantity cut.
    handedOverCount = item.unitAssignments.length,
  ) {
    const reservationItemUpdate = vi.fn().mockResolvedValue({});
    const reservationItemUnitUpdateMany = vi
      .fn()
      .mockImplementation(
        async (args: { where: { id: { in: string[] } } }) => ({
          count: args.where.id.in.length,
        }),
      );
    const assetUnitUpdateMany = vi
      .fn()
      .mockImplementation(
        async (args: { where: { id: { in: string[] } } }) => ({
          count: args.where.id.in.length,
        }),
      );
    const assetUnitEventBatchCreate = vi.fn().mockResolvedValue({});
    const assetUnitEventCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const reservationUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      reservationItem: {
        update: reservationItemUpdate,
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: item.id, status: finalItemStatus }]),
      },
      reservationItemUnit: {
        updateMany: reservationItemUnitUpdateMany,
        count: vi
          .fn()
          .mockImplementation(
            async (args: { where: { status?: unknown } }) =>
              args.where.status === "ASSIGNED"
                ? finalItemStatus === "PREPARED"
                  ? 1
                  : 0
                : handedOverCount,
          ),
      },
      assetUnit: {
        findMany: vi
          .fn()
          .mockImplementation(
            async (args: { where: { id: { in: string[] } } }) =>
              item.unitAssignments
                .filter((unit) => args.where.id.in.includes(unit.assetUnitId))
                .map((unit) => ({
                  id: unit.assetUnitId,
                  status: "ACTIVE",
                })),
          ),
        updateMany: assetUnitUpdateMany,
      },
      assetUnitEventBatch: { create: assetUnitEventBatchCreate },
      assetUnitEvent: { createMany: assetUnitEventCreateMany },
      reservation: {
        findUnique: vi.fn().mockResolvedValue({
          status: "APPROVED",
          startAt: new Date("2026-09-01T09:00:00.000Z"),
          endAt: new Date("2026-09-01T11:00:00.000Z"),
        }),
        update: reservationUpdate,
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    return {
      tx,
      reservationItemUpdate,
      reservationItemUnitUpdateMany,
      assetUnitUpdateMany,
      assetUnitEventCreateMany,
      reservationUpdate,
    };
  }

  it("hands over every remaining ASSIGNED unit when no units are specified (full handover default)", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
      { id: unitTwoId, assetUnitId: assetUnitTwoId, status: "ASSIGNED" },
    ]);
    const {
      tx,
      reservationItemUpdate,
      reservationItemUnitUpdateMany,
      assetUnitUpdateMany,
    } = mockTx(reservation.items[0]!, "DELIVERED");
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.confirmDelivery(actor, reservationId);

    expect(reservationItemUnitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [unitOneId, unitTwoId] } }),
        data: expect.objectContaining({ status: "CHECKED_OUT" }),
      }),
    );
    expect(assetUnitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [assetUnitOneId, assetUnitTwoId] },
        }),
      }),
    );
    expect(reservationItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DELIVERED",
          checkedOutBy: actorId,
        }),
      }),
    );
  });

  it("hands over only the selected serial units, leaving the item PREPARED (partial handover)", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
      { id: unitTwoId, assetUnitId: assetUnitTwoId, status: "ASSIGNED" },
    ]);
    const {
      tx,
      reservationItemUpdate,
      reservationItemUnitUpdateMany,
      assetUnitUpdateMany,
      reservationUpdate,
    } = mockTx(reservation.items[0]!, "PREPARED");
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.confirmDelivery(actor, reservationId, {
      items: [
        { reservationItemId: itemId, reservationItemUnitIds: [unitOneId] },
      ],
    });

    expect(reservationItemUnitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [unitOneId] } }),
      }),
    );
    expect(assetUnitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [assetUnitOneId] } }),
      }),
    );
    // Item still has one ASSIGNED unit left over -- stays PREPARED, no
    // checkedOutBy/checkedOutAt (those only get set once the item is fully
    // delivered), and the reservation itself doesn't advance either.
    expect(reservationItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: "DELIVERED" }),
      }),
    );
    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: "DELIVERY_CONFIRMED" }),
      }),
    );
  });

  it("cancels the units that aren't handed over, delivering the rest", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
      { id: unitTwoId, assetUnitId: assetUnitTwoId, status: "ASSIGNED" },
    ]);
    const {
      tx,
      reservationItemUpdate,
      reservationItemUnitUpdateMany,
      assetUnitUpdateMany,
      reservationUpdate,
    } = mockTx(reservation.items[0]!, "DELIVERED", 1);
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.confirmDelivery(actor, reservationId, {
      items: [
        {
          reservationItemId: itemId,
          reservationItemUnitIds: [unitOneId],
          cancelledReservationItemUnitIds: [unitTwoId],
        },
      ],
    });

    expect(reservationItemUnitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [unitTwoId] } }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    // A cancelled serial never left the store room, so its physical unit is
    // untouched -- only the handed-over one is checked out.
    expect(assetUnitUpdateMany).toHaveBeenCalledTimes(1);
    expect(assetUnitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [assetUnitOneId] } }),
      }),
    );
    // Nothing left ASSIGNED, so the item is done -- delivered, with quantity
    // cut to what actually went out.
    expect(reservationItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DELIVERED", quantity: 1 }),
      }),
    );
    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DELIVERY_CONFIRMED" }),
      }),
    );
  });

  it("cancels the item, and the reservation, when no unit is handed over", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
    ]);
    const { tx, reservationItemUpdate, reservationUpdate, assetUnitUpdateMany } =
      mockTx(reservation.items[0]!, "CANCELLED", 0);
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.confirmDelivery(actor, reservationId, {
      items: [
        {
          reservationItemId: itemId,
          cancelledReservationItemUnitIds: [unitOneId],
        },
      ],
    });

    // Cancelling without naming anything to hand over must not be read as
    // "hand over everything".
    expect(assetUnitUpdateMany).not.toHaveBeenCalled();
    expect(reservationItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
  });

  it("refuses to both hand over and cancel the same serial unit", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
    ]);
    const transaction = vi.fn();
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );

    await expect(
      service.confirmDelivery(actor, reservationId, {
        items: [
          {
            reservationItemId: itemId,
            reservationItemUnitIds: [unitOneId],
            cancelledReservationItemUnitIds: [unitOneId],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ITEM_SELECTION" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects handover of a unit that isn't ASSIGNED to the requested item", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
    ]);
    const transaction = vi.fn();
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );

    await expect(
      service.confirmDelivery(actor, reservationId, {
        items: [
          { reservationItemId: itemId, reservationItemUnitIds: [unitTwoId] },
        ],
      }),
    ).rejects.toMatchObject({ code: "RESERVATION_ITEM_UNIT_UNAVAILABLE" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects handover before the assignment window starts", async () => {
    vi.setSystemTime(new Date("2026-09-01T08:59:59.000Z"));
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
    ]);
    const transaction = vi.fn();
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );

    await expect(
      service.confirmDelivery(actor, reservationId),
    ).rejects.toMatchObject({ code: "HANDOVER_TOO_EARLY" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rechecks status after locking and cannot hand over a cancelled reservation", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
    ]);
    const { tx, assetUnitUpdateMany } = mockTx(
      reservation.items[0]!,
      "PREPARED",
    );
    tx.reservation.findUnique.mockResolvedValue({
      status: "CANCELLED",
      startAt: reservation.startAt,
      endAt: reservation.endAt,
    });
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    await expect(
      service.confirmDelivery(actor, reservationId),
    ).rejects.toMatchObject({ code: "INVALID_RESERVATION_STATUS" });
    expect(assetUnitUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects handover when the unit is not physically available yet", async () => {
    const reservation = preparedReservation([
      { id: unitOneId, assetUnitId: assetUnitOneId, status: "ASSIGNED" },
    ]);
    const { tx } = mockTx(reservation.items[0]!, "PREPARED");
    tx.assetUnit.findMany.mockResolvedValue([
      { id: assetUnitOneId, status: "CHECKED_OUT" },
    ]);
    const prisma = {
      reservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(
      prisma,
      new ReservationLifecycleEvents(),
    );

    await expect(
      service.confirmDelivery(actor, reservationId),
    ).rejects.toMatchObject({ code: "ASSET_UNIT_PHYSICALLY_UNAVAILABLE" });
  });
});
