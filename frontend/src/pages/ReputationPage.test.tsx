import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import { ReputationHistoryPage } from "./ReputationHistoryPage";
import { ReputationPage } from "./ReputationPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    isGlobalAdmin: true,
    hasPermission: () => true,
    hasGlobalPermission: () => true,
  }),
}));

const mockUser = {
  userId: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  score: 85,
  updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("ReputationPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "reputationUsers").mockResolvedValue({
      data: [mockUser],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it("renders the user list with scores", async () => {
    render(
      <MemoryRouter>
        <ReputationPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("searches by the entered term", async () => {
    render(
      <MemoryRouter>
        <ReputationPage />
      </MemoryRouter>,
    );
    await screen.findByText("Jane Doe");

    fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
      target: { value: "jane" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(() => {
      expect(api.reputationUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: "jane" }),
        expect.anything(),
      );
    });
  });

  it("navigates to the user's history on row click", async () => {
    vi.spyOn(api, "reputationUser").mockResolvedValue(mockUser);
    vi.spyOn(api, "reputationUserEvents").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    render(
      <MemoryRouter initialEntries={["/admin/reputation"]}>
        <Routes>
          <Route path="/admin/reputation" element={<ReputationPage />} />
          <Route
            path="/admin/reputation/:userId"
            element={<ReputationHistoryPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("Jane Doe"));

    await waitFor(() => {
      expect(api.reputationUser).toHaveBeenCalledWith("user-1");
    });
  });
});
