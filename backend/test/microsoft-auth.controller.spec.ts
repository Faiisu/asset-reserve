import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { MicrosoftAuthController } from "../src/microsoft-auth/microsoft-auth.controller.js";
import type { MicrosoftAuthService } from "../src/microsoft-auth/microsoft-auth.service.js";
import type { ExternalIdentitySessionService } from "../src/auth/external-identity-session.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import type { MicrosoftCallbackQueryDto } from "../src/microsoft-auth/microsoft-auth.dto.js";

function fakeReply() {
  return { redirect: vi.fn() } as unknown as FastifyReply & {
    redirect: ReturnType<typeof vi.fn>;
  };
}

const identity = {
  sub: "microsoft-home-account-id-1",
  email: "alice@outlook.com",
  emailVerified: true,
  name: "Alice",
  picture: null,
};

function fakeSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    verifyState: vi
      .fn()
      .mockResolvedValue({ purpose: "connect", userId: "user-1" }),
    issueSession: vi.fn(),
    signState: vi.fn(),
    ...overrides,
  } as unknown as ExternalIdentitySessionService;
}

beforeEach(() => {
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client-id");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv(
    "MICROSOFT_REDIRECT_URI",
    "http://localhost:3000/api/v1/auth/microsoft/callback",
  );
  vi.stubEnv("FRONTEND_BASE_URL", "http://localhost:5173");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MicrosoftAuthController.callback -- connect purpose", () => {
  it("links the identity and populates email/profile when both are absent (no picture -- Microsoft has none)", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession();
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueProfile = vi.fn().mockResolvedValue(null);
    const createProfile = vi.fn().mockResolvedValue({});
    const prisma = {
      userAuthIdentity: { upsert },
      user: { updateMany, create: vi.fn() },
      userProfile: { findUnique: findUniqueProfile, create: createProfile },
    } as unknown as PrismaService;

    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_provider: { userId: "user-1", provider: "microsoft" } },
        create: expect.objectContaining({
          userId: "user-1",
          provider: "microsoft",
          providerUserId: "microsoft-home-account-id-1",
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", email: null },
      data: { email: "alice@outlook.com" },
    });
    expect(createProfile).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Alice", profilePictureUrl: null },
    });
    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/connect-account/callback?ok=1",
      302,
    );
  });

  it("still succeeds when the email is already claimed by another user", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession();
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockRejectedValue({ code: "P2002" });
    const prisma = {
      userAuthIdentity: { upsert },
      user: { updateMany, create: vi.fn() },
      userProfile: {
        findUnique: vi.fn().mockResolvedValue({ userId: "user-1" }),
        create: vi.fn(),
      },
    } as unknown as PrismaService;

    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/connect-account/callback?ok=1",
      302,
    );
  });

  it("redirects with an error if this Microsoft identity is already linked to someone else", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession();
    const prisma = {
      userAuthIdentity: {
        upsert: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
      user: { updateMany: vi.fn(), create: vi.fn() },
      userProfile: { findUnique: vi.fn(), create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/connect-account?microsoftError=microsoft_failed",
      302,
    );
  });
});

describe("MicrosoftAuthController.callback -- login purpose", () => {
  it("issues a session for an already-linked identity", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession({
      verifyState: vi.fn().mockResolvedValue({ purpose: "login" }),
      issueSession: vi.fn().mockResolvedValue({ accessToken: "fresh-token" }),
    });
    const prisma = {
      userAuthIdentity: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ userId: "user-2", provider: "microsoft" }),
      },
      user: { create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(session.issueSession).toHaveBeenCalledWith("user-2");
    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/auth/callback?token=fresh-token",
      302,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("never provisions a user for an unlinked identity", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession({
      verifyState: vi.fn().mockResolvedValue({ purpose: "login" }),
    });
    const prisma = {
      userAuthIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?microsoftError=not_linked",
      302,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(session.issueSession).not.toHaveBeenCalled();
  });

  it("redirects with an inactive error when the linked user can no longer get a session", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession({
      verifyState: vi.fn().mockResolvedValue({ purpose: "login" }),
      issueSession: vi.fn().mockResolvedValue(null),
    });
    const prisma = {
      userAuthIdentity: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ userId: "user-3", provider: "microsoft" }),
      },
      user: { create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?microsoftError=inactive",
      302,
    );
  });
});

describe("MicrosoftAuthController.callback -- shared failure paths", () => {
  it("redirects to login when Microsoft reports an error (consent denied)", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn(),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession();
    const prisma = {} as PrismaService;
    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();

    await controller.callback(
      { error: "access_denied" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?microsoftError=microsoft_failed",
      302,
    );
    expect(session.verifyState).not.toHaveBeenCalled();
  });

  it("redirects to login when the signed state fails verification", async () => {
    const microsoftAuth = {
      exchangeCode: vi.fn(),
    } as unknown as MicrosoftAuthService;
    const session = fakeSession({
      verifyState: vi.fn().mockRejectedValue(new Error("expired")),
    });
    const prisma = {} as PrismaService;
    const controller = new MicrosoftAuthController(
      microsoftAuth,
      session,
      prisma,
    );
    const reply = fakeReply();

    await controller.callback(
      { code: "auth-code", state: "tampered" } as MicrosoftCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?microsoftError=microsoft_failed",
      302,
    );
    expect(microsoftAuth.exchangeCode).not.toHaveBeenCalled();
  });
});
