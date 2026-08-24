import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { ReputationService } from "../src/reputation/reputation.service.js";

const reservationId = "00000000-0000-4000-8000-000000000601";
const returnId = "00000000-0000-4000-8000-000000000701";
const requesterId = "00000000-0000-4000-8000-000000000001";
const participantId = "00000000-0000-4000-8000-000000000002";

function makeTx(overrides?: {
  create?: ReturnType<typeof vi.fn>;
  executeRaw?: ReturnType<typeof vi.fn>;
}) {
  const create = overrides?.create ?? vi.fn().mockResolvedValue({});
  const executeRaw = overrides?.executeRaw ?? vi.fn().mockResolvedValue(1);
  const tx = {
    reputationEvent: { create },
    $executeRaw: executeRaw,
  } as unknown as Prisma.TransactionClient;
  return { tx, create, executeRaw };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ReputationService.recordReturnOutcome", () => {
  it("does nothing when there are no affected users", async () => {
    const { tx, create, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T10:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [],
      unitConditions: ["GOOD"],
    });

    expect(create).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("awards +5 for an on-time return with no broken/lost units", async () => {
    const { tx, create, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T10:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD", "GOOD"],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: requesterId,
        type: "RETURN_ON_TIME",
        delta: 5,
        reservationId,
        returnId,
      }),
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledWith(expect.anything(), 100, 0, 5, requesterId);
  });

  it("deducts 5 for a late return", async () => {
    const { tx, create, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T13:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD"],
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "RETURN_LATE", delta: -5 }),
    });
    expect(executeRaw).toHaveBeenCalledWith(expect.anything(), 100, 0, -5, requesterId);
  });

  it("stacks a -5 penalty per broken/lost unit on top of the late/on-time delta", async () => {
    const { tx, create, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T10:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      affectedUserIds: [requesterId],
      unitConditions: ["GOOD", "BROKEN", "LOST"],
    });

    // 1 on-time event + 2 broken/lost events = 3 rows for this one user.
    expect(create).toHaveBeenCalledTimes(3);
    const types = create.mock.calls.map((call) => call[0].data.type);
    expect(types).toEqual(["RETURN_ON_TIME", "ASSET_BROKEN", "ASSET_LOST"]);
    // +5 on-time, -5 broken, -5 lost = -5 total.
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledWith(expect.anything(), 100, 0, -5, requesterId);
  });

  it("applies the identical delta to every affected user, deduplicated", async () => {
    const { tx, create, executeRaw } = makeTx();
    const service = new ReputationService({} as unknown as PrismaService);

    await service.recordReturnOutcome(tx, {
      reservationId,
      returnId,
      decidedAt: new Date("2026-08-24T13:00:00.000Z"),
      reservationEndAt: new Date("2026-08-24T12:00:00.000Z"),
      // requesterId repeated (e.g. also a participant) -- must not double-apply.
      affectedUserIds: [requesterId, participantId, requesterId],
      unitConditions: ["BROKEN"],
    });

    // 2 unique users x 2 events each (late + broken) = 4 rows.
    expect(create).toHaveBeenCalledTimes(4);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw).toHaveBeenCalledWith(expect.anything(), 100, 0, -10, requesterId);
    expect(executeRaw).toHaveBeenCalledWith(expect.anything(), 100, 0, -10, participantId);
  });
});

describe("ReputationService.getForUser", () => {
  it("returns null for an unknown user", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const service = new ReputationService(prisma);

    expect(await service.getForUser(requesterId)).toBeNull();
  });

  it("maps the user row to a summary", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: requesterId,
      email: "jane@example.com",
      reputation: 85,
      updatedAt: new Date("2026-08-24T00:00:00.000Z"),
      profile: { name: "Jane Doe" },
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
