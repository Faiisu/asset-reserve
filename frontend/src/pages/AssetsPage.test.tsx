import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const mockAsset: AssetSummary = {
  id: "asset-1",
  name: "HD Projector",
  description: "1080p projector",
  pictureUrl: null,
  partNumber: null,
  totalQuantity: 5,
  unitCounts: {
    total: 0,
    active: 0,
    reserved: 0,
    checkedOut: 0,
    broken: 0,
    lost: 0,
    inRepair: 0,
    inactive: 0,
  },

  allocatedQuantity: 0,
  availableQuantity: 5,
  isActive: true,
  managementArea: mockArea,
  owner: null,
  capabilities: {
    canEdit: true,
    canManageUnits: true,
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

    const checkbox = screen.getAllByLabelText(
      "Select HD Projector",
    )[0] as HTMLInputElement;
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

  it("sorts asset list so editable assets appear before non-editable assets", async () => {
    const readOnlyAsset: AssetSummary = {
      id: "asset-ro",
      name: "AAA View Only Camera",
      description: "Read only",
      pictureUrl: null,
      partNumber: null,
      totalQuantity: 2,
      unitCounts: {
        total: 0,
        active: 0,
        reserved: 0,
        checkedOut: 0,
        broken: 0,
        lost: 0,
        inRepair: 0,
        inactive: 0,
      },

      allocatedQuantity: 0,
      availableQuantity: 2,
      isActive: true,
      managementArea: mockArea,
      owner: null,
      capabilities: {
        canEdit: false,
        canManageUnits: false,
        canDeactivate: false,
      },
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    };

    const editableAsset: AssetSummary = {
      id: "asset-ed",
      name: "ZZZ Editable Microphone",
      description: "Editable",
      pictureUrl: null,
      partNumber: null,
      totalQuantity: 10,
      unitCounts: {
        total: 0,
        active: 0,
        reserved: 0,
        checkedOut: 0,
        broken: 0,
        lost: 0,
        inRepair: 0,
        inactive: 0,
      },

      allocatedQuantity: 0,
      availableQuantity: 10,
      isActive: true,
      managementArea: mockArea,
      owner: null,
      capabilities: {
        canEdit: true,
        canManageUnits: true,
        canDeactivate: true,
      },
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    };

    vi.spyOn(api, "areas").mockResolvedValue({
      data: [mockArea],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    // API returns read-only asset first
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [readOnlyAsset, editableAsset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    );

    const editableElements = await screen.findAllByText(
      /ZZZ Editable Microphone/,
    );
    expect(editableElements.length).toBeGreaterThan(0);

    const rows = screen.getAllByRole("row");
    // Row 0 is the table header <thead><tr>...</tr></thead>
    // Row 1 should be the editable asset
    // Row 2 should be the read-only asset
    expect(rows[1]).toHaveTextContent("ZZZ Editable Microphone");
    expect(rows[2]).toHaveTextContent("AAA View Only Camera");
  });

  it("switches between All assets and My assets tabs", async () => {
    const otherAsset: AssetSummary = {
      id: "asset-other",
      name: "AAA Other Team Camera",
      description: "Read only other asset",
      pictureUrl: null,
      partNumber: null,
      totalQuantity: 2,
      unitCounts: {
        total: 0,
        active: 0,
        reserved: 0,
        checkedOut: 0,
        broken: 0,
        lost: 0,
        inRepair: 0,
        inactive: 0,
      },

      allocatedQuantity: 0,
      availableQuantity: 2,
      isActive: true,
      managementArea: mockArea,
      owner: {
        id: "user-other",
        email: "other@example.com",
        name: "Other User",
        profilePictureUrl: null,
      },
      capabilities: {
        canEdit: false,
        canManageUnits: false,
        canDeactivate: false,
      },
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    };

    const myAsset: AssetSummary = {
      id: "asset-my",
      name: "ZZZ My Managed Asset",
      description: "My managed asset",
      pictureUrl: null,
      partNumber: null,
      totalQuantity: 10,
      unitCounts: {
        total: 0,
        active: 0,
        reserved: 0,
        checkedOut: 0,
        broken: 0,
        lost: 0,
        inRepair: 0,
        inactive: 0,
      },

      allocatedQuantity: 0,
      availableQuantity: 10,
      isActive: true,
      managementArea: mockArea,
      owner: null,
      capabilities: {
        canEdit: true,
        canManageUnits: true,
        canDeactivate: true,
      },
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    };

    vi.spyOn(api, "areas").mockResolvedValue({
      data: [mockArea],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "assets").mockResolvedValue({
      data: [otherAsset, myAsset],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    );

    expect(
      (await screen.findAllByText("ZZZ My Managed Asset")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("AAA Other Team Camera").length).toBeGreaterThan(
      0,
    );

    const myTab = screen.getByRole("tab", { name: /my assets/i });
    fireEvent.click(myTab);

    expect(screen.getAllByText("ZZZ My Managed Asset").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryAllByText("AAA Other Team Camera")).toHaveLength(0);

    const allTab = screen.getByRole("tab", { name: /all assets/i });
    fireEvent.click(allTab);

    expect(screen.getAllByText("ZZZ My Managed Asset").length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("AAA Other Team Camera").length).toBeGreaterThan(
      0,
    );
  });

  it("filters assets by isActive (Active/Inactive) via GET /assets", async () => {
    const activeAsset: AssetSummary = {
      ...mockAsset,
      id: "asset-active",
      name: "Active Asset",
      isActive: true,
    };
    const inactiveAsset: AssetSummary = {
      ...mockAsset,
      id: "asset-inactive",
      name: "Inactive Asset",
      isActive: false,
    };

    vi.spyOn(api, "areas").mockResolvedValue({
      data: [mockArea],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    vi.spyOn(api, "assets").mockImplementation(async (query?: any) => {
      let data = [activeAsset, inactiveAsset];
      if (query?.isActive !== undefined) {
        data = data.filter((a) => a.isActive === query.isActive);
      }
      return {
        data,
        pageInfo: { nextCursor: null, hasNextPage: false },
      };
    });

    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    );

    // Initial filter shows all assets
    expect((await screen.findAllByText("Active Asset")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Inactive Asset").length).toBeGreaterThan(0);

    // Open unified filter dropdown and toggle Inactive
    const filterBtn = screen.getByRole("button", {
      name: /Filter assets by workspace and status/i,
    });
    fireEvent.click(filterBtn);

    const popover = screen.getByRole("dialog", { name: "Filter assets" });
    fireEvent.click(within(popover).getByText("Inactive"));

    // Now only Inactive should appear
    await waitFor(() => {
      expect(screen.getAllByText("Inactive Asset").length).toBeGreaterThan(0);
    });
    expect(screen.queryAllByText("Active Asset")).toHaveLength(0);
  });
});
