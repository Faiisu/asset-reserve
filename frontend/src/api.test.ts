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
      .assets({})
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

  it("sends reservation creation and approval decisions to their domain endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "reservation-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await api.createReservation({
      eventName: "Town hall",
      startAt: "2026-08-16T02:00:00.000Z",
      endAt: "2026-08-16T04:00:00.000Z",
      status: "PENDING_APPROVAL",
      items: [{ assetId: "asset-1", quantity: 2 }],
    });
    await api.decideReservationItems(
      "reservation-1",
      ["item-1", "item-2"],
      "APPROVE",
      "Ready",
    );

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/reservations");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: expect.stringContaining('"status":"PENDING_APPROVAL"'),
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/v1/reservations/reservation-1/items/decision",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        itemIds: ["item-1", "item-2"],
        decision: "APPROVE",
        comment: "Ready",
      }),
    });
  });

  it("encodes reservation list filters for the approval queue", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          pageInfo: { nextCursor: null, hasNextPage: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await api.reservations({
      view: "APPROVALS",
      status: "PENDING_APPROVAL",
      search: "town hall",
      limit: 20,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/reservations?view=APPROVALS&status=PENDING_APPROVAL&search=town+hall&limit=20",
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("encodes the selected availability window for asset listing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          pageInfo: { nextCursor: null, hasNextPage: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await api.assets({
      isActive: true,
      from: "2026-08-18T02:00:00.000Z",
      to: "2026-08-18T10:00:00.000Z",
      limit: 100,
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/assets?isActive=true&from=2026-08-18T02%3A00%3A00.000Z&to=2026-08-18T10%3A00%3A00.000Z&limit=100",
    );
  });
});
