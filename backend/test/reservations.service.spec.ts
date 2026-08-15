import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { ReservationsService } from "../src/reservations/reservations.service.js";

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
    } as unknown as PrismaService);

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
    } as unknown as PrismaService);

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
    } as unknown as PrismaService);

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
    const service = new ReservationsService(prisma);

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
    const service = new ReservationsService(prisma);

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
    const service = new ReservationsService(prisma);
    const detail = { id: reservationId } as never;
    vi.spyOn(service, "get").mockResolvedValue(detail);

    await expect(
      service.decideItems(actor, reservationId, {
        itemIds: [secondItemId, itemId],
        decision: "APPROVE",
        comment: "Ready together",
      }),
    ).resolves.toBe(detail);

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
    const service = new ReservationsService(prisma);
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
});
