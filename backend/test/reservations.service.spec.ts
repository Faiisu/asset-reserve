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
    const approvalUpsert = vi.fn();
    const tx = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: actorId }) },
      reservationItem: {
        findFirst: vi.fn().mockResolvedValue(item),
        findMany: vi.fn().mockResolvedValue([
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
      reservationItemApproval: { upsert: approvalUpsert },
      $queryRaw: vi.fn().mockResolvedValue([{ id: assetId }]),
    };
    const prisma = {
      reservationItem: { findFirst: vi.fn().mockResolvedValue(item) },
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
    expect(approvalUpsert).not.toHaveBeenCalled();
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
