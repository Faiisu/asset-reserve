import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { ReputationService } from "../src/reputation/reputation.service.js";

const reservationId = "00000000-0000-4000-8000-000000000601";
const returnId = "00000000-0000-4000-8000-000000000701";
const requesterId = "00000000-0000-4000-8000-000000000001";
const participantId = "00000000-0000-4000-8000-000000000002";

function makeTx(overrides?: {
  createMany?: ReturnType<typeof vi.fn>;
  executeRaw?: ReturnType<typeof vi.fn>;
}) {
  const createMany = overrides?.createMany ?? vi.fn().mockResolvedValue({ count: 0 });
  const executeRaw = overrides?.executeRaw ?? vi.fn().mockResolvedValue(1);
  const tx = {
    reputationEvent: { createMany },
    $executeRaw: executeRaw,
  } as unknown as Prisma.TransactionClient;
  return { tx, createMany, executeRaw };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReputationService.recordReturnOutcome", () => {
  it("does nothing when there are no affected users", async () => {
    const { tx, createMany, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T10:00:00.000Z"),
      returnedAt: new Date("2026-08-24T10:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [],
      unitConditions: ["GOOD"],
    });

    expect(createMany).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("awards +5 for an on-time return with no broken/lost units", async () => {
    const { tx, createMany, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T10:00:00.000Z"),
      returnedAt: new Date("2026-08-24T10:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD", "GOOD"],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: requesterId,
          type: "RETURN_ON_TIME",
          delta: 5,
          reservationId,
          returnId,
        }),
      ],
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      100,
      0,
      5,
      [requesterId],
    );
  });

  it("deducts 5 for a late return, judged by when the borrower actually returned it, not when it was decided", async () => {
    const { tx, createMany, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      // Decided days after the fact -- must NOT be what lateness is judged
      // against, or approval-queue latency alone would penalize an
      // on-time borrower.
      decidedAt: new Date("2026-08-27T09:00:00.000Z"),
      returnedAt: new Date("2026-08-24T13:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD"],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: "RETURN_LATE", delta: -5 })],
    });
    expect(executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      100,
      0,
      -5,
      [requesterId],
    );
  });

  it("is on time when returnedAt is before the reservation's end, even if decided well after it", async () => {
    const { tx, createMany } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-27T09:00:00.000Z"), // approver got to it days later
      returnedAt: new Date("2026-08-24T11:00:00.000Z"), // borrower returned it on time
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD"],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ type: "RETURN_ON_TIME", delta: 5 })],
    });
  });

  it("stacks a -5 penalty per broken/lost unit on top of the late/on-time delta", async () => {
    const { tx, createMany, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T10:00:00.000Z"),
      returnedAt: new Date("2026-08-24T10:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD", "BROKEN", "LOST"],
    });

    // 1 on-time event + 2 broken/lost events = 3 rows for this one user,
    // batched into a single createMany call.
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data;
    expect(rows.map((row: { type: string }) => row.type)).toEqual([
      "RETURN_ON_TIME",
      "ASSET_BROKEN",
      "ASSET_LOST",
    ]);
    // +5 on-time, -5 broken, -5 lost = -5 total.
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      100,
      0,
      -5,
      [requesterId],
    );
  });

  it("applies the identical delta to every affected user in one batched write, deduplicated", async () => {
    const { tx, createMany, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T13:00:00.000Z"),
      returnedAt: new Date("2026-08-24T13:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      // requesterId repeated (e.g. also a participant) -- must not double-apply.
      affectedUserIds: [requesterId, participantId, requesterId],
      unitConditions: ["BROKEN"],
    });

    // 2 unique users x 2 events each (late + broken) = 4 rows, one createMany call.
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(4);
    // One clamped update for both users at once via ANY(...), not one per user.
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      100,
      0,
      -10,
      [requesterId, participantId],
    );
  });
});

describe("ReputationService.getForUser", () => {
  it("returns null for an unknown user", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const service = new ReputationService(prisma);

    expect(await service.getForUser(requesterId)).toBeNull();
  });

  it("reports updatedAt as null when the score has never moved", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: requesterId,
      email: "jane@example.com",
      reputation: 100,
      profile: { name: "Jane Doe" },
      reputationEvents: [],
    });
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const service = new ReputationService(prisma);

    expect(await service.getForUser(requesterId)).toEqual({
      userId: requesterId,
      name: "Jane Doe",
      email: "jane@example.com",
      score: 100,
      updatedAt: null,
    });
  });

  it("reports updatedAt as the most recent reputation event's timestamp, not the user row's own updatedAt", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: requesterId,
      email: "jane@example.com",
      reputation: 85,
      // Stale/unrelated -- e.g. last profile edit, months ago. Must be
      // ignored in favor of the actual reputation event timestamp below.
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      profile: { name: "Jane Doe" },
      reputationEvents: [{ createdAt: new Date("2026-08-24T00:00:00.000Z") }],
    });
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const service = new ReputationService(prisma);

    expect(await service.getForUser(requesterId)).toEqual({
      userId: requesterId,
      name: "Jane Doe",
      email: "jane@example.com",
      score: 85,
      updatedAt: "2026-08-24T00:00:00.000Z",
    });
  });
});
