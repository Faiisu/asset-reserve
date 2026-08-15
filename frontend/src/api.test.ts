import { api, ApiClientError, setAccessToken } from "./api";

describe("API client", () => {
  it("sends the bearer token to protected endpoints", async () => {
    setAccessToken("token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.roles();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/roles",
      expect.objectContaining({
        headers: expect.objectContaining({}),
      }),
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("maps the backend error envelope to ApiClientError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            fields: { name: "Name is required" },
            requestId: "req-1",
          },
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
    );

    const error = await api
      .createTemplate({ name: "" })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      fields: { name: "Name is required" },
      requestId: "req-1",
    });
  });

  it("does not send an authorization header during public login", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "token", session: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.login("admin@example.com", "long-password");

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.has("Authorization")).toBe(false);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });
});
