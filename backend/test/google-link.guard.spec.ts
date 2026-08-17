import { SetMetadata, type ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKIP_GOOGLE_LINK_KEY } from "../src/auth/auth.decorators.js";
import { GoogleLinkGuard } from "../src/auth/google-link.guard.js";

function makeContext(
  actor: unknown,
  options: { skip?: boolean } = {},
): ExecutionContext {
  function handler() {}
  class Controller {}
  if (options.skip) SetMetadata(SKIP_GOOGLE_LINK_KEY, true)(handler);
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as ExecutionContext;
}

function stubGoogleConfigured(): void {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/v1/auth/google/callback");
}

describe("GoogleLinkGuard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-ops when Google isn't configured (requireGoogleLink() is false)", () => {
    const guard = new GoogleLinkGuard();
    const context = makeContext({ user: { googleLinked: false } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("no-ops when REQUIRE_GOOGLE_LINK=false overrides a configured Google", () => {
    stubGoogleConfigured();
    vi.stubEnv("REQUIRE_GOOGLE_LINK", "false");
    const guard = new GoogleLinkGuard();
    const context = makeContext({ user: { googleLinked: false } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("no-ops on @SkipGoogleLinkCheck() routes even when required", () => {
    stubGoogleConfigured();
    const guard = new GoogleLinkGuard();
    const context = makeContext({ user: { googleLinked: false } }, { skip: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("no-ops when there's no actor yet (a public route with no skip decorator)", () => {
    stubGoogleConfigured();
    const guard = new GoogleLinkGuard();
    const context = makeContext(undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("403s when required and the actor hasn't linked", () => {
    stubGoogleConfigured();
    const guard = new GoogleLinkGuard();
    const context = makeContext({ user: { googleLinked: false } });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: "GOOGLE_LINK_REQUIRED" }),
    );
  });

  it("passes when the actor has linked", () => {
    stubGoogleConfigured();
    const guard = new GoogleLinkGuard();
    const context = makeContext({ user: { googleLinked: true } });
    expect(guard.canActivate(context)).toBe(true);
  });
});
