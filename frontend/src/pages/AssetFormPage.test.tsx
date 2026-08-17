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
    fireEvent.change(screen.getByLabelText(/quantity/i), {
      target: { value: "3" },
    });

    const submitBtn = screen.getByRole("button", { name: /Add asset/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Camera",
          managementAreaId: "area-1",
          totalQuantity: 3,
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

  it("enforces 40 character limit on asset name input", async () => {
    render(
      <MemoryRouter initialEntries={["/assets/new"]}>
        <Routes>
          <Route path="/assets/new" element={<AssetFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const nameInput = (await screen.findByLabelText(/Asset name/i)) as HTMLInputElement;
    expect(nameInput.maxLength).toBe(40);
  });
});
