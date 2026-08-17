import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import type { ReservationSummary } from "../types";
import { ReservationsPage } from "./ReservationsPage";

vi.mock("../auth", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

const reservation: ReservationSummary = {
  id: "00000000-0000-4000-8000-000000000101",
  eventName: "Quarterly town hall",
  description: null,
  startAt: "2026-09-01T09:00:00.000Z",
  endAt: "2026-09-01T11:00:00.000Z",
  status: "PENDING_APPROVAL",
  requester: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Event owner",
    profilePictureUrl: null,
  },
  managementAreas: [{ id: "area-1", name: "Production" }],
  itemCount: 2,
  totalQuantity: 3,
  pendingItemCount: 2,
  approvedItemCount: 0,
  rejectedItemCount: 0,
  hasPendingChangeRequest: false,
  pendingDecisionCount: 2,
  capabilities: {
    canSubmit: false,
    canRequestChange: true,
    canReview: true,
  },
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("ReservationsPage", () => {
  it("loads my reservations and switches to the participate tab", async () => {
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    const listSpy = vi.spyOn(api, "reservations").mockResolvedValue({
      data: [reservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <ReservationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Quarterly town hall")).toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ view: "MINE", limit: 20 }),
    );

    fireEvent.click(screen.getByRole("tab", { name: /participate/i }));
    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ view: "PARTICIPATING", limit: 20 }),
      ),
    );
  });

  it("filters reservations using merged workspace and status filter dropdown", async () => {
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [
        { id: "area-1", name: "Production", description: null, createdAt: "", updatedAt: "" },
        { id: "area-2", name: "Audio Lab", description: null, createdAt: "", updatedAt: "" },
      ],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "reservations").mockResolvedValue({
      data: [reservation],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <ReservationsPage />
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

    // Toggle Production workspace checkbox
    const prodCheckbox = await screen.findByRole("checkbox", { name: "Production" });
    expect(prodCheckbox).not.toBeChecked();
    fireEvent.click(prodCheckbox);
    expect(prodCheckbox).toBeChecked();
    expect(trigger).toHaveTextContent("1");

    // Toggle Approved status checkbox
    const approvedCheckbox = screen.getByRole("checkbox", { name: "Approved" });
    expect(approvedCheckbox).not.toBeChecked();
    fireEvent.click(approvedCheckbox);
    expect(approvedCheckbox).toBeChecked();
    expect(trigger).toHaveTextContent("2");

    // Clear all
    const clearAllBtn = screen.getByRole("button", { name: "Clear all" });
    expect(clearAllBtn).toBeInTheDocument();
    fireEvent.click(clearAllBtn);
    expect(prodCheckbox).not.toBeChecked();
    expect(approvedCheckbox).not.toBeChecked();
  });
});
