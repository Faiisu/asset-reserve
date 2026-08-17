import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";
import { GoogleAuthController } from "../src/google-auth/google-auth.controller.js";
import type { GoogleAuthService } from "../src/google-auth/google-auth.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import type { GoogleCallbackQueryDto } from "../src/google-auth/google-auth.dto.js";

function fakeReply() {
  return { redirect: vi.fn() } as unknown as FastifyReply & { redirect: ReturnType<typeof vi.fn> };
}

const identity = {
  sub: "google-sub-1",
  email: "alice@example.com",
  emailVerified: true,
  name: "Alice",
  picture: "https://example.com/pic.jpg",
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/v1/auth/google/callback");
  vi.stubEnv("FRONTEND_BASE_URL", "http://localhost:5173");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GoogleAuthController.callback -- connect purpose", () => {
  it("links the identity and populates email/profile when both are absent", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockResolvedValue({ purpose: "connect", userId: "user-1" }),
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as GoogleAuthService;
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueProfile = vi.fn().mockResolvedValue(null);
    const createProfile = vi.fn().mockResolvedValue({});
    const prisma = {
      userAuthIdentity: { upsert },
      user: { updateMany, create: vi.fn() },
      userProfile: { findUnique: findUniqueProfile, create: createProfile },
    } as unknown as PrismaService;

    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as GoogleCallbackQueryDto,
      reply,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_provider: { userId: "user-1", provider: "google" } },
        create: expect.objectContaining({
          userId: "user-1",
          provider: "google",
          providerUserId: "google-sub-1",
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", email: null },
      data: { email: "alice@example.com" },
    });
    expect(createProfile).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Alice", profilePictureUrl: identity.picture },
    });
    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/connect-google/callback?ok=1",
      302,
    );
  });

  it("still succeeds when the email is already claimed by another user", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockResolvedValue({ purpose: "connect", userId: "user-1" }),
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as GoogleAuthService;
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockRejectedValue({ code: "P2002" });
    const prisma = {
      userAuthIdentity: { upsert },
      user: { updateMany, create: vi.fn() },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "user-1" }), create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as GoogleCallbackQueryDto,
      reply,
    );

    // The identity link is what actually satisfies the mandatory-link
    // gate -- a cosmetic email conflict must not turn success into
    // failure.
    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/connect-google/callback?ok=1",
      302,
    );
  });

  it("redirects with an error if this Google identity is already linked to someone else", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockResolvedValue({ purpose: "connect", userId: "user-1" }),
      exchangeCode: vi.fn().mockResolvedValue(identity),
    } as unknown as GoogleAuthService;
    const prisma = {
      userAuthIdentity: { upsert: vi.fn().mockRejectedValue({ code: "P2002" }) },
      user: { updateMany: vi.fn(), create: vi.fn() },
      userProfile: { findUnique: vi.fn(), create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as GoogleCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/connect-google?googleError=google_failed",
      302,
    );
  });
});

describe("GoogleAuthController.callback -- login purpose", () => {
  it("issues a session for an already-linked identity", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockResolvedValue({ purpose: "login" }),
      exchangeCode: vi.fn().mockResolvedValue(identity),
      issueSession: vi.fn().mockResolvedValue({ accessToken: "fresh-token" }),
    } as unknown as GoogleAuthService;
    const prisma = {
      userAuthIdentity: {
        findUnique: vi.fn().mockResolvedValue({ userId: "user-2", provider: "google" }),
      },
      user: { create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as GoogleCallbackQueryDto,
      reply,
    );

    expect(googleAuth.issueSession).toHaveBeenCalledWith("user-2");
    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/auth/google/callback?token=fresh-token",
      302,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("never provisions a user for an unlinked identity", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockResolvedValue({ purpose: "login" }),
      exchangeCode: vi.fn().mockResolvedValue(identity),
      issueSession: vi.fn(),
    } as unknown as GoogleAuthService;
    const prisma = {
      userAuthIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as GoogleCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?googleError=not_linked",
      302,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(googleAuth.issueSession).not.toHaveBeenCalled();
  });

  it("redirects with an inactive error when the linked user can no longer get a session", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockResolvedValue({ purpose: "login" }),
      exchangeCode: vi.fn().mockResolvedValue(identity),
      issueSession: vi.fn().mockResolvedValue(null),
    } as unknown as GoogleAuthService;
    const prisma = {
      userAuthIdentity: {
        findUnique: vi.fn().mockResolvedValue({ userId: "user-3", provider: "google" }),
      },
      user: { create: vi.fn() },
    } as unknown as PrismaService;

    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();
    await controller.callback(
      { code: "auth-code", state: "signed-state" } as GoogleCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?googleError=inactive",
      302,
    );
  });
});

describe("GoogleAuthController.callback -- shared failure paths", () => {
  it("redirects to login when Google reports an error (consent denied)", async () => {
    const googleAuth = {
      verifyState: vi.fn(),
      exchangeCode: vi.fn(),
    } as unknown as GoogleAuthService;
    const prisma = {} as PrismaService;
    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();

    await controller.callback({ error: "access_denied" } as GoogleCallbackQueryDto, reply);

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?googleError=google_failed",
      302,
    );
    expect(googleAuth.verifyState).not.toHaveBeenCalled();
  });

  it("redirects to login when the signed state fails verification", async () => {
    const googleAuth = {
      verifyState: vi.fn().mockRejectedValue(new Error("expired")),
      exchangeCode: vi.fn(),
    } as unknown as GoogleAuthService;
    const prisma = {} as PrismaService;
    const controller = new GoogleAuthController(googleAuth, prisma);
    const reply = fakeReply();

    await controller.callback(
      { code: "auth-code", state: "tampered" } as GoogleCallbackQueryDto,
      reply,
    );

    expect(reply.redirect).toHaveBeenCalledWith(
      "http://localhost:5173/login?googleError=google_failed",
      302,
    );
    expect(googleAuth.exchangeCode).not.toHaveBeenCalled();
  });
});
