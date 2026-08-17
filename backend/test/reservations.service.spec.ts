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
const changeRequestId = "00000000-0000-4000-8000-000000000501";

const actor: AuthenticatedActor = {
  user: {
    id: actorId,
    email: "manager@example.com",
    isActive: true,
    profile: null,
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
        asset: {
          id: assetId,
          assetTemplateId: null,
          managementAreaId: areaId,
          createdById: actorId,
          name: "Projector",
          description: null,
          pictureUrl: null,
          totalQuantity: 2,
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
          assetTemplate: null,
        },
        approval: null,
      },
    ],
    changeRequests: [],
    returns: [],
  };
}

describe("reservation listing", () => {
  it("lists reservations involving the actor with cursor pagination", async () => {
    const reservation = detailRecord();
    const findMany = vi.fn().mockResolvedValue([reservation]);
    const service = new ReservationsService({
      reservation: { findMany },
    } as unknown as PrismaService, reservationEvents);

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
            {
              OR: [
                { requesterId: actorId },
                { participants: { some: { userId: actorId } } },
              ],
            },
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
    const service = new ReservationsService({
      reservation: { findMany },
    } as unknown as PrismaService, reservationEvents);

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
    const service = new ReservationsService({
      reservation: { findMany },
    } as unknown as PrismaService, reservationEvents);

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
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, totalQuantity: 2 }]),
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
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, totalQuantity: 1 }]),
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
      asset: {
        findMany: vi.fn().mockResolvedValue([
          { id: assetId, totalQuantity: 2 },
          { id: secondAssetId, totalQuantity: 3 },
        ]),
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
      expect.objectContaining({ reservationId, status: "APPROVED", decision: "APPROVE" }),
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

describe("reservation change requests", () => {
  it("applies an approved event edit and records its reviewer atomically", async () => {
    const currentReservation = detailRecord("APPROVED");
    const request = {
      id: changeRequestId,
      reservationId,
      requestedBy: actorId,
      changeData: { eventName: "Updated town hall" },
      reason: "Agenda changed",
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date("2026-08-15T01:00:00.000Z"),
      reservation: {
        id: reservationId,
        requesterId: actorId,
        status: "APPROVED",
        startAt: currentReservation.startAt,
        endAt: currentReservation.endAt,
        items: currentReservation.items.map((item) => ({
          ...item,
          asset: {
            id: assetId,
            managementAreaId: areaId,
            totalQuantity: 2,
            isActive: true,
          },
        })),
      },
    };
    const reservationUpdate = vi.fn().mockResolvedValue({});
    const changeUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationChangeRequest: {
        findFirst: vi.fn().mockResolvedValue(request),
        update: changeUpdate,
      },
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: assetId,
            managementAreaId: areaId,
            totalQuantity: 2,
            isActive: true,
          },
        ]),
      },
      reservationItem: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ status: "APPROVED" }]),
      },
      reservation: { update: reservationUpdate },
      $queryRaw: vi.fn().mockResolvedValue([{ id: assetId }]),
    };
    const prisma = {
      reservationChangeRequest: {
        findFirst: vi.fn().mockResolvedValue(request),
      },
      asset: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: assetId,
            managementAreaId: areaId,
            totalQuantity: 2,
            isActive: true,
          },
        ]),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.decideChangeRequest(actor, reservationId, changeRequestId, {
      decision: "APPROVE",
    });

    expect(reservationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ eventName: "Updated town hall" }),
      }),
    );
    expect(changeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          reviewedBy: actorId,
        }),
      }),
    );
  });

  it("forbids non-requester from creating a change request on another user's reservation", async () => {
    const nonRequesterActor: AuthenticatedActor = {
      user: {
        id: "other-user-id",
        email: "other@example.com",
        isActive: true,
        profile: null,
      },
      roles: [],
      effectivePermissions: {
        global: ["reservation:create", "reservation:update"],
        byManagementArea: [],
      },
    };
    const reservation = detailRecord("PENDING_APPROVAL");
    const prisma = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    await expect(
      service.requestChange(nonRequesterActor, reservationId, {
        changeData: { eventName: "New Event Name" },
      }),
    ).rejects.toThrow(
      "You do not have permission to perform this reservation action.",
    );
  });

  it("disables canRequestChange capability when non-requester views reservation detail", async () => {
    const nonRequesterManagerActor: AuthenticatedActor = {
      user: {
        id: "manager-user-id",
        email: "manager@example.com",
        isActive: true,
        profile: null,
      },
      roles: [],
      effectivePermissions: {
        global: [
          "reservation:view",
          "reservation:update",
          "reservation:approve",
        ],
        byManagementArea: [],
      },
    };
    const reservation = detailRecord("PENDING_APPROVAL");
    const prisma = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(reservation),
      },
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, totalQuantity: 2 }]),
      },
      reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);

    const result = await service.get(nonRequesterManagerActor, reservationId);
    expect(result.capabilities.canRequestChange).toBe(false);
  });

  it("creates an event without items and automatically sets status to APPROVED", async () => {
    const reservationCreate = vi.fn().mockResolvedValue({ id: reservationId });
    const userFindFirst = vi
      .fn()
      .mockResolvedValue({ id: actorId, isActive: true });
    const tx = {
      user: { findFirst: userFindFirst },
      reservation: { create: reservationCreate },
      reservationItem: { createMany: vi.fn() },
      reservationParticipant: { createMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new ReservationsService(prisma, reservationEvents);
    vi.spyOn(service, "get").mockResolvedValue({
      id: reservationId,
      status: "APPROVED",
    } as never);

    const result = await service.create(actor, {
      eventName: "Company All-Hands Meeting",
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T11:00:00.000Z",
      status: "PENDING_APPROVAL",
      items: [],
    });

    expect(reservationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: "Company All-Hands Meeting",
        status: "APPROVED",
      }),
    });
    expect(result.status).toBe("APPROVED");
  });

  it("filters out other users rejected/cancelled reservations when regular user lists all reservations", async () => {
    const regularUserActor: AuthenticatedActor = {
      user: {
        id: "regular-user-id",
        email: "user@example.com",
        isActive: true,
        profile: null,
      },
      roles: [],
      effectivePermissions: {
        global: ["reservation:create", "reservation:view"],
        byManagementArea: [],
      },
    };
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ReservationsService({
      reservation: { findMany },
    } as unknown as PrismaService, reservationEvents);

    await service.list(regularUserActor, {
      view: "ALL",
      limit: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  OR: [
                    { requesterId: "regular-user-id" },
                    { participants: { some: { userId: "regular-user-id" } } },
                  ],
                },
                {
                  status: {
                    notIn: [
                      "DRAFT",
                      "PENDING_APPROVAL",
                      "REJECTED",
                      "CANCELLED",
                    ],
                  },
                },
              ],
            },
          ]),
        },
      }),
    );
  });

  it("forbids regular user from viewing another user's pending approval reservation detail", async () => {
    const regularUserActor: AuthenticatedActor = {
      user: {
        id: "regular-user-id",
        email: "user@example.com",
        isActive: true,
        profile: null,
      },
      roles: [],
      effectivePermissions: {
        global: ["reservation:create", "asset:view"],
        byManagementArea: [],
      },
    };
    const pendingReservation = detailRecord("PENDING_APPROVAL");
    const service = new ReservationsService({
      reservation: {
        findUnique: vi.fn().mockResolvedValue(pendingReservation),
      },
    } as unknown as PrismaService, reservationEvents);

    await expect(service.get(regularUserActor, reservationId)).rejects.toThrow(
      "You do not have permission to perform this reservation action.",
    );
  });

  it("forbids regular user from viewing another user's rejected reservation detail", async () => {
    const regularUserActor: AuthenticatedActor = {
      user: {
        id: "regular-user-id",
        email: "user@example.com",
        isActive: true,
        profile: null,
      },
      roles: [],
      effectivePermissions: {
        global: ["reservation:create", "asset:view"],
        byManagementArea: [],
      },
    };
    const rejectedReservation = detailRecord("REJECTED");
    const service = new ReservationsService({
      reservation: {
        findUnique: vi.fn().mockResolvedValue(rejectedReservation),
      },
    } as unknown as PrismaService, reservationEvents);

    await expect(service.get(regularUserActor, reservationId)).rejects.toThrow(
      "You do not have permission to perform this reservation action.",
    );
  });

  it("allows requester to view their own rejected reservation detail", async () => {
    const rejectedReservation = detailRecord("REJECTED");
    const service = new ReservationsService({
      reservation: {
        findUnique: vi.fn().mockResolvedValue(rejectedReservation),
      },
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, totalQuantity: 2 }]),
      },
      reservationItem: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService, reservationEvents);

    const result = await service.get(actor, reservationId);
    expect(result.id).toBe(reservationId);
    expect(result.status).toBe("REJECTED");
  });

  it("allows requester to confirm delivery for an approved reservation and auto-advance status", async () => {
    const approvedReservation = detailRecord("APPROVED");
    const update = vi.fn();
    const updateMany = vi.fn();
    const prisma = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(approvedReservation),
        update,
      },
      reservationItem: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany,
      },
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, totalQuantity: 2 }]),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          reservation: { update },
          reservationItem: {
            findMany: vi
              .fn()
              .mockResolvedValue([{ id: itemId, status: "DELIVERED" }]),
            updateMany,
          },
        }),
      ),
    } as unknown as PrismaService;

    const service = new ReservationsService(prisma, reservationEvents);
    const result = await service.confirmDelivery(actor, reservationId);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.objectContaining({ status: "DELIVERY_CONFIRMED" }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [itemId] },
          reservationId,
        },
        data: expect.objectContaining({ status: "DELIVERED" }),
      }),
    );
    expect(result.id).toBe(reservationId);
  });

  it.each(["participant", "asset manager"] as const)(
    "allows an event %s to confirm handover for an authorized item",
    async (actorKind) => {
      const approvedReservation = detailRecord("APPROVED");
      const participantId = "00000000-0000-4000-8000-000000000777";
      if (actorKind === "participant") {
        approvedReservation.participants.push({
          userId: participantId,
          reservationId,
          createdAt: new Date("2026-08-15T00:00:00.000Z"),
          user: { id: participantId, email: "participant@example.com", profile: null },
        } as never);
      }
      const handoverActor: AuthenticatedActor = {
        user: {
          id:
            actorKind === "participant"
              ? participantId
              : "00000000-0000-4000-8000-000000000778",
          email: `${actorKind.replace(" ", "-")}@example.com`,
          isActive: true,
          profile: null,
        },
        roles: [],
        effectivePermissions: {
          global: [],
          byManagementArea:
            actorKind === "asset manager"
              ? [{ managementAreaId: areaId, permissions: ["asset:update"] }]
              : [],
        },
      };
      const update = vi.fn();
      const updateMany = vi.fn();
      const prisma = {
        reservation: { findUnique: vi.fn().mockResolvedValue(approvedReservation) },
        $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
          cb({
            reservation: { update },
            reservationItem: {
              updateMany,
              findMany: vi.fn().mockResolvedValue([
                { id: itemId, status: "DELIVERED" },
              ]),
            },
          }),
        ),
      } as unknown as PrismaService;
      const service = new ReservationsService(prisma, reservationEvents);
      vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

      await expect(
        service.confirmDelivery(handoverActor, reservationId, {
          itemIds: [itemId],
        }),
      ).resolves.toEqual({ id: reservationId });
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [itemId] }, reservationId } }),
      );
    },
  );

  it("rejects handover confirmation outside the event team and asset manager area", async () => {
    const approvedReservation = detailRecord("APPROVED");
    const outsider: AuthenticatedActor = {
      user: {
        id: "00000000-0000-4000-8000-000000000779",
        email: "outsider@example.com",
        isActive: true,
        profile: null,
      },
      roles: [],
      effectivePermissions: { global: [], byManagementArea: [] },
    };
    const service = new ReservationsService({
      reservation: { findUnique: vi.fn().mockResolvedValue(approvedReservation) },
    } as unknown as PrismaService, reservationEvents);

    await expect(
      service.confirmDelivery(outsider, reservationId, { itemIds: [itemId] }),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
  });

  it("supports partial item delivery confirmation without prematurely advancing event status", async () => {
    const approvedReservation = detailRecord("APPROVED");
    const itemId2 = "00000000-0000-0000-0000-000000000088";
    approvedReservation.items.push({
      ...approvedReservation.items[0]!,
      id: itemId2,
      status: "APPROVED",
    });

    const update = vi.fn();
    const updateMany = vi.fn();
    const prisma = {
      reservation: {
        findUnique: vi.fn().mockResolvedValue(approvedReservation),
        update,
      },
      reservationItem: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany,
      },
      asset: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: assetId, totalQuantity: 2 }]),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          reservation: { update },
          reservationItem: {
            findMany: vi.fn().mockResolvedValue([
              { id: itemId, status: "DELIVERED" },
              { id: itemId2, status: "APPROVED" },
            ]),
            updateMany,
          },
        }),
      ),
    } as unknown as PrismaService;

    const service = new ReservationsService(prisma, reservationEvents);
    await service.confirmDelivery(actor, reservationId, { itemIds: [itemId] });

    // Should update the specific item
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [itemId] },
          reservationId,
        },
        data: expect.objectContaining({ status: "DELIVERED" }),
      }),
    );
    // Should NOT advance status to DELIVERY_CONFIRMED because itemId2 is still APPROVED
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reservationId },
        data: expect.not.objectContaining({ status: "DELIVERY_CONFIRMED" }),
      }),
    );
  });
});

describe("reservation lifecycle events", () => {
  it("submit() resolves approvers with reservation:approve in the affected area and emits submitted", async () => {
    const reservation = detailRecord("DRAFT");
    const findUnique = vi.fn().mockResolvedValue(reservation);
    const assetFindMany = vi.fn().mockResolvedValue([{ id: assetId, totalQuantity: 2 }]);
    const reservationItemFindMany = vi.fn().mockResolvedValue([]); // no overlapping bookings
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const userRoleFindMany = vi.fn().mockResolvedValue([
      {
        role: { permissions: ["reservation:approve"] },
        user: {
          isActive: true,
          email: "approver@example.com",
          profile: { name: "Area Approver" },
        },
      },
      // Inactive user with the right permission -- must be excluded.
      {
        role: { permissions: ["reservation:approve"] },
        user: { isActive: false, email: "gone@example.com", profile: null },
      },
      // Active user without reservation:approve -- must be excluded.
      {
        role: { permissions: ["reservation:update"] },
        user: { isActive: true, email: "editor@example.com", profile: null },
      },
    ]);
    const prisma = {
      reservation: { findUnique, updateMany },
      asset: { findMany: assetFindMany },
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
        approverRecipients: [{ email: "approver@example.com", name: "Area Approver" }],
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
    const changeRequestUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      reservation: { findUnique, update },
      reservationItem: { updateMany: itemUpdateMany },
      reservationChangeRequest: { updateMany: changeRequestUpdateMany },
      $transaction: vi.fn(
        async (work: (client: unknown) => Promise<unknown>) =>
          work({
            reservation: { update },
            reservationItem: { updateMany: itemUpdateMany },
            reservationChangeRequest: { updateMany: changeRequestUpdateMany },
          }),
      ),
    } as unknown as PrismaService;
    const events = new ReservationLifecycleEvents();
    const cancelledSpy = vi.fn();
    events.onCancelled(cancelledSpy);
    const service = new ReservationsService(prisma, events);
    vi.spyOn(service, "get").mockResolvedValue({ id: reservationId } as never);

    await service.cancel(actor, reservationId);

    expect(cancelledSpy).toHaveBeenCalledWith({ reservationId, requesterId: actorId });
  });
});
