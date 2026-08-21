import { describe, expect, it, vi } from "vitest";
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
        status: status === "APPROVED" ? "APPROVED" : "PENDING",
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
                      approval: { isNot: null },
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

describe("reservation availability", () => {
  it("returns a soft warning for overlapping unapproved requests", async () => {
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
            status: "PENDING",
            reservationId: "00000000-0000-4000-8000-000000000999",
            reservation: { status: "PENDING_APPROVAL" },
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
  });

  it("blocks approval when approved overlapping quantities consume capacity", async () => {
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
      asset: {
        id: assetId,
        managementAreaId: areaId,
        totalQuantity: 1,
      },
    };
    const approvalCreateMany = vi.fn();
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([item])
          .mockResolvedValueOnce([
            {
              assetId,
              quantity: 1,
              status: "APPROVED",
              reservationId: "00000000-0000-4000-8000-000000000998",
              reservation: { status: "APPROVED" },
            },
          ]),
      },
      assetUnit: {
        groupBy: vi
          .fn()
          .mockResolvedValue(unitCountRows([{ assetId, count: 1 }])),
      },
      reservationItemApproval: { createMany: approvalCreateMany },
      $queryRaw: vi.fn().mockResolvedValue([{ id: assetId }]),
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
      }),
    ).rejects.toMatchObject({ code: "RESERVATION_CONFLICT" });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(approvalCreateMany).not.toHaveBeenCalled();
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
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const approvalCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    const approvalUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const reservationUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(items)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { status: "APPROVED" },
            { status: "APPROVED" },
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
      },
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
        itemIds: [secondItemId, itemId],
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
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(itemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [itemId, secondItemId] } }),
        data: expect.objectContaining({ status: "APPROVED" }),
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

  it("submit() does not emit when a zero-item reservation auto-approves", async () => {
    const reservation = { ...detailRecord("DRAFT"), items: [] };
    const findUnique = vi.fn().mockResolvedValue(reservation);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userRoleFindMany = vi.fn();
    const prisma = {
      reservation: { findUnique, updateMany },
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

    expect(submittedSpy).not.toHaveBeenCalled();
    expect(userRoleFindMany).not.toHaveBeenCalled();
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
          reservation: { update },
          reservationItem: { updateMany: itemUpdateMany },
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
    const itemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const reservationUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([decidedItem]) // items being decided
          .mockResolvedValueOnce([]) // overlapping-booking check
          .mockResolvedValueOnce([
            { status: "APPROVED" },
            { status: "PENDING" }, // the other item, untouched
          ]),
        updateMany: itemUpdateMany,
      },
      assetUnit: {
        groupBy: vi
          .fn()
          .mockResolvedValue(unitCountRows([{ assetId, count: 2 }])),
      },
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
      itemIds: [itemId],
      decision: "APPROVE",
    });

    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_APPROVAL" }) }),
    );
    expect(decidedSpy).not.toHaveBeenCalled();
  });
});
