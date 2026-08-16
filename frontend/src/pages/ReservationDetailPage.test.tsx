import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReservationDetailPage } from "./ReservationDetailPage";

describe("ReservationDetailPage", () => {
  it("renders a blank reservation detail page ready for redesign", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/reservations/00000000-0000-4000-8000-000000000101"]}>
        <Routes>
          <Route
            path="/reservations/:reservationId"
            element={<ReservationDetailPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector(".reservation-detail-page--blank")).toBeInTheDocument();
  });
});
