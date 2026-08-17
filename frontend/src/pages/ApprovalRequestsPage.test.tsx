import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import type { ReservationSummary } from "../types";
import { ApprovalRequestsPage } from "./ApprovalRequestsPage";

vi.mock("../auth", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

const reservation: ReservationSummary = {
  id: "00000000-0000-4000-8000-000000000101",
  eventName: "Hardware Diagnostics Review",
  description: null,
  startAt: "2026-09-01T09:00:00.000Z",
  endAt: "2026-09-01T11:00:00.000Z",
  status: "PENDING_APPROVAL",
  requester: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "requester@example.com",
    name: "Requester One",
    profilePictureUrl: null,
  },
  managementAreas: [{ id: "area-1", name: "Application Engineer" }],
  itemCount: 1,
  totalQuantity: 2,
  pendingItemCount: 1,
  approvedItemCount: 0,
  rejectedItemCount: 0,
  hasPendingChangeRequest: false,
  pendingDecisionCount: 1,
  capabilities: {
    canSubmit: false,
    canRequestChange: false,
    canReview: true,
  },
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("ApprovalRequestsPage", () => {
  it("loads the approval queue requests with decisions waiting", async () => {
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
        <ApprovalRequestsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Hardware Diagnostics Review"),
    ).toBeInTheDocument();
    expect(listSpy).toHaveBeenCalledWith(
      expect.objectContaining({ view: "APPROVALS", limit: 20 }),
    );
    expect(screen.getByLabelText("1 decision waiting")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only reservations needing a decision from your management areas appear here.",
      ),
    ).toBeInTheDocument();

    const historyTab = screen.getByRole("tab", { name: /approval history/i });
    fireEvent.click(historyTab);
    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({ view: "APPROVAL_HISTORY", limit: 20 }),
      ),
    );
    expect(
      screen.getByText(
        "Past decisions, approvals, and return records from your management areas.",
      ),
    ).toBeInTheDocument();
  });
});
