import { SetMetadata, type ExecutionContext } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKIP_ACCOUNT_LINK_KEY } from "../src/auth/auth.decorators.js";
import { AccountLinkGuard } from "../src/auth/account-link.guard.js";

function makeContext(
  actor: unknown,
  options: { skip?: boolean } = {},
): ExecutionContext {
  function handler() {}
  class Controller {}
  if (options.skip) SetMetadata(SKIP_ACCOUNT_LINK_KEY, true)(handler);
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

function stubMicrosoftConfigured(): void {
  vi.stubEnv("MICROSOFT_CLIENT_ID", "test-client-id");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("MICROSOFT_REDIRECT_URI", "http://localhost:3000/api/v1/auth/microsoft/callback");
}

describe("AccountLinkGuard", () => {
  // The real backend/.env may itself have GOOGLE_*/MICROSOFT_* set (e.g.
  // during manual OAuth testing) -- vi.stubEnv layers on top of the
  // actual process.env rather than clearing it, so "unconfigured" tests
  // must explicitly blank these out instead of relying on them being
  // unset.
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_REDIRECT_URI", "");
    vi.stubEnv("REQUIRE_ACCOUNT_LINK", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-ops when neither provider is configured (requireAccountLink() is false)", () => {
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: [] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("no-ops when REQUIRE_ACCOUNT_LINK=false overrides a configured provider", () => {
    stubGoogleConfigured();
    vi.stubEnv("REQUIRE_ACCOUNT_LINK", "false");
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: [] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("no-ops on @SkipAccountLinkCheck() routes even when required", () => {
    stubGoogleConfigured();
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: [] } }, { skip: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("no-ops when there's no actor yet (a public route with no skip decorator)", () => {
    stubGoogleConfigured();
    const guard = new AccountLinkGuard();
    const context = makeContext(undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it("403s when required and the actor hasn't linked anything", () => {
    stubGoogleConfigured();
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: [] } });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: "ACCOUNT_LINK_REQUIRED" }),
    );
  });

  it("passes when the actor has linked Google", () => {
    stubGoogleConfigured();
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: ["google"] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("passes when only Microsoft is configured and the actor has linked Microsoft", () => {
    stubMicrosoftConfigured();
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: ["microsoft"] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("passes when the actor linked Microsoft even though the gate is only required because Google is configured", () => {
    // Either provider satisfies the gate -- it's not "must link the
    // specific provider this deployment happens to have configured."
    stubGoogleConfigured();
    const guard = new AccountLinkGuard();
    const context = makeContext({ user: { linkedProviders: ["microsoft"] } });
    expect(guard.canActivate(context)).toBe(true);
  });
});
