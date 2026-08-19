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

  it("submits equipment return directly from Reserved Equipment Manifest during pending return state", async () => {
    const deliveredReservation: ReservationDetail = {
      ...mockReservation,
      status: "DELIVERY_CONFIRMED",
      items: [
        {
          ...mockReservation.items[0],
          status: "DELIVERED",
          capabilities: {
            canApprove: false,
            canReject: false,
            canConfirmDelivery: false,
            canReturn: true,
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
      capabilities: {
        ...mockReservation.capabilities,
        canConfirmDelivery: false,
        canReturn: true,
      },
    };

    vi.spyOn(api, "reservation").mockResolvedValue(deliveredReservation);
    const returnSpy = vi.spyOn(api, "createReturn").mockResolvedValue({
      id: "ret-1",
      reservationId: deliveredReservation.id,
      status: "PENDING",
      returnedAt: null,
      returnedBy: deliveredReservation.requester,
      items: [],
      approval: {
        id: "ret-app-1",
        status: "PENDING",
        description: null,
        decidedAt: null,
        approver: deliveredReservation.requester,
      },
      capabilities: { canApprove: true, canReject: true },
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
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

    // 1. Wait for manifest return controls to appear
    await waitFor(() => {
      expect(
        screen.getByText(/Equipment Return \(/i, { selector: "span" }),
      ).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText("Select Stage Camera 4K for return");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const returnQtyInput = screen.getByLabelText("Return quantity for Stage Camera 4K");
    expect(returnQtyInput).toBeInTheDocument();
    fireEvent.change(returnQtyInput, { target: { value: "2" } });

    const submitReturnBtn = screen.getByRole("button", { name: /Submit Return/i });
    fireEvent.click(submitReturnBtn);

    await waitFor(() => {
      expect(returnSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        {
          items: [
            {
              reservationItemId: "item-1",
              quantityReturned: 2,
              quantityBroken: 0,
              quantityLost: 0,
            },
          ],
        }
      );
    });
  });

  it("allows Area Manager to inspect and approve return slips directly on Reserved Equipment Manifest", async () => {
    const pendingReturnReservation: ReservationDetail = {
      ...mockReservation,
      status: "RETURN_PENDING",
      items: [
        {
          ...mockReservation.items[0],
          status: "DELIVERED",
          returnSummary: {
            returnedQuantity: 0,
            brokenQuantity: 0,
            lostQuantity: 0,
            pendingReturnQuantity: 2,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "PENDING",
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: mockReservation.requester,
          items: [],
          approval: {
            id: "ret-app-1",
            status: "PENDING",
            description: null,
            decidedAt: null,
            approver: mockReservation.requester,
          },
          capabilities: { canApprove: true, canReject: true },
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
        },
      ],
    };

    vi.spyOn(api, "reservation").mockResolvedValue(pendingReturnReservation);
    const decideReturnSpy = vi.spyOn(api, "decideReturn").mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
      reservationId: mockReservation.id,
      status: "COMPLETED",
      returnedAt: "2026-09-02T10:00:00.000Z",
      returnedBy: mockReservation.requester,
      items: [],
      approval: {
        id: "ret-app-1",
        status: "APPROVED",
        description: "All parts in good condition",
        decidedAt: "2026-09-02T11:00:00.000Z",
        approver: mockReservation.requester,
      },
      capabilities: { canApprove: false, canReject: false },
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T11:00:00.000Z",
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

    // 1. Wait for Return Inspection Review toolbar to appear in manifest
    await waitFor(() => {
      expect(
        screen.getByText(/Return Inspection Review/i, { selector: "span" }),
      ).toBeInTheDocument();
    });

    const remarkInput = screen.getByPlaceholderText(/Inspection remarks \/ condition note/i);
    fireEvent.change(remarkInput, { target: { value: "All parts in good condition" } });

    const approveReturnBtn = screen.getByRole("button", { name: "Approve Return" });
    fireEvent.click(approveReturnBtn);

    await waitFor(() => {
      expect(decideReturnSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000201",
        {
          decision: "APPROVE",
          description: "All parts in good condition",
        }
      );
    });
  });

  it("renders interactive return inspection checklist and submits item condition breakdown", async () => {
    const pendingReturnReservation: ReservationDetail = {
      ...mockReservation,
      status: "RETURN_PENDING",
      items: [
        {
          ...mockReservation.items[0],
          status: "DELIVERED",
          returnSummary: {
            returnedQuantity: 0,
            brokenQuantity: 0,
            lostQuantity: 0,
            pendingReturnQuantity: 2,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "PENDING",
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: mockReservation.requester,
          items: [
            {
              id: "ret-item-1",
              reservationItemId: "item-1",
              assetId: "asset-1",
              assetName: "Stage Camera 4K",
              managementArea: { id: "area-1", name: "Marketing" },
              quantityReturned: 2,
              quantityBroken: 0,
              quantityLost: 0,
              description: null,
            },
          ],
          approval: {
            id: "ret-app-1",
            status: "PENDING",
            description: null,
            decidedAt: null,
            approver: mockReservation.requester,
          },
          capabilities: { canApprove: true, canReject: true },
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
        },
      ],
    };

    vi.spyOn(api, "reservation").mockResolvedValue(pendingReturnReservation);
    const decideReturnSpy = vi.spyOn(api, "decideReturn").mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000201",
      reservationId: mockReservation.id,
      status: "COMPLETED",
      returnedAt: "2026-09-02T10:00:00.000Z",
      returnedBy: mockReservation.requester,
      items: [],
      approval: {
        id: "ret-app-1",
        status: "APPROVED",
        description: "1 intact, 1 minor cable damage",
        decidedAt: "2026-09-02T11:00:00.000Z",
        approver: mockReservation.requester,
      },
      capabilities: { canApprove: false, canReject: false },
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T11:00:00.000Z",
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

    // 1. Wait for inspection review bar and checklist item to appear
    await waitFor(() => {
      expect(
        screen.getByText(/Return Inspection Review/i, { selector: "span" }),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Select Stage Camera 4K for inspection"),
      ).toBeChecked();
      expect(screen.getByText("Stage Camera 4K")).toBeInTheDocument();
      expect(screen.getByText("Marketing")).toBeInTheDocument();
    });

    const goodInput = screen.getByLabelText("Good quantity for Stage Camera 4K");
    expect(goodInput).toBeInTheDocument();
    fireEvent.change(goodInput, { target: { value: "1" } });

    const brokenInput = screen.getByLabelText("Broken quantity for Stage Camera 4K");
    expect(brokenInput).toBeInTheDocument();
    fireEvent.change(brokenInput, { target: { value: "1" } });

    const lostInput = screen.getByLabelText("Lost quantity for Stage Camera 4K");
    expect(lostInput).toBeInTheDocument();

    const remarkInput = screen.getByPlaceholderText(/Inspection remarks \/ condition note/i);
    fireEvent.change(remarkInput, { target: { value: "1 intact, 1 minor cable damage" } });

    const approveReturnBtn = screen.getByRole("button", { name: "Approve Return" });
    fireEvent.click(approveReturnBtn);

    await waitFor(() => {
      expect(decideReturnSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000201",
        {
          decision: "APPROVE",
          items: [
            {
              reservationItemId: "item-1",
              quantityReturned: 1,
              quantityBroken: 1,
              quantityLost: 0,
              description: undefined,
            },
          ],
          description: "1 intact, 1 minor cable damage",
        }
      );
    });
  });

  it("does not show Print / PDF button when reservation return is not yet approved or partially approved", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockReservation); // status is "APPROVED"

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

    // Verify Print button is NOT rendered when return is not yet approved
    await waitFor(() => {
      expect(screen.getByText("Quarterly Town Hall Stream")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Print \/ PDF/i })).not.toBeInTheDocument();
  });

  it("opens the hard paper print preview modal on return approved state (COMPLETED) and calls window.print", async () => {
    const returnApprovedReservation: ReservationDetail = {
      ...mockReservation,
      status: "COMPLETED",
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "APPROVED",
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: mockReservation.requester,
          items: [],
          approval: {
            id: "ret-app-1",
            status: "APPROVED",
            description: "All returned units intact",
            decidedAt: "2026-09-02T11:00:00.000Z",
            approver: mockReservation.requester,
          },
          capabilities: { canApprove: false, canReject: false },
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T11:00:00.000Z",
        },
      ],
    };

    vi.spyOn(api, "reservation").mockResolvedValue(returnApprovedReservation);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

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

    // Verify Print button is present in hero actions when return is approved
    const printBtn = await screen.findByRole("button", { name: /Print \/ PDF/i });
    expect(printBtn).toBeInTheDocument();

    // Click to open Print Preview modal
    fireEvent.click(printBtn);

    // Verify modal and sheet elements
    expect(screen.getByText("Official Manifest Document Preview")).toBeInTheDocument();
    expect(screen.getByText("EQUIPMENT DISPATCH & RETURN MANIFEST")).toBeInTheDocument();
    expect(screen.getByText("RES-00000000")).toBeInTheDocument();
    expect(screen.getByText("Reservation & Event Overview")).toBeInTheDocument();
    expect(screen.getByText("Chain of Custody & Formal Sign-Off")).toBeInTheDocument();

    // Click Print / Save PDF action inside the preview toolbar
    const printActionBtn = screen.getByRole("button", { name: /Print \/ Save PDF/i });
    fireEvent.click(printActionBtn);
    expect(printSpy).toHaveBeenCalled();

    // Close preview modal
    const closeBtn = screen.getByLabelText("Close document preview");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText("Official Manifest Document Preview")).not.toBeInTheDocument();
    });

    printSpy.mockRestore();
  });

  it("renders complete return inspection details, breakages, and restock clearance on printable manifest", async () => {
    const completedReturnReservation: ReservationDetail = {
      ...mockReservation,
      status: "COMPLETED",
      items: [
        {
          ...mockReservation.items[0],
          status: "RETURNED",
          returnSummary: {
            returnedQuantity: 2,
            brokenQuantity: 1,
            lostQuantity: 0,
            pendingReturnQuantity: 0,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "COMPLETED",
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "owner@example.com",
            name: "Event Owner",
            profilePictureUrl: null,
          },
          items: [
            {
              id: "ret-item-1",
              reservationItemId: "item-1",
              assetId: "asset-1",
              assetName: "Stage Camera 4K",
              quantityReturned: 1,
              quantityBroken: 1,
              quantityLost: 0,
              description: "1 unit intact, 1 unit broken lens hood",
              managementArea: { id: "area-1", name: "Marketing" },
            },
          ],
          approval: {
            id: "ret-app-1",
            status: "APPROVED",
            description: "Restocked functional unit to locker. Logged broken hood for repair.",
            decidedAt: "2026-09-02T11:00:00.000Z",
            approver: {
              id: "mgr-1",
              name: "Equipment Custodian",
              email: "custodian@example.com",
              profilePictureUrl: null,
            },
          },
          capabilities: { canApprove: false, canReject: false },
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T11:00:00.000Z",
        },
      ],
    };

    vi.spyOn(api, "reservation").mockResolvedValue(completedReturnReservation);

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

    const printBtn = await screen.findByRole("button", { name: /Print \/ PDF/i });
    fireEvent.click(printBtn);

    // Verify Complete Return Details on the printable sheet
    expect(screen.getByText("Return Slip #1:")).toBeInTheDocument();
    expect(screen.getByText("RET-00000000")).toBeInTheDocument();
    expect(screen.getByText("CLEARED & RESTOCKED TO INVENTORY")).toBeInTheDocument();
    expect(screen.getByText(/1 unit intact, 1 unit broken lens hood/i)).toBeInTheDocument();
    expect(screen.getByText(/Restocked functional unit to locker/i)).toBeInTheDocument();

    // Verify 3 Sign-off roles
    expect(screen.getByText("1. Requester / Borrower")).toBeInTheDocument();
    expect(screen.getByText("2. Area Custodian / Approver")).toBeInTheDocument();
    expect(screen.getByText("3. Return Receiving Inspector")).toBeInTheDocument();
  });
});
