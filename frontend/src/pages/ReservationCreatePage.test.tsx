import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import { toLocalDateTime } from "../reservations";
import type { AssetSummary } from "../types";
import { ReservationCreatePage } from "./ReservationCreatePage";

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
  totalQuantity: 4,
  allocatedQuantity: 1,
  availableQuantity: 3,
  isActive: true,
  status: "ACTIVE",
  assetTemplate: null,
  managementArea: { id: "area-1", name: "Production" },
  owner: null,
  capabilities: {
    canEdit: false,
    canDeactivate: false,
    canAdjustQuantity: false,
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("ReservationCreatePage", () => {
  it("adds a reservable asset to the event manifest", async () => {
    const createSpy = vi.spyOn(api, "createReservation");
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [asset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <ReservationCreatePage />
      </MemoryRouter>,
    );

    const result = await screen.findByRole("button", {
      name: /stage camera/i,
    });
    fireEvent.click(result);

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText(/3 currently available/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove stage camera/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    expect(screen.getByText("Enter an event name.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("uses a valid calendar window as the initial local schedule", () => {
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    const startAt = "2026-08-18T02:00:00.000Z";
    const endAt = "2026-08-18T10:00:00.000Z";

    render(
      <MemoryRouter
        initialEntries={[
          `/reservations/new?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`,
        ]}
      >
        <ReservationCreatePage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/^Starts/)).toHaveValue(
      toLocalDateTime(startAt),
    );
    expect(screen.getByLabelText(/^Ends/)).toHaveValue(toLocalDateTime(endAt));
  });
});
