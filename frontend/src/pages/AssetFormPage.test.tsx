import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import { AssetFormPage } from "./AssetFormPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    session: {
      user: { id: "user-1", email: "test@example.com", profile: null },
      roles: [],
      effectivePermissions: {
        global: ["asset:create", "asset:update"],
        byManagementArea: [],
      },
    },
    hasPermission: () => true,
    hasGlobalPermission: () => true,
    isGlobalAdmin: true,
  }),
}));

const mockArea = {
  id: "area-1",
  name: "Main Stage",
  description: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("AssetFormPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [mockArea],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it("renders new asset form and submits single asset creation", async () => {
    vi.spyOn(api, "createAsset").mockResolvedValue({
      id: "new-asset-1",
      name: "New Camera",
    } as any);

    render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
          <Route path="/assets/:id" element={<div>Asset Detail Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const nameInput = await screen.findByLabelText(/Asset name/i);
    expect(nameInput).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "New Camera" } });

    const submitBtn = screen.getByRole("button", { name: /Add asset/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Camera",
          managementAreaId: "area-1",
        }),
      );
    });

    expect(await screen.findByText("Asset Detail Page")).toBeInTheDocument();
  });

  it("selects own management area and fills description", async () => {
    render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const areaSelect = await screen.findByLabelText(/Management area/i);
    expect(areaSelect).toBeInTheDocument();

    const descInput = screen.getByLabelText(/Description/i);
    fireEvent.change(descInput, { target: { value: "High precision gear" } });
    expect((descInput as HTMLTextAreaElement).value).toBe("High precision gear");
  });

  it("switches to batch mode and submits multiple assets", async () => {
    vi.spyOn(api, "createAssets").mockResolvedValue({
      data: [{ id: "asset-1" }, { id: "asset-2" }],
    } as any);

    render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
          <Route path="/assets/:id" element={<div>Asset Detail Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const batchTab = await screen.findByRole("tab", { name: /Multiple assets/i });
    fireEvent.click(batchTab);

    const nameInputs = screen.getAllByLabelText(/Name/i);
    fireEvent.change(nameInputs[0], { target: { value: "Asset Alpha" } });
    fireEvent.change(nameInputs[1], { target: { value: "Asset Beta" } });

    const submitBtn = screen.getByRole("button", { name: /Add 2 assets/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createAssets).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "Asset Alpha", managementAreaId: "area-1" }),
          expect.objectContaining({ name: "Asset Beta", managementAreaId: "area-1" }),
        ]),
        undefined,
      );
    });

    expect(await screen.findByText("Asset Detail Page")).toBeInTheDocument();
  });

  it("caps a CSV import at 100 assets, the backend batch limit", async () => {
    const header = "S/N,P/N,Description";
    const dataRows = Array.from(
      { length: 150 },
      (_, i) => `SN-${i},PN-${i},Widget ${i}`,
    );
    const csv = new File([[header, ...dataRows].join("\n")], "manifest.csv", {
      type: "text/csv",
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const batchTab = await screen.findByRole("tab", { name: /Multiple assets/i });
    fireEvent.click(batchTab);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [csv] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText(/Imported 100 asset\(s\) from CSV/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Only the first 100 assets were imported/i)).toBeInTheDocument();
    expect(screen.getByText(/50 left out/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Add 100 assets/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it("blocks submit when an imported P/N is too long to use as the asset name", async () => {
    const longPartNumber = "PN-" + "X".repeat(60); // > 40-char name limit, still < 100-char P/N limit
    const csv = new File(
      [`S/N,P/N,Description\nSN-1,${longPartNumber},Widget`],
      "manifest.csv",
      { type: "text/csv" },
    );
    const createAssets = vi.spyOn(api, "createAssets");

    const { container } = render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const batchTab = await screen.findByRole("tab", { name: /Multiple assets/i });
    fireEvent.click(batchTab);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [csv] });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText(/Imported 1 asset\(s\) from CSV/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Add 1 asset/i }));

    expect(
      await screen.findByText(/Row 1's asset name is longer than 40 characters/i),
    ).toBeInTheDocument();
    expect(createAssets).not.toHaveBeenCalled();
  });

  it("opens camera capture modal when Take photo button is clicked", async () => {
    render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByLabelText(/Asset name/i);
    const takePhotoBtn = screen.getByText("Take photo");
    expect(takePhotoBtn).toBeInTheDocument();

    fireEvent.click(takePhotoBtn);
    expect(screen.getByText("Take asset photo")).toBeInTheDocument();
  });
});
