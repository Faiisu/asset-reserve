import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
      status: "PREPARED",
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
      units: [
        { id: "riu-1", assetUnitId: "au-1", serialNumber: "SN-CAM-001", status: "ASSIGNED" },
        { id: "riu-2", assetUnitId: "au-2", serialNumber: "SN-CAM-002", status: "ASSIGNED" },
      ],
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
        totalUnits: 2,
        returnedGoodCount: 0,
        returnedBrokenCount: 0,
        returnedLostCount: 0,
        pendingReturnCount: 0,
        remainingReturnQuantity: 2,
      },
    },
  ],
  returns: [],
  capabilities: {
    canSubmit: false,
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
      units: [],
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
        totalUnits: 3,
        returnedGoodCount: 0,
        returnedBrokenCount: 0,
        returnedLostCount: 0,
        pendingReturnCount: 0,
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
    expect(screen.getByText("All equipment approved for handover")).toBeInTheDocument();
    // Every assigned serial unit is pre-selected for handover by default.
    expect(
      screen.getByText("Handover confirmation (2 of 2 serial units selected)"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Select serial SN-CAM-001 for handover")).toBeChecked();
    expect(screen.getByLabelText("Select serial SN-CAM-002 for handover")).toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm Handover" })).toBeEnabled();
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

  it("allows Area Manager to assign serial units and approve an item inline", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockPendingReservation);
    const assetUnitsSpy = vi.spyOn(api, "assetUnits").mockResolvedValue({
      data: [
        {
          id: "unit-1",
          serialNumber: "SN-MIC-001",
          status: "ACTIVE",
          note: null,
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
        {
          id: "unit-2",
          serialNumber: "SN-MIC-002",
          status: "ACTIVE",
          note: null,
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
        {
          id: "unit-3",
          serialNumber: "SN-MIC-003",
          status: "ACTIVE",
          note: null,
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    const decideSpy = vi.spyOn(api, "decideReservationItems").mockResolvedValue({
      ...mockPendingReservation,
      status: "APPROVED",
      items: [
        {
          ...mockPendingReservation.items[0],
          status: "PREPARED",
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

    // 1. Wait for reservation to load and the serial-unit picker to fetch
    await waitFor(() => {
      expect(assetUnitsSpy).toHaveBeenCalledWith("asset-pending-1", {
        status: "ACTIVE",
        limit: 100,
      });
    });

    const approveButton = await screen.findByRole("button", { name: "Approve" });
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(approveButton).toBeDisabled();

    // 2. Select all 3 required serial units
    fireEvent.click(await screen.findByLabelText("Assign serial SN-MIC-001"));
    fireEvent.click(screen.getByLabelText("Assign serial SN-MIC-002"));
    fireEvent.click(screen.getByLabelText("Assign serial SN-MIC-003"));
    expect(approveButton).toBeEnabled();

    // 3. Type decision remark and click Approve
    const remarkInput = screen.getByLabelText(/Approval comment for Wireless Microphone Kit/i);
    fireEvent.change(remarkInput, { target: { value: "Approved for town hall" } });
    fireEvent.click(approveButton);

    // 4. Verify API was called with the selected item's serial units and remark
    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        [{ reservationItemId: "item-pending-1", assetUnitIds: ["unit-1", "unit-2", "unit-3"] }],
        "APPROVE",
        "Approved for town hall"
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText("Wireless Microphone Kit").closest(".res-manifest-item"),
      ).toHaveAttribute("data-status", "prepared");
    });
  });

  it("enables Approve as soon as one serial unit is picked (partial unit-based approval)", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockPendingReservation);
    vi.spyOn(api, "assetUnits").mockResolvedValue({
      data: [
        {
          id: "unit-1",
          serialNumber: "SN-MIC-001",
          status: "ACTIVE",
          note: null,
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
      ],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    const decideSpy = vi.spyOn(api, "decideReservationItems").mockResolvedValue({
      ...mockPendingReservation,
      status: "APPROVED",
      items: [
        {
          ...mockPendingReservation.items[0],
          quantity: 1,
          status: "PREPARED",
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

    const serialCheckbox = await screen.findByLabelText("Assign serial SN-MIC-001");
    const approveButton = screen.getByRole("button", { name: "Approve" });
    expect(approveButton).toBeDisabled();

    // mockPendingReservation's item requests quantity 3 -- picking just 1
    // unit should still enable Approve (approval is unit-based: fewer than
    // requested is allowed, cuts the item's quantity down to match).
    fireEvent.click(serialCheckbox);
    expect(serialCheckbox).toBeChecked();
    expect(approveButton).toBeEnabled();

    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        [{ reservationItemId: "item-pending-1", assetUnitIds: ["unit-1"] }],
        "APPROVE",
        undefined,
      );
    });
  });

  it("confirms handover for only the serial units explicitly selected (partial handover)", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(mockReservation);
    const confirmSpy = vi.spyOn(api, "confirmDelivery").mockResolvedValue({
      ...mockReservation,
      items: [
        {
          ...mockReservation.items[0],
          units: [
            { ...mockReservation.items[0].units[0], status: "CHECKED_OUT" },
            mockReservation.items[0].units[1],
          ],
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

    const serialOne = await screen.findByLabelText(
      "Select serial SN-CAM-001 for handover",
    );
    const serialTwo = screen.getByLabelText(
      "Select serial SN-CAM-002 for handover",
    );

    const confirmButton = screen.getByRole("button", {
      name: "Confirm Handover",
    });
    // Every assigned serial unit is pre-selected by default.
    expect(serialOne).toBeChecked();
    expect(serialTwo).toBeChecked();
    expect(confirmButton).toBeEnabled();

    // Partial handover: deselect one serial unit, hand over only the other.
    fireEvent.click(serialTwo);
    expect(serialOne).toBeChecked();
    expect(serialTwo).not.toBeChecked();
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        { items: [{ reservationItemId: "item-1", reservationItemUnitIds: ["riu-1"] }] },
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
          units: [
            {
              id: "unit-1",
              assetUnitId: "au-1",
              serialNumber: "SN-CAM-001",
              status: "CHECKED_OUT",
            },
            {
              id: "unit-2",
              assetUnitId: "au-2",
              serialNumber: "SN-CAM-002",
              status: "CHECKED_OUT",
            },
          ],
          capabilities: {
            canApprove: false,
            canReject: false,
            canConfirmDelivery: false,
            canReturn: true,
          },
          returnSummary: {
            totalUnits: 2,
            returnedGoodCount: 0,
            returnedBrokenCount: 0,
            returnedLostCount: 0,
            pendingReturnCount: 0,
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
      note: null,
      returnedAt: null,
      returnedBy: deliveredReservation.requester.id,
      returner: deliveredReservation.requester,
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

    // Both checked-out serials are pre-selected for return by default, no
    // item-level grouping checkbox needed -- selection is per-unit only.
    const serialOne = screen.getByLabelText("Return serial SN-CAM-001");
    const serialTwo = screen.getByLabelText("Return serial SN-CAM-002");
    expect(serialOne).toBeChecked();
    expect(serialTwo).toBeChecked();

    const submitReturnBtn = screen.getByRole("button", { name: /Submit Return/i });
    fireEvent.click(submitReturnBtn);

    await waitFor(() => {
      expect(returnSpy).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000101",
        {
          items: [
            {
              reservationItemId: "item-1",
              reservationItemUnitIds: ["unit-1", "unit-2"],
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
            totalUnits: 2,
            returnedGoodCount: 0,
            returnedBrokenCount: 0,
            returnedLostCount: 0,
            pendingReturnCount: 2,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "PENDING",
          note: null,
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: mockReservation.requester.id,
          returner: mockReservation.requester,
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
      note: null,
      returnedAt: "2026-09-02T10:00:00.000Z",
      returnedBy: mockReservation.requester.id,
      returner: mockReservation.requester,
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

  it("renders interactive return inspection checklist and submits per-serial condition decisions", async () => {
    const pendingReturnReservation: ReservationDetail = {
      ...mockReservation,
      status: "RETURN_PENDING",
      items: [
        {
          ...mockReservation.items[0],
          status: "DELIVERED",
          units: [
            {
              id: "unit-1",
              assetUnitId: "au-1",
              serialNumber: "SN-CAM-001",
              status: "CHECKED_OUT",
            },
            {
              id: "unit-2",
              assetUnitId: "au-2",
              serialNumber: "SN-CAM-002",
              status: "CHECKED_OUT",
            },
          ],
          returnSummary: {
            totalUnits: 2,
            returnedGoodCount: 0,
            returnedBrokenCount: 0,
            returnedLostCount: 0,
            pendingReturnCount: 2,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "PENDING",
          note: null,
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: mockReservation.requester.id,
          returner: mockReservation.requester,
          items: [
            {
              id: "ret-item-1",
              returnId: "00000000-0000-4000-8000-000000000201",
              reservationItemId: "item-1",
              assetId: "asset-1",
              assetName: "Stage Camera 4K",
              managementArea: { id: "area-1", name: "Marketing" },
              description: null,
              pictureUrl: null,
              units: [
                {
                  id: "retunit-1",
                  returnItemId: "ret-item-1",
                  reservationItemUnitId: "unit-1",
                  assetUnitId: "au-1",
                  serialNumber: "SN-CAM-001",
                  condition: null,
                  pictureUrl: null,
                  note: null,
                  createdAt: "2026-09-02T10:00:00.000Z",
                },
                {
                  id: "retunit-2",
                  returnItemId: "ret-item-1",
                  reservationItemUnitId: "unit-2",
                  assetUnitId: "au-2",
                  serialNumber: "SN-CAM-002",
                  condition: null,
                  pictureUrl: null,
                  note: null,
                  createdAt: "2026-09-02T10:00:00.000Z",
                },
              ],
              createdAt: "2026-09-02T10:00:00.000Z",
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
      note: null,
      returnedAt: "2026-09-02T10:00:00.000Z",
      returnedBy: mockReservation.requester.id,
      returner: mockReservation.requester,
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
        screen.getByLabelText("Select serial SN-CAM-001 for inspection"),
      ).toBeChecked();
      expect(screen.getByText("Stage Camera 4K")).toBeInTheDocument();
      expect(screen.getByText("Marketing")).toBeInTheDocument();
    });

    // Every serial defaults to Good; mark the first one Broken.
    const firstSerialRow = screen.getByText("SN-CAM-001").closest(
      ".res-manifest-unit-row",
    ) as HTMLElement;
    const secondSerialRow = screen.getByText("SN-CAM-002").closest(
      ".res-manifest-unit-row",
    ) as HTMLElement;
    expect(
      within(firstSerialRow).getByRole("radio", { name: "Good" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(firstSerialRow).getByRole("radio", { name: "Broken" }));
    expect(
      within(secondSerialRow).getByRole("radio", { name: "Good" }),
    ).toHaveAttribute("aria-checked", "true");

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
              units: [
                { reservationItemUnitId: "unit-1", condition: "BROKEN" },
                { reservationItemUnitId: "unit-2", condition: "GOOD" },
              ],
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
          note: null,
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: mockReservation.requester.id,
          returner: mockReservation.requester,
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
          units: [
            {
              id: "unit-1",
              assetUnitId: "au-1",
              serialNumber: "SN-CAM-001",
              status: "RETURNED_GOOD",
            },
            {
              id: "unit-2",
              assetUnitId: "au-2",
              serialNumber: "SN-CAM-002",
              status: "RETURNED_BROKEN",
            },
          ],
          returnSummary: {
            totalUnits: 2,
            returnedGoodCount: 1,
            returnedBrokenCount: 1,
            returnedLostCount: 0,
            pendingReturnCount: 0,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [
        {
          id: "00000000-0000-4000-8000-000000000201",
          reservationId: mockReservation.id,
          status: "COMPLETED",
          note: null,
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: "00000000-0000-4000-8000-000000000001",
          returner: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "owner@example.com",
            name: "Event Owner",
            profilePictureUrl: null,
          },
          items: [
            {
              id: "ret-item-1",
              returnId: "00000000-0000-4000-8000-000000000201",
              reservationItemId: "item-1",
              assetId: "asset-1",
              assetName: "Stage Camera 4K",
              description: "1 unit intact, 1 unit broken lens hood",
              pictureUrl: null,
              units: [
                {
                  id: "retunit-1",
                  returnItemId: "ret-item-1",
                  reservationItemUnitId: "unit-1",
                  assetUnitId: "au-1",
                  serialNumber: "SN-CAM-001",
                  condition: "GOOD",
                  pictureUrl: null,
                  note: null,
                  createdAt: "2026-09-02T10:00:00.000Z",
                },
                {
                  id: "retunit-2",
                  returnItemId: "ret-item-1",
                  reservationItemUnitId: "unit-2",
                  assetUnitId: "au-2",
                  serialNumber: "SN-CAM-002",
                  condition: "BROKEN",
                  pictureUrl: null,
                  note: null,
                  createdAt: "2026-09-02T10:00:00.000Z",
                },
              ],
              managementArea: { id: "area-1", name: "Marketing" },
              createdAt: "2026-09-02T10:00:00.000Z",
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

  it("lists one manifest row per serial unit, grouped under a single asset sub-header", async () => {
    const completedReturnReservation: ReservationDetail = {
      ...mockReservation,
      status: "COMPLETED",
      items: [
        {
          ...mockReservation.items[0],
          status: "RETURNED",
          units: [
            {
              id: "unit-1",
              assetUnitId: "au-1",
              serialNumber: "SN-CAM-001",
              status: "RETURNED_GOOD",
            },
            {
              id: "unit-2",
              assetUnitId: "au-2",
              serialNumber: "SN-CAM-002",
              status: "RETURNED_BROKEN",
            },
          ],
          returnSummary: {
            totalUnits: 2,
            returnedGoodCount: 1,
            returnedBrokenCount: 1,
            returnedLostCount: 0,
            pendingReturnCount: 0,
            remainingReturnQuantity: 0,
          },
        },
      ],
      returns: [],
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

    // The asset name appears once, in the group sub-header -- not repeated
    // per serial unit row.
    expect(await screen.findAllByText("Stage Camera 4K")).toHaveLength(1);

    const goodRow = screen.getByText("SN-CAM-001").closest(".res-manifest-unit-row") as HTMLElement;
    const brokenRow = screen.getByText("SN-CAM-002").closest(".res-manifest-unit-row") as HTMLElement;
    expect(within(goodRow).getByText("Good")).toBeInTheDocument();
    expect(within(brokenRow).getByText("Broken")).toBeInTheDocument();
  });
});
