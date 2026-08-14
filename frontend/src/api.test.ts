import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";
import type { RequestDiagnostic } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("authentication API client", () => {
  it("sends the login contract without logging credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: "token",
          tokenType: "Bearer",
          expiresIn: 900,
          session: {
            user: {
              id: "user-1",
              email: "admin@example.com",
              isActive: true,
              profile: null,
            },
            roles: [],
            effectivePermissions: { global: [], byManagementArea: [] },
          },
        }),
        { status: 200, headers: { "X-Request-Id": "request-1" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const diagnostics: RequestDiagnostic[] = [];
    const client = createApiClient("http://localhost:3000/api/v1/", (item) =>
      diagnostics.push(item),
    );

    const response = await client.login("admin@example.com", "secret-password");

    expect(response.accessToken).toBe("token");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "admin@example.com",
          password: "secret-password",
        }),
      }),
    );
    expect(JSON.stringify(diagnostics)).not.toContain("secret-password");
    expect(diagnostics[0]).toMatchObject({
      status: 200,
      requestId: "request-1",
      outcome: "success",
    });
  });

  it("adds the bearer token to protected requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ session: {} }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("/api/v1", () => undefined);

    await client.session("access-token");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer access-token",
    );
  });

  it("maps the structured backend error without losing request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Email or password is incorrect.",
              requestId: "request-2",
            },
          }),
          { status: 401 },
        ),
      ),
    );
    const client = createApiClient("/api/v1", () => undefined);

    await expect(
      client.login("user@example.com", "wrong"),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      requestId: "request-2",
    });
  });
});
