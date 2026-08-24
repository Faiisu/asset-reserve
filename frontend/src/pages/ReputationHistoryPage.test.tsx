import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../api";
import { ReputationHistoryPage } from "./ReputationHistoryPage";

vi.mock("../auth", () => ({
  useAuth: () => ({
    isGlobalAdmin: true,
    hasPermission: () => true,
    hasGlobalPermission: () => true,
  }),
}));

const mockSummary = {
  userId: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  score: 65,
  updatedAt: "2026-08-24T00:00:00.000Z",
};

const mockEvent = {
  id: "event-1",
  userId: "user-1",
  type: "RETURN_LATE" as const,
  delta: -5,
  note: null,
  reservationId: "res-1",
  returnId: "ret-1",
  createdAt: "2026-08-24T10:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/reputation/user-1"]}>
      <Routes>
        <Route
          path="/admin/reputation/:userId"
          element={<ReputationHistoryPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReputationHistoryPage", () => {
  it("renders the user's score and event history", async () => {
    vi.spyOn(api, "reputationUser").mockResolvedValue(mockSummary);
    vi.spyOn(api, "reputationUserEvents").mockResolvedValue({
      data: [mockEvent],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    renderPage();

    expect(await screen.findByText("65")).toBeInTheDocument();
    expect(screen.getByText("Returned late")).toBeInTheDocument();
    expect(screen.getByText("-5")).toBeInTheDocument();
    expect(api.reputationUser).toHaveBeenCalledWith("user-1");
  });

  it("shows an empty message when there is no history yet", async () => {
    vi.spyOn(api, "reputationUser").mockResolvedValue({
      ...mockSummary,
      score: 100,
    });
    vi.spyOn(api, "reputationUserEvents").mockResolvedValue({
      data: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });

    renderPage();

    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText(/No reputation events yet/i)).toBeInTheDocument();
  });
});
