import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import { toLocalDateTime } from "../reservations";
import type { AssetDetail, AssetSummary } from "../types";
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
  partNumber: null,
  totalQuantity: 4,
  allocatedQuantity: 1,
  availableQuantity: 3,
  unitCounts: {
    total: 4,
    active: 3,
    reserved: 0,
    checkedOut: 1,
    broken: 0,
    lost: 0,
    inRepair: 0,
    inactive: 0,
  },
  isActive: true,
  managementArea: { id: "area-1", name: "Production" },
  owner: null,
  capabilities: {
    canEdit: false,
    canDeactivate: false,
    canManageUnits: false,
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const assetDetail: AssetDetail = {
  ...asset,
  editPolicy: { permission: "asset:update", roles: ["ADMIN", "MANAGER"] },
  activeReservationItems: [],
  units: [],
  unitEventLedger: [],
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
    expect(screen.getByText(/3 available for this time/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove stage camera/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save draft/i }));
    expect(screen.getByText("Enter an event name.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("uses the calendar schedule and assets as the initial manifest", async () => {
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    const assetSpy = vi.spyOn(api, "asset").mockResolvedValue(assetDetail);
    const startAt = "2026-08-18T02:00:00.000Z";
    const endAt = "2026-08-18T10:00:00.000Z";

    render(
      <MemoryRouter
        initialEntries={[
          `/reservations/new?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}&assetId=${asset.id}`,
        ]}
      >
        <StrictMode>
          <ReservationCreatePage />
        </StrictMode>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(/^Starts/)).toHaveValue(
      toLocalDateTime(startAt),
    );
    expect(screen.getByLabelText(/^Ends/)).toHaveValue(toLocalDateTime(endAt));
    expect(await screen.findByText("1 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Remove Stage camera/i }),
    ).toBeInTheDocument();
    expect(assetSpy).toHaveBeenCalledWith(asset.id);
  });

  it("does not allow a fully booked asset to be added", async () => {
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [
        {
          ...asset,
          allocatedQuantity: asset.totalQuantity,
          availableQuantity: 0,
        },
      ],
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
    expect(result).toBeDisabled();
    expect(screen.getByText(/Fully booked for this time/i)).toBeInTheDocument();
    expect(api.assets).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      }),
    );
  });

  it("sorts fully booked assets to the bottom of the picker list", async () => {
    const availableAsset: AssetSummary = {
      ...asset,
      id: "asset-available",
      name: "Available Mic",
      availableQuantity: 2,
    };
    const bookedAsset: AssetSummary = {
      ...asset,
      id: "asset-booked",
      name: "Booked Camera",
      availableQuantity: 0,
    };

    // Return booked asset first from API
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [bookedAsset, availableAsset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <ReservationCreatePage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: /available mic/i });

    const items = screen.getAllByRole("button", { name: /(available mic|booked camera)/i });
    expect(items[0]).toHaveTextContent("Available Mic");
    expect(items[1]).toHaveTextContent("Booked Camera");
  });

  it("blocks submitting an event without selecting any assets", async () => {
    const createSpy = vi.spyOn(api, "createReservation").mockResolvedValue({
      id: "new-res-id",
    } as never);
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [asset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <ReservationCreatePage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/^Event name/), {
      target: { value: "Sprint Planning" },
    });

    const submitBtn = screen.getByRole("button", { name: /send for approval/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/select at least one asset/i),
    ).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
