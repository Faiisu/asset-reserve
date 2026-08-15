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
    fireEvent.click(screen.getByLabelText("Select Stage camera"));
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
