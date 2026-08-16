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
  useAuth: () => ({ hasAreaPermission: () => true }),
}));

vi.mock("../reservations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../reservations")>()),
  rememberReservation: vi.fn(),
}));

const reservation: ReservationDetail = {
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
  participants: [],
  items: [
    reservationItem(
      "00000000-0000-4000-8000-000000000201",
      "00000000-0000-4000-8000-000000000301",
      "Stage camera",
    ),
    reservationItem(
      "00000000-0000-4000-8000-000000000202",
      "00000000-0000-4000-8000-000000000302",
      "Wireless microphone",
    ),
  ],
  changeRequests: [],
  returns: [],
  capabilities: { canSubmit: false, canRequestChange: false },
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("ReservationDetailPage", () => {
  it("selects pending assets and submits one batch approval", async () => {
    vi.spyOn(api, "reservation").mockResolvedValue(reservation);
    const decideSpy = vi
      .spyOn(api, "decideReservationItems")
      .mockResolvedValue({ ...reservation, status: "APPROVED" });

    render(
      <MemoryRouter initialEntries={[`/reservations/${reservation.id}`]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Quarterly town hall" });
    const stageCameraCheckbox = screen.getByLabelText("Select Stage camera");
    fireEvent.click(screen.getByText("Stage camera"));
    expect(stageCameraCheckbox).toBeChecked();
    expect(
      screen.getByRole("link", { name: "View Stage camera" }),
    ).toHaveAttribute("href", `/assets/${reservation.items[0].asset.id}`);
    fireEvent.click(screen.getByLabelText("Select Wireless microphone"));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Approve 2 selected assets",
      }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Ready together" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Approve selected" }),
    );

    await waitFor(() =>
      expect(decideSpy).toHaveBeenCalledWith(
        reservation.id,
        reservation.items.map((item) => item.id),
        "APPROVE",
        "Ready together",
      ),
    );
  });

  it("cancels an approved reservation when confirmed in dialog", async () => {
    const approvedReservation: ReservationDetail = {
      ...reservation,
      status: "APPROVED",
      capabilities: { canSubmit: false, canRequestChange: true, canCancel: true },
    };
    vi.spyOn(api, "reservation").mockResolvedValue(approvedReservation);
    const cancelSpy = vi
      .spyOn(api, "cancelReservation")
      .mockResolvedValue({ ...approvedReservation, status: "CANCELLED" });

    render(
      <MemoryRouter initialEntries={[`/reservations/${approvedReservation.id}`]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Quarterly town hall" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel reservation" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Cancel reservation" }),
    ).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Event postponed" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm cancellation" }),
    );

    await waitFor(() =>
      expect(cancelSpy).toHaveBeenCalledWith(approvedReservation.id, "Event postponed"),
    );
  });

  it("allows user to confirm equipment delivery on approved reservation", async () => {
    const approvedReservation: ReservationDetail = {
      ...reservation,
      status: "APPROVED",
      items: reservation.items.map((item) => ({
        ...item,
        status: "APPROVED" as const,
      })),
      returns: [],
      capabilities: {
        canSubmit: false,
        canRequestChange: false,
        canConfirmDelivery: true,
        canReturn: true,
      },
    };
    vi.spyOn(api, "reservation").mockResolvedValue(approvedReservation);
    const confirmDeliverySpy = vi.spyOn(api, "confirmDelivery").mockResolvedValue({
      ...approvedReservation,
      status: "DELIVERY_CONFIRMED",
      capabilities: {
        canSubmit: false,
        canRequestChange: false,
        canConfirmDelivery: false,
        canReturn: true,
      },
    });

    render(
      <MemoryRouter initialEntries={[`/reservations/${approvedReservation.id}`]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Quarterly town hall" });
    fireEvent.click(screen.getByRole("button", { name: /Confirm delivery/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Confirm equipment delivery" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /Confirm delivery receipt/i }),
    );

    await waitFor(() =>
      expect(confirmDeliverySpy).toHaveBeenCalledWith(approvedReservation.id, undefined),
    );
  });

  it("renders inline return request panel on delivery confirmed reservation and submits return", async () => {
    const deliveryConfirmedReservation: ReservationDetail = {
      ...reservation,
      status: "DELIVERY_CONFIRMED",
      items: reservation.items.map((item) => ({
        ...item,
        status: "DELIVERED" as const,
        returnSummary: {
          returnedQuantity: 0,
          brokenQuantity: 0,
          lostQuantity: 0,
          pendingReturnQuantity: 0,
          remainingReturnQuantity: 1,
        },
      })),
      returns: [],
      capabilities: { canSubmit: false, canRequestChange: false, canReturn: true },
    };
    vi.spyOn(api, "reservation").mockResolvedValue(deliveryConfirmedReservation);
    const createReturnSpy = vi.spyOn(api, "createReturn").mockResolvedValue({
      id: "ret-1",
      reservationId: deliveryConfirmedReservation.id,
      status: "PENDING",
      returnedAt: "2026-09-01T12:00:00.000Z",
      returnedBy: deliveryConfirmedReservation.requester,
      items: [],
      approval: null,
      capabilities: { canApprove: true, canReject: true },
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={[`/reservations/${deliveryConfirmedReservation.id}`]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Quarterly town hall" });

    expect(
      screen.getByRole("heading", { name: /Return request/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Return confirm request" }),
    );

    await waitFor(() =>
      expect(createReturnSpy).toHaveBeenCalledWith(
        deliveryConfirmedReservation.id,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              reservationItemId: deliveryConfirmedReservation.items[0].id,
              quantityReturned: 1,
            }),
          ]),
        }),
      ),
    );
  });

  it("allows manager to confirm and approve a pending return with 3 condition counts", async () => {
    const returnWithPending: ReservationDetail = {
      ...reservation,
      status: "APPROVED",
      items: reservation.items.map((item) => ({
        ...item,
        status: "APPROVED" as const,
        returnSummary: {
          returnedQuantity: 0,
          brokenQuantity: 0,
          lostQuantity: 0,
          pendingReturnQuantity: 1,
          remainingReturnQuantity: 0,
        },
      })),
      returns: [
        {
          id: "ret-1",
          reservationId: reservation.id,
          status: "PENDING",
          returnedAt: "2026-09-01T12:00:00.000Z",
          returnedBy: reservation.requester,
          items: [
            {
              id: "ret-item-1",
              reservationItemId: reservation.items[0].id,
              assetId: reservation.items[0].asset.id,
              assetName: "Stage camera",
              managementArea: { id: "area-1", name: "Production" },
              quantityReturned: 1,
              quantityBroken: 0,
              quantityLost: 0,
              description: "All intact",
            },
          ],
          approval: null,
          capabilities: { canApprove: true, canReject: true },
          createdAt: "2026-09-01T12:00:00.000Z",
          updatedAt: "2026-09-01T12:00:00.000Z",
        },
      ],
      capabilities: { canSubmit: false, canRequestChange: false, canReturn: true },
    };

    vi.spyOn(api, "reservation").mockResolvedValue(returnWithPending);
    const decideReturnSpy = vi.spyOn(api, "decideReturn").mockResolvedValue({
      id: "ret-1",
      reservationId: reservation.id,
      status: "COMPLETED",
      returnedAt: "2026-09-01T12:00:00.000Z",
      returnedBy: reservation.requester,
      items: [],
      approval: {
        id: "app-1",
        status: "APPROVED",
        description: "Verified in good order",
        decidedAt: "2026-09-01T13:00:00.000Z",
        approver: reservation.requester,
      },
      capabilities: { canApprove: false, canReject: false },
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T13:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={[`/reservations/${returnWithPending.id}`]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Quarterly town hall" });
    expect(screen.getByText("Pending Confirmation")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm & approve return" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /Return confirm/i }),
    ).toBeInTheDocument();

    // Verify 3 input boxes exist with correct defaults
    const goodInput = within(dialog).getByLabelText("Number of good for Stage camera");
    expect(goodInput).toHaveValue(1);

    const brokenInput = within(dialog).getByLabelText("Number of broken for Stage camera");
    expect(brokenInput).toHaveValue(0);

    const lostInput = within(dialog).getByLabelText("Number of lost for Stage camera");
    expect(lostInput).toHaveValue(0);

    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Verified in good order" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Return confirm" }));

    await waitFor(() =>
      expect(decideReturnSpy).toHaveBeenCalledWith(
        returnWithPending.id,
        "ret-1",
        expect.objectContaining({
          decision: "APPROVE",
          description: "Verified in good order",
          items: expect.arrayContaining([
            expect.objectContaining({
              reservationItemId: returnWithPending.items[0].id,
              quantityReturned: 1,
              quantityBroken: 0,
              quantityLost: 0,
            }),
          ]),
        }),
      ),
    );
  });

  it("submits return confirm request via inline return form with custom return quantity", async () => {
    const deliveryConfirmedReservation: ReservationDetail = {
      ...reservation,
      status: "DELIVERY_CONFIRMED",
      items: reservation.items.map((item) => ({
        ...item,
        status: "DELIVERED" as const,
        returnSummary: {
          returnedQuantity: 0,
          brokenQuantity: 0,
          lostQuantity: 0,
          pendingReturnQuantity: 0,
          remainingReturnQuantity: 1,
        },
      })),
      returns: [],
      capabilities: { canSubmit: false, canRequestChange: false, canReturn: true },
    };
    vi.spyOn(api, "reservation").mockResolvedValue(deliveryConfirmedReservation);
    const createReturnSpy = vi.spyOn(api, "createReturn").mockResolvedValue({
      id: "ret-2",
      reservationId: deliveryConfirmedReservation.id,
      status: "COMPLETED",
      returnedAt: "2026-09-01T12:00:00.000Z",
      returnedBy: deliveryConfirmedReservation.requester,
      items: [],
      approval: null,
      capabilities: { canApprove: false, canReject: false },
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    });

    render(
      <MemoryRouter initialEntries={[`/reservations/${deliveryConfirmedReservation.id}`]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Quarterly town hall" });

    // The inline return form should be rendered directly by default in the page
    expect(screen.getByRole("heading", { name: /Return request/i })).toBeInTheDocument();

    // Verify the return quantity input
    const returnQtyInput = screen.getByLabelText(`Return quantity for ${deliveryConfirmedReservation.items[0].asset.name}`);
    expect(returnQtyInput).toHaveValue(1);

    // Submit return confirm request
    fireEvent.click(
      screen.getByRole("button", { name: "Return confirm request" }),
    );

    await waitFor(() =>
      expect(createReturnSpy).toHaveBeenCalledWith(
        deliveryConfirmedReservation.id,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              reservationItemId: deliveryConfirmedReservation.items[0].id,
              quantityReturned: 1,
            }),
          ]),
        }),
      ),
    );
  });
});

function reservationItem(id: string, assetId: string, name: string) {
  return {
    id,
    quantity: 1,
    status: "PENDING" as const,
    asset: {
      id: assetId,
      name,
      description: null,
      pictureUrl: null,
      isActive: true,
      managementArea: { id: "area-1", name: "Production" },
      template: null,
    },
    approval: null,
    availability: {
      assetId,
      totalQuantity: 2,
      approvedQuantity: 0,
      pendingQuantity: 0,
      availableQuantity: 2,
      pendingReservationCount: 0,
    },
    warnings: [],
    capabilities: { canApprove: true, canReject: true },
  };
}
