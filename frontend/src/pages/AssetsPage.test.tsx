import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import type { AssetSummary } from "../types";
import { AssetsPage } from "./AssetsPage";

vi.mock("../auth", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

const mockArea = {
  id: "area-1",
  name: "Main Stage",
  description: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const mockTemplate = {
  id: "template-1",
  name: "AV Equipment",
  description: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

const mockAsset: AssetSummary = {
  id: "asset-1",
  name: "HD Projector",
  description: "1080p projector",
  pictureUrl: null,
  totalQuantity: 5,
  allocatedQuantity: 0,
  availableQuantity: 5,
  isActive: true,
  status: "ACTIVE",
  managementArea: mockArea,
  assetTemplate: mockTemplate,
  owner: null,
  capabilities: {
    canEdit: true,
    canAdjustQuantity: true,
    canDeactivate: true,
  },
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("AssetsPage", () => {
  it("renders asset list and allows row click to toggle checkbox selection", async () => {
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [mockArea],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "templates").mockResolvedValue({
      data: [mockTemplate],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [mockAsset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    );

    const elements = await screen.findAllByText(/HD Projector/);
    expect(elements.length).toBeGreaterThan(0);

    const checkbox = screen.getAllByLabelText("Select HD Projector")[0] as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Clicking row should select checkbox
    const row = checkbox.closest("tr")!;
    fireEvent.click(row);

    expect(checkbox.checked).toBe(true);
    expect(row).toHaveClass("asset-table-row--selected");
    expect(screen.getByText("selected")).toBeInTheDocument();

    const viewLinks = screen.getAllByRole("link", { name: /view/i });
    expect(viewLinks.length).toBeGreaterThan(0);
    expect(viewLinks[0]).toHaveAttribute("href", "/assets/asset-1");

    // Clicking row again should deselect
    fireEvent.click(row);
    expect(checkbox.checked).toBe(false);
    expect(row).not.toHaveClass("asset-table-row--selected");
  });
});
