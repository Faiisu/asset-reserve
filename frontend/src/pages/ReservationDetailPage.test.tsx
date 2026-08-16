import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import type { ReservationDetail } from "../types";
import { ReservationDetailPage } from "./ReservationDetailPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    session: { user: { id: "00000000-0000-4000-8000-000000000001" } },
    hasPermission: () => true,
    hasAreaPermission: () => true,
  }),
}));

const mockReservation: ReservationDetail = {
  id: "00000000-0000-4000-8000-000000000101",
  eventName: "Quarterly Town Hall Stream",
  description: "Stage video shoot with multiple cameras",
  startAt: "2026-09-01T09:00:00.000Z",
  endAt: "2026-09-01T11:00:00.000Z",
  status: "APPROVED",
  requester: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Event Owner",
    profilePictureUrl: null,
  },
  participants: [],
  items: [
    {
      id: "item-1",
      quantity: 2,
      status: "APPROVED",
      asset: {
        id: "asset-1",
        name: "Stage Camera 4K",
        description: "Studio camera",
        pictureUrl: null,
        isActive: true,
        managementArea: {
          id: "area-1",
          name: "Marketing",
        },
        template: null,
      },
      approval: {
        id: "app-1",
        status: "APPROVED",
        comment: "Approved for town hall",
        decidedAt: "2026-08-16T10:00:00.000Z",
        approver: {
          id: "mgr-1",
          name: "Marketing Manager",
          email: "mk@example.com",
          profilePictureUrl: null,
        },
      },
      availability: {
        assetId: "asset-1",
        totalQuantity: 5,
        approvedQuantity: 2,
        pendingQuantity: 0,
        availableQuantity: 3,
        pendingReservationCount: 0,
      },
      warnings: [],
      capabilities: {
        canApprove: false,
        canReject: false,
        canConfirmDelivery: true,
        canReturn: false,
      },
      returnSummary: {
        returnedQuantity: 0,
        brokenQuantity: 0,
        lostQuantity: 0,
        pendingReturnQuantity: 0,
        remainingReturnQuantity: 2,
      },
    },
  ],
  changeRequests: [],
  returns: [],
  capabilities: {
    canSubmit: false,
    canRequestChange: true,
    canConfirmDelivery: true,
    canReturn: false,
    canCancel: true,
  },
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
};

describe("ReservationDetailPage", () => {
  it("renders event details, horizontal tracker, and opens step audit logs on click", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockReservation);

    render(
      <MemoryRouter initialEntries={["/reservations/00000000-0000-4000-8000-000000000101"]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // 1. Verify Event title and manifest load
    await waitFor(() => {
      expect(screen.getByText("Quarterly Town Hall Stream")).toBeInTheDocument();
    });

    expect(screen.getByText("Stage Camera 4K")).toBeInTheDocument();
    expect(screen.getAllByText("Reservation Status Track")[0]).toBeInTheDocument();

    // 2. Click on the "Approved" step in the horizontal tracker
    const approvedStepButton = screen.getByRole("button", { name: /Approved/i });
    fireEvent.click(approvedStepButton);

    // 3. Verify that the Step Log Modal opened
    await waitFor(() => {
      expect(screen.getByText("Step Metadata & Timeline")).toBeInTheDocument();
      expect(screen.getByText("Line Items & Decisions")).toBeInTheDocument();
    });

    // Close the log inspector
    const closeButton = screen.getByRole("button", { name: /Close Log Inspector/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Step Metadata & Timeline")).not.toBeInTheDocument();
    });
  });
});
