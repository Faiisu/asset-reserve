import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { api } from "../api";
import type { AssetSummary, ReservationSummary } from "../types";
import { CalendarPage } from "./CalendarPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasAreaPermission: () => true,
  }),
}));

const asset: AssetSummary = {
  id: "0f358aa7-1e27-4603-8b07-916bb3b75340",
  name: "Stage camera",
  description: null,
  pictureUrl: null,
  totalQuantity: 4,
  allocatedQuantity: 1,
  availableQuantity: 3,
  isActive: true,
  status: "ACTIVE",
  assetTemplate: null,
  managementArea: { id: "area-1", name: "Production" },
  owner: null,
  capabilities: {
    canEdit: false,
    canDeactivate: false,
    canAdjustQuantity: false,
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const reservation: ReservationSummary = {
  id: "00000000-0000-4000-8000-000000000101",
  eventName: "Regional production week",
  description: null,
  startAt: "2026-08-07T02:00:00.000Z",
  endAt: "2026-08-12T10:00:00.000Z",
  status: "APPROVED",
  requester: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Event owner",
    profilePictureUrl: null,
  },
  managementAreas: [{ id: "area-1", name: "Production" }],
  itemCount: 2,
  totalQuantity: 3,
  pendingItemCount: 0,
  approvedItemCount: 2,
  rejectedItemCount: 0,
  hasPendingChangeRequest: false,
  pendingDecisionCount: 0,
  capabilities: {
    canSubmit: false,
    canRequestChange: true,
    canReview: true,
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-15T05:00:00.000Z"));
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [asset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the visible month from the current reservation endpoint and splits a multi-week event", async () => {
    const listSpy = vi.spyOn(api, "reservations").mockResolvedValue({
      data: [reservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const eventLinks = await screen.findAllByRole("link", {
      name: /Regional production week, Approved/i,
    });
    expect(eventLinks).toHaveLength(2);
    expect(eventLinks[0]).toHaveAttribute(
      "href",
      `/reservations/${reservation.id}`,
    );
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        view: "ALL",
        limit: 100,
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
  });

  it("passes the selected schedule and assets to the reservation form", async () => {
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading visible reservations")).toBeNull(),
    );
    const day = screen.getByRole("button", {
      name: /Tuesday, August 18, 2026, select reservation date/i,
    });
    fireEvent.pointerDown(day, { button: 0 });
    fireEvent.pointerUp(day);

    expect(screen.getByTestId("location")).toHaveTextContent("/");
    const assetOption = await screen.findByRole("button", {
      name: /Stage camera/i,
    });
    fireEvent.click(assetOption);
    fireEvent.click(screen.getByRole("link", { name: /Reserve 1 asset/i }));

    const target = new URL(
      screen.getByTestId("location").textContent ?? "",
      "https://asset-rail.test",
    );
    const start = new Date(target.searchParams.get("startAt") ?? "");
    const end = new Date(target.searchParams.get("endAt") ?? "");
    expect(target.pathname).toBe("/reservations/new");
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(17);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
    expect(target.searchParams.getAll("assetId")).toEqual([asset.id]);
  });
});

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
