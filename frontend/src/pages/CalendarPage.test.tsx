import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { api } from "../api";
import type {
  AssetSummary,
  ReservationDetail,
  ReservationSummary,
} from "../types";
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

const pendingReservation: ReservationSummary = {
  ...reservation,
  status: "PENDING_APPROVAL",
  pendingItemCount: 1,
  approvedItemCount: 0,
  pendingDecisionCount: 1,
};

const pendingReservationDetail: ReservationDetail = {
  id: pendingReservation.id,
  eventName: pendingReservation.eventName,
  description: null,
  startAt: pendingReservation.startAt,
  endAt: pendingReservation.endAt,
  status: "PENDING_APPROVAL",
  requester: pendingReservation.requester,
  participants: [],
  items: [
    {
      id: "item-1",
      quantity: 1,
      status: "PENDING",
      asset: {
        id: asset.id,
        name: asset.name,
        description: null,
        pictureUrl: null,
        isActive: true,
        managementArea: asset.managementArea,
        template: null,
      },
      approval: null,
      availability: {
        assetId: asset.id,
        totalQuantity: 4,
        approvedQuantity: 0,
        pendingQuantity: 1,
        availableQuantity: 4,
        pendingReservationCount: 1,
      },
      warnings: [],
      capabilities: { canApprove: true, canReject: true },
    },
  ],
  changeRequests: [],
  returns: [],
  capabilities: { canSubmit: false, canRequestChange: true },
  createdAt: pendingReservation.createdAt,
  updatedAt: pendingReservation.updatedAt,
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

    const eventButtons = await screen.findAllByRole("button", {
      name: /Regional production week, Approved/i,
    });
    expect(eventButtons).toHaveLength(2);
    fireEvent.click(eventButtons[0]);
    expect(
      screen.getByRole("dialog", {
        name: /Actions for Regional production week/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
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

  it("approves pending assets from the calendar event action menu", async () => {
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [pendingReservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "reservation").mockResolvedValue(pendingReservationDetail);
    const decideSpy = vi
      .spyOn(api, "decideReservationItems")
      .mockResolvedValue({
        ...pendingReservationDetail,
        status: "APPROVED",
        items: [
          {
            ...pendingReservationDetail.items[0],
            status: "APPROVED",
            capabilities: { canApprove: false, canReject: false },
          },
        ],
      });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const eventButtons = await screen.findAllByRole("button", {
      name: /Regional production week, Pending approval/i,
    });
    fireEvent.click(eventButtons[0]);
    expect(screen.getByRole("button", { name: /Reject/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));

    await waitFor(() =>
      expect(decideSpy).toHaveBeenCalledWith(
        pendingReservation.id,
        ["item-1"],
        "APPROVE",
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: /Actions for Regional production week/i,
        }),
      ).toBeNull(),
    );
  });

  it("opens the full asset browser with search, view controls, and both close interactions", async () => {
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: /Stage camera/i });
    fireEvent.click(screen.getByRole("button", { name: /Show all/i }));
    let dialog = screen.getByRole("dialog", {
      name: "All reservation assets",
    });
    expect(
      screen.getByRole("button", { name: "Show assets as a grid" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Show assets as a list" }),
    );
    expect(
      screen.getByRole("button", { name: "Show assets as a list" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search all reservation assets" }),
      { target: { value: "camera" } },
    );
    await waitFor(() =>
      expect(api.assets).toHaveBeenCalledWith(
        expect.objectContaining({ search: "camera" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(
      screen.queryByRole("dialog", { name: "All reservation assets" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show all/i }));
    dialog = screen.getByRole("dialog", { name: "All reservation assets" });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(
      screen.queryByRole("dialog", { name: "All reservation assets" }),
    ).toBeNull();
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
    const assetOption = await screen.findByRole("button", {
      name: /Stage camera/i,
    });
    expect(assetOption).toBeEnabled();
    expect(
      screen.getByText(/4 total/),
    ).toBeInTheDocument();
    fireEvent.click(assetOption);
    expect(
      screen.getByRole("link", { name: /Reserve 1 asset/i }),
    ).toHaveAttribute("aria-disabled", "true");

    const day = screen.getByRole("button", {
      name: /Tuesday, August 18, 2026, select reservation date/i,
    });
    fireEvent.pointerDown(day, { button: 0 });
    fireEvent.pointerUp(day);

    expect(screen.getByTestId("location")).toHaveTextContent("/");
    await waitFor(() =>
      expect(api.assets).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String),
        }),
      ),
    );
    expect(assetOption).toHaveAttribute("aria-pressed", "true");
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

  it("disables an asset when approved reservations use every unit in the selected time", async () => {
    const fullyBooked = {
      ...asset,
      allocatedQuantity: asset.totalQuantity,
      availableQuantity: 0,
    };
    const availableAsset = {
      ...asset,
      id: "0f358aa7-1e27-4603-8b07-916bb3b75341",
      name: "Backup microphone",
    };
    vi.mocked(api.assets).mockResolvedValue({
      data: [fullyBooked, availableAsset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.queryByText("Loading visible reservations")).toBeNull(),
    );
    const assetOption = await screen.findByRole("button", {
      name: /Stage camera/i,
    });
    expect(assetOption).toBeEnabled();
    expect(
      screen.getAllByText(/4 total/),
    ).toHaveLength(2);

    const day = screen.getByRole("button", {
      name: /Tuesday, August 18, 2026, select reservation date/i,
    });
    fireEvent.pointerDown(day, { button: 0 });
    fireEvent.pointerUp(day);

    await waitFor(() => expect(assetOption).toBeDisabled());
    const orderedOptions = screen.getAllByRole("button", {
      name: /Backup microphone|Stage camera/i,
    });
    expect(orderedOptions[0]).toHaveAccessibleName(/Backup microphone/i);
    expect(assetOption.querySelector("i svg")).toBeNull();
    expect(
      screen.getByText("Fully booked"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Select assets to reserve/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("cancels a reservation from the calendar mini popover after confirmation", async () => {
    const cancellableReservation = {
      ...reservation,
      capabilities: { canSubmit: false, canRequestChange: true, canReview: true, canCancel: true },
    };
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [cancellableReservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    const cancelSpy = vi.spyOn(api, "cancelReservation").mockResolvedValue({
      ...pendingReservationDetail,
      status: "CANCELLED",
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const eventButtons = await screen.findAllByRole("button", {
      name: /Regional production week, Approved/i,
    });
    fireEvent.click(eventButtons[0]);

    const miniMenu = screen.getByRole("dialog", {
      name: /Actions for Regional production week/i,
    });
    fireEvent.click(within(miniMenu).getByRole("button", { name: /Cancel/i }));

    const confirmDialog = screen.getByRole("dialog", { name: "Cancel reservation" });
    expect(confirmDialog).toBeInTheDocument();
    fireEvent.change(within(confirmDialog).getByRole("textbox"), {
      target: { value: "Cancelled from calendar" },
    });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() =>
      expect(cancelSpy).toHaveBeenCalledWith(
        cancellableReservation.id,
        "Cancelled from calendar",
      ),
    );
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
