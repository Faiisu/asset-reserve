import { hash } from "argon2";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../src/auth/auth.types.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { UsersService } from "../src/users/users.service.js";
import type { CreateUserDto } from "../src/users/users.dto.js";

const input: CreateUserDto = { username: "new_hire", password: "password123" };

const actor: AuthenticatedActor = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "new_hire",
    email: null,
    isActive: true,
    profile: null,
    linkedProviders: [],
    accountLinkRequired: false,
  },
  roles: [],
  effectivePermissions: { global: [], byManagementArea: [] },
};

function userRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    username: "new_hire",
    email: null,
    isActive: true,
    profile: null,
    authIdentities: [],
    userRoles: [],
    createdAt: new Date("2026-08-17T00:00:00.000Z"),
    updatedAt: new Date("2026-08-17T00:00:00.000Z"),
    ...overrides,
  };
}

describe("UsersService.create", () => {
  it("creates a username + password account with no email or profile required", async () => {
    const create = vi.fn().mockResolvedValue(userRecord());
    const prisma = {
      role: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { create },
    } as unknown as PrismaService;

    const result = await new UsersService(prisma).create(input);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: "new_hire",
          email: null,
        }),
      }),
    );
    expect(result.username).toBe("new_hire");
    expect(result.email).toBeNull();
  });

  it("maps a unique-constraint conflict to USERNAME_ALREADY_EXISTS", async () => {
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const prisma = {
      role: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { create },
    } as unknown as PrismaService;

    await expect(new UsersService(prisma).create(input)).rejects.toMatchObject({
      code: "USERNAME_ALREADY_EXISTS",
    });
  });
});

describe("UsersService.updateSelf", () => {
  it("updates only the fields provided, leaving the other untouched", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue(undefined);
    const findUnique = vi.fn().mockResolvedValue(
      userRecord({ email: "new@example.com" }),
    );
    const prisma = {
      user: { update, findUnique },
      userProfile: { upsert },
    } as unknown as PrismaService;

    const result = await new UsersService(prisma).updateSelf(actor, {
      email: "new@example.com",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: actor.user.id },
        data: expect.objectContaining({ email: "new@example.com" }),
      }),
    );
    expect(upsert).not.toHaveBeenCalled();
    expect(result.email).toBe("new@example.com");
  });

  it("upserts a profile row for a user who never had one, when name is set", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const findUnique = vi.fn().mockResolvedValue(
      userRecord({ profile: { name: "Jane Doe", phoneNumber: null, profilePictureUrl: null } }),
    );
    const prisma = {
      user: { update: vi.fn(), findUnique },
      userProfile: { upsert },
    } as unknown as PrismaService;

    await new UsersService(prisma).updateSelf(actor, { name: "Jane Doe" });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: actor.user.id },
        create: expect.objectContaining({ userId: actor.user.id, name: "Jane Doe" }),
        update: expect.objectContaining({ name: "Jane Doe" }),
      }),
    );
  });

  it("maps a unique-constraint conflict on email to EMAIL_ALREADY_IN_USE", async () => {
    const update = vi.fn().mockRejectedValue({ code: "P2002" });
    const prisma = {
      user: { update },
      userProfile: { upsert: vi.fn() },
    } as unknown as PrismaService;

    await expect(
      new UsersService(prisma).updateSelf(actor, { email: "taken@example.com" }),
    ).rejects.toMatchObject({ code: "EMAIL_ALREADY_IN_USE" });
  });
});

describe("UsersService.changeMyPassword", () => {
  it("hashes and stores the new password once the current one verifies", async () => {
    const currentHash = await hash("correct-horse", { type: 2 });
    const findUnique = vi.fn().mockResolvedValue({ passwordHash: currentHash });
    const update = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      user: { findUnique, update },
    } as unknown as PrismaService;

    await new UsersService(prisma).changeMyPassword(actor, {
      currentPassword: "correct-horse",
      newPassword: "new-password-123",
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: actor.user.id },
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
  });

  it("rejects with INVALID_CURRENT_PASSWORD when the current password is wrong", async () => {
    const currentHash = await hash("correct-horse", { type: 2 });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ passwordHash: currentHash }),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    await expect(
      new UsersService(prisma).changeMyPassword(actor, {
        currentPassword: "wrong-password",
        newPassword: "new-password-123",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD" });
  });
});

describe("UsersService.directory", () => {
  it("lists active users only, with no username, roles, or timestamps", async () => {
    const findMany = vi.fn().mockResolvedValue([
      userRecord({
        id: "00000000-0000-4000-8000-000000000010",
        email: "sam@example.com",
        profile: { name: "Sam Rivera", profilePictureUrl: null },
      }),
    ]);
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const service = new UsersService(prisma);

    const result = await service.directory({ search: "sam", limit: 20 });

    const where = findMany.mock.calls[0]?.[0].where;
    expect(where.AND[0]).toEqual({ isActive: true });
    // Search must not cover username -- that is admin-directory data.
    expect(JSON.stringify(where)).not.toContain("username");
    expect(result.data).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000010",
        email: "sam@example.com",
        name: "Sam Rivera",
        profilePictureUrl: null,
      },
    ]);
  });
});
