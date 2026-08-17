import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/database/prisma.service.js";
import { UsersService } from "../src/users/users.service.js";
import type { CreateUserDto } from "../src/users/users.dto.js";

const input: CreateUserDto = { username: "new_hire", password: "password123" };

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
