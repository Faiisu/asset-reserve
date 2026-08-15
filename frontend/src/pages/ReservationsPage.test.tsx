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
  it("loads my reservations and switches to the approval queue", async () => {
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

    fireEvent.click(screen.getByRole("tab", { name: /approval queue/i }));
    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ view: "APPROVALS", limit: 20 }),
      ),
    );
    expect(screen.getByLabelText("2 decisions waiting")).toBeInTheDocument();
  });
});
