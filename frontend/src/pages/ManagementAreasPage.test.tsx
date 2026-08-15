import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import { ManagementAreasPage } from "./ManagementAreasPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    isGlobalAdmin: true,
    hasPermission: () => true,
    hasGlobalPermission: () => true,
  }),
}));

const mockArea = {
  id: "area-1",
  name: "Main Stage",
  description: "Primary auditorium and stage",
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

describe("ManagementAreasPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "areas").mockResolvedValue({
      data: [mockArea],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it("renders management areas list and opens create dialog", async () => {
    vi.spyOn(api, "createArea").mockResolvedValue({
      id: "area-2",
      name: "Podcast Studio",
      description: "Audio recording booth",
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    });

    render(
      <MemoryRouter>
        <ManagementAreasPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Main Stage")).toBeInTheDocument();
    expect(screen.getByText("Primary auditorium and stage")).toBeInTheDocument();

    const newBtn = screen.getByRole("button", {
      name: /Create management area/i,
    });
    fireEvent.click(newBtn);

    const nameInput = screen.getByLabelText(/Area name/i);
    fireEvent.change(nameInput, { target: { value: "Podcast Studio" } });

    const createBtn = screen.getAllByRole("button", {
      name: /Create management area/i,
    })[1];
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(api.createArea).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Podcast Studio" }),
      );
    });
  });
});
