import { hash } from "argon2";
import { describe, expect, it, vi } from "vitest";
import type { JwtService } from "@nestjs/jwt";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionService } from "../src/auth/session.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";

const userId = "00000000-0000-4000-8000-000000000001";

async function buildAuth(passwordUser?: Record<string, unknown> | null) {
  const passwordHash = await hash("correct-horse", { type: 2 });
  const findByUsername = vi
    .fn()
    .mockResolvedValue(
      passwordUser === undefined
        ? { id: userId, username: "new_hire", passwordHash, isActive: true }
        : passwordUser,
    );
  const findById = vi.fn().mockResolvedValue({
    id: userId,
    username: "new_hire",
    email: null,
    isActive: true,
    profile: null,
    authIdentities: [],
    userRoles: [],
  });
  const prisma = {
    user: {
      findUnique: (args: { where: { id?: string; username?: string } }) =>
        args.where.username ? findByUsername(args) : findById(args),
    },
  } as unknown as PrismaService;
  const sessions = new SessionService(prisma);
  const jwt = {
    signAsync: vi.fn().mockResolvedValue("signed-token"),
  } as unknown as JwtService;
  return { auth: new AuthService(sessions, jwt), findByUsername };
}

describe("AuthService.login", () => {
  it("looks the account up by username, not email", async () => {
    const { auth, findByUsername } = await buildAuth();
    const result = await auth.login("new_hire", "correct-horse");
    expect(findByUsername).toHaveBeenCalledWith({
      where: { username: "new_hire" },
    });
    expect(result.session.user.username).toBe("new_hire");
  });

  it("rejects an unknown username without leaking whether it exists", async () => {
    const { auth } = await buildAuth(null);
    await expect(auth.login("nobody", "whatever")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rejects the wrong password for a real username", async () => {
    const { auth } = await buildAuth();
    await expect(
      auth.login("new_hire", "wrong-password"),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });
});

describe("SessionService.findPasswordUser", () => {
  it("queries by username", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    await new SessionService(prisma).findPasswordUser("someone");
    expect(findUnique).toHaveBeenCalledWith({ where: { username: "someone" } });
  });
});
