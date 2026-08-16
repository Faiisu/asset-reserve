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

const mockPendingReservation: ReservationDetail = {
  ...mockReservation,
  status: "PENDING_APPROVAL",
  items: [
    {
      id: "item-pending-1",
      quantity: 3,
      status: "PENDING",
      asset: {
        id: "asset-pending-1",
        name: "Wireless Microphone Kit",
        description: "Dual channel receiver",
        pictureUrl: null,
        isActive: true,
        managementArea: {
          id: "area-1",
          name: "Marketing",
        },
        template: null,
      },
      approval: null,
      availability: {
        assetId: "asset-pending-1",
        totalQuantity: 10,
        approvedQuantity: 0,
        pendingQuantity: 3,
        availableQuantity: 7,
        pendingReservationCount: 1,
      },
      warnings: [],
      capabilities: {
        canApprove: true,
        canReject: true,
      },
      returnSummary: {
        returnedQuantity: 0,
        brokenQuantity: 0,
        lostQuantity: 0,
        pendingReturnQuantity: 0,
        remainingReturnQuantity: 3,
      },
    },
  ],
};

describe("ReservationDetailPage", () => {
  it("renders event details, horizontal tracker, and opens step audit logs on click", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockReservation);

    const { container } = render(
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
    expect(screen.getByText("All equipment cleared for handover")).toBeInTheDocument();
    expect(screen.getByText("Handover confirmation (0 of 1 selected)")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Stage Camera 4K for handover")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm Handover" })).toBeDisabled();
    expect(screen.getAllByText("Reservation Status Track")[0]).toBeInTheDocument();

    // 2. Click on the "Approved" step in the horizontal tracker (.res-step-btn)
    const approvedStepButton = screen.getByLabelText("Inspect step Approved");
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

  it("allows Area Manager to select items, adjust approved quantity, and submit batch approval", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockPendingReservation);
    const decideSpy = vi.spyOn(api, "decideReservationItems").mockResolvedValue({
      ...mockPendingReservation,
      status: "APPROVED",
      items: [
        {
          ...mockPendingReservation.items[0],
          status: "APPROVED",
          capabilities: { canApprove: false, canReject: false },
        },
      ],
    });

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

    // 1. Wait for reservation to load and Area Manager Review toolbar to appear
    await waitFor(() => {
      expect(screen.getByText(/Area Manager Review/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByLabelText("3 total reserved")).toBeInTheDocument();

    // 2. Verify checkbox and quantity input box
    const checkbox = screen.getByLabelText("Select Wireless Microphone Kit");
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const qtyInput = screen.getByLabelText("Approve quantity for Wireless Microphone Kit");
    expect(qtyInput).toBeInTheDocument();

    // Change approved quantity
    fireEvent.change(qtyInput, { target: { value: "2" } });
    expect(qtyInput).toHaveValue(2);

    // 3. Type decision remark and click Approve Selected
    const remarkInput = screen.getByPlaceholderText(/Decision comment \/ remark/i);
    fireEvent.change(remarkInput, { target: { value: "Approved 2 units for town hall" } });

    const approveButton = screen.getByRole("button", { name: /Approve Selected/i });
    fireEvent.click(approveButton);

    // 4. Verify API was called with selected items and remark
    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        ["item-pending-1"],
        "APPROVE",
        "Approved 2 units for town hall"
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText("Wireless Microphone Kit").closest(".res-manifest-item"),
      ).toHaveAttribute("data-status", "approved");
    });
  });

  it("confirms handover only for explicitly selected authorized items", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockReservation);
    const confirmSpy = vi.spyOn(api, "confirmDelivery").mockResolvedValue({
      ...mockReservation,
      status: "DELIVERY_CONFIRMED",
      items: mockReservation.items.map((item) => ({
        ...item,
        status: "DELIVERED",
        capabilities: { ...item.capabilities, canConfirmDelivery: false },
      })),
      capabilities: { ...mockReservation.capabilities, canConfirmDelivery: false },
    });

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

    const checkbox = await screen.findByLabelText(
      "Select Stage Camera 4K for handover",
    );
    const confirmButton = screen.getByRole("button", {
      name: "Confirm Handover",
    });
    expect(checkbox).not.toBeChecked();
    expect(confirmButton).toBeDisabled();

    fireEvent.click(checkbox);
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        ["item-1"],
      );
    });
  });
});
