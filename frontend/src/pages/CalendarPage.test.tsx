import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  partNumber: null,
  totalQuantity: 4,
  unitCounts: {
    total: 0,
    active: 0,
    reserved: 0,
    checkedOut: 0,
    broken: 0,
    lost: 0,
    inRepair: 0,
    inactive: 0,
  },

  allocatedQuantity: 1,
  availableQuantity: 3,
  isActive: true,
  managementArea: { id: "area-1", name: "Production" },
  owner: null,
  capabilities: {
    canEdit: false,
    canDeactivate: false,
    canManageUnits: false,
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
  pendingDecisionCount: 0,
  capabilities: {
    canSubmit: false,
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
      },
      units: [],
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
  returns: [],
  capabilities: { canSubmit: false },
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
      expect.any(AbortSignal),
    );
  });

  it("rejects pending assets from the calendar event action menu, with no Approve button", async () => {
    // Approving now requires picking serial-numbered units per item (§7.5),
    // which this lightweight quick-action menu has no room for -- only
    // Reject remains a one-click action here; Approve happens on the
    // Reservation Detail page instead.
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [pendingReservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "reservation").mockResolvedValue(pendingReservationDetail);
    const decideSpy = vi
      .spyOn(api, "decideReservationItems")
      .mockResolvedValue({
        ...pendingReservationDetail,
        status: "REJECTED",
        items: [
          {
            ...pendingReservationDetail.items[0],
            status: "REJECTED",
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
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));

    await waitFor(() =>
      expect(decideSpy).toHaveBeenCalledWith(
        pendingReservation.id,
        [{ reservationItemId: "item-1" }],
        "REJECT",
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
      screen.getByRole("button", { name: "Show assets as a list" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("No image for Stage camera")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show assets as a grid" }),
    );
    expect(
      screen.getByRole("button", { name: "Show assets as a grid" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByLabelText("No image for Stage camera"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show assets as a list" }),
    );
    expect(screen.queryByLabelText("No image for Stage camera")).toBeNull();

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
    expect(screen.queryByLabelText("No image for Stage camera")).toBeNull();
    const quantityInput = await screen.findByLabelText(
      "Quantity for Stage camera",
    );
    expect(quantityInput).toHaveValue("0");
    fireEvent.click(assetOption);
    expect(quantityInput).toHaveValue("1");
    fireEvent.change(quantityInput, { target: { value: "" } });
    expect(quantityInput).toHaveValue("");
    fireEvent.change(quantityInput, { target: { value: "not-a-number" } });
    expect(quantityInput).toHaveValue("");
    fireEvent.change(quantityInput, { target: { value: "4" } });
    expect(quantityInput).toHaveValue("4");
    expect(quantityInput).toHaveAttribute("aria-invalid", "true");
    expect(
      (await screen.findByText("Max available: 3")).closest("label"),
    ).toHaveClass("calendar-asset-option__quantity--over-limit");
    expect(
      screen.getByRole("link", { name: /Reserve 4 units/i }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(quantityInput, { target: { value: "3" } });
    expect(
      screen.getByRole("link", { name: /Reserve 3 units/i }),
    ).not.toHaveAttribute("aria-disabled", "true");

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
    expect(quantityInput).toHaveValue("3");
    fireEvent.click(screen.getByRole("link", { name: /Reserve 3 units/i }));

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
    expect(target.searchParams.getAll("quantity")).toEqual(["3"]);
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
    vi.mocked(api.assets).mockImplementation(async (params) => {
      if (params?.from && params.from.includes("2026-08-18")) {
        return {
          data: [fullyBooked, availableAsset],
          pageInfo: { nextCursor: null, hasNextPage: false },
        };
      }
      return {
        data: [asset, availableAsset],
        pageInfo: { nextCursor: null, hasNextPage: false },
      };
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
    const quantityInput = screen.getByLabelText("Quantity for Stage camera");
    expect(quantityInput).toBeEnabled();

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
    expect(quantityInput).toBeDisabled();
    expect(screen.getByRole("link", { name: /Create event/i })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("cancels a reservation from the calendar mini popover after confirmation", async () => {
    const cancellableReservation = {
      ...reservation,
      capabilities: {
        canSubmit: false,
        canReview: true,
        canCancel: true,
      },
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

    const confirmDialog = screen.getByRole("dialog", {
      name: "Cancel reservation",
    });
    expect(confirmDialog).toBeInTheDocument();
    fireEvent.change(within(confirmDialog).getByRole("textbox"), {
      target: { value: "Cancelled from calendar" },
    });
    fireEvent.click(
      within(confirmDialog).getByRole("button", {
        name: "Confirm cancellation",
      }),
    );

    await waitFor(() =>
      expect(cancelSpy).toHaveBeenCalledWith(
        cancellableReservation.id,
        "Cancelled from calendar",
      ),
    );
  });

  it("navigates across continuous months using mini calendar date picker and Today button", async () => {
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    // Initial visible month is August 2026
    expect(
      screen.getByRole("heading", { level: 2, name: "August 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aug")).toBeInTheDocument();

    // Open Mini Calendar Date Picker
    fireEvent.click(
      screen.getByRole("button", { name: "Select date from mini calendar" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Choose date" }),
    ).toBeInTheDocument();

    // Navigate to next month in mini calendar
    fireEvent.click(
      screen.getByRole("button", { name: "Next month in picker" }),
    );
    expect(screen.getByText("September 2026")).toBeInTheDocument();

    // Pick September 15, 2026
    const sep15Btn = screen.getByRole("button", {
      name: "Tuesday, September 15, 2026",
    });
    fireEvent.click(sep15Btn);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "September 2026" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog", { name: "Choose date" })).toBeNull();

    // Click Today button to return to current month
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "August 2026" }),
      ).toBeInTheDocument(),
    );

    // Selecting a box in September updates header month label
    const sepBox = screen.getByRole("button", {
      name: /Tuesday, September 1, 2026/i,
    });
    fireEvent.pointerDown(sepBox, { button: 0 });
    fireEvent.pointerUp(sepBox);
    expect(
      screen.getByRole("heading", { level: 2, name: "September 2026" }),
    ).toBeInTheDocument();
  });

  it("filters calendar and assets using merged workspace and status filter dropdown", async () => {
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [
        {
          id: "area-1",
          name: "Production",
          description: null,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "area-2",
          name: "Audio Lab",
          description: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [reservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", {
      name: /Filter reservations by workspace and status/i,
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Filters");

    // Open unified filter popover
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Filter reservations" }),
    ).toBeInTheDocument();

    // Wait for Production workspace checkbox and toggle it
    const prodCheckbox = await screen.findByRole("checkbox", {
      name: "Production",
    });
    expect(prodCheckbox).not.toBeChecked();
    fireEvent.click(prodCheckbox);
    expect(prodCheckbox).toBeChecked();
    expect(trigger).toHaveTextContent("1");

    // Toggle Approved status checkbox in the same popover
    const approvedCheckbox = screen.getByRole("checkbox", { name: "Approved" });
    expect(approvedCheckbox).not.toBeChecked();
    fireEvent.click(approvedCheckbox);
    expect(approvedCheckbox).toBeChecked();
    expect(trigger).toHaveTextContent("2");

    // Test Clear all button
    const clearAllBtn = screen.getByRole("button", { name: "Clear all" });
    expect(clearAllBtn).toBeInTheDocument();
    fireEvent.click(clearAllBtn);
    expect(prodCheckbox).not.toBeChecked();
    expect(approvedCheckbox).not.toBeChecked();
  });

  it("allows selecting past dates to view information while disabling the reserve button", async () => {
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

    const pastDay = screen.getByRole("button", {
      name: /Saturday, August 1, 2026/i,
    });
    fireEvent.pointerDown(pastDay, { button: 0 });
    fireEvent.pointerUp(pastDay);

    expect(
      screen.getByText("Past dates cannot be reserved."),
    ).toBeInTheDocument();
    const reserveButton = screen.getByRole("link", { name: /Create event/i });
    expect(reserveButton).toHaveAttribute("aria-disabled", "true");
    expect(reserveButton).toHaveClass("button--disabled");
  });

  it("toggles between all reservations and only mine using the Only mine button", async () => {
    const listSpy = vi.spyOn(api, "reservations").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const toggleBtn = await screen.findByRole("button", {
      name: /Filter to only my reservations/i,
    });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent("Only mine");
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    expect(toggleBtn).not.toHaveClass("calendar-only-mine-toggle--active");

    // Click to toggle "Only mine" ON
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "true");
    expect(toggleBtn).toHaveClass("calendar-only-mine-toggle--active");
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        view: "MINE",
      }),
      expect.any(AbortSignal),
    );

    // Click to toggle "Only mine" OFF
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
    expect(toggleBtn).not.toHaveClass("calendar-only-mine-toggle--active");
    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        view: "ALL",
      }),
      expect.any(AbortSignal),
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
