import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatisticPage } from "./StatisticPage";
import type { ReservationsByAssetResponse } from "../types";

const reservationsByAsset = vi.fn();
const hasPermission = vi.fn();

// Partial mock: ui.tsx imports ApiClientError from this module for its
// ErrorState, so the real exports have to come through.
vi.mock(import("../api"), async (importOriginal) => ({
  ...(await importOriginal()),
  api: {
    reservationsByAsset: (...args: unknown[]) => reservationsByAsset(...args),
  } as never,
}));

vi.mock("../auth", () => ({
  useAuth: () => ({ hasPermission: (key: string) => hasPermission(key) }),
}));

function response(
  period: ReservationsByAssetResponse["period"],
  counts: number[],
): ReservationsByAssetResponse {
  return {
    period,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    data: counts.map((reservedCount, index) => ({
      assetId: `asset-${index}`,
      name: `Asset ${index}`,
      partNumber: `PN-${index}`,
      managementArea: { id: "area-1", name: "Studio A" },
      reservedCount,
    })),
  };
}

describe("StatisticPage", () => {
  beforeEach(() => {
    reservationsByAsset.mockReset();
    hasPermission.mockReset();
    hasPermission.mockReturnValue(true);
  });

  it("blocks the page without asset:view and never calls the API", async () => {
    hasPermission.mockReturnValue(false);
    render(<StatisticPage />);

    expect(await screen.findByText("You cannot view statistics")).toBeTruthy();
    expect(reservationsByAsset).not.toHaveBeenCalled();
  });

  it("requests the month period by default and renders the resolved window", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [3, 1]));
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(reservationsByAsset.mock.calls[0]![0]).toBe("month");
    // 3 + 1 booked in the window.
    expect(await screen.findByText("4")).toBeTruthy();
  });

  it("refetches from the server when the period changes", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [2]));
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    reservationsByAsset.mockResolvedValue(response("year", [9]));
    fireEvent.click(screen.getByRole("tab", { name: "Year" }));

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(2));
    expect(reservationsByAsset.mock.calls[1]![0]).toBe("year");
  });

  it("keeps the period switch usable when a period returns nothing", async () => {
    // "day" legitimately returns zero rows; the control that gets the reader
    // back to a period with data must survive the empty state.
    reservationsByAsset.mockResolvedValue(response("day", []));
    render(<StatisticPage />);

    expect(await screen.findByText("No assets yet")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Month" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Day" })).toBeTruthy();
  });

  it("separates 'no assets at all' from 'assets exist but none booked'", async () => {
    // Every asset at zero is the normal shape of a quiet day, and must not
    // read as "there is no data here" -- it should point at a wider period.
    reservationsByAsset.mockResolvedValue(response("day", [0, 0, 0]));
    render(<StatisticPage />);

    expect(
      await screen.findByText("No reservations in this period"),
    ).toBeTruthy();
    // The idle assets stay reachable rather than being silently dropped.
    expect(
      screen.getByRole("button", { name: /List all 3 assets/ }),
    ).toBeTruthy();
  });

  it("hides zero-count assets from the ranking but keeps them one click away", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [4, 0, 0]));
    render(<StatisticPage />);

    // Only the booked asset is ranked; the two idle ones are folded away.
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Show 2 assets with no reservations/,
      }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("keeps the period switch usable when the request fails", async () => {
    reservationsByAsset.mockRejectedValue(new Error("boom"));
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(screen.getByRole("tab", { name: "Week" })).toBeTruthy();
  });

  it("exposes every value in a table view, including long part numbers", async () => {
    const data = response("month", [5]);
    data.data[0]!.partNumber = "VERY-LONG-PART-NUMBER-THAT-WOULD-CLIP-ON-AXIS";
    reservationsByAsset.mockResolvedValue(data);
    render(<StatisticPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Table$/ }));

    // Untruncated in the table cell -- the ranked view may ellipsize it, but
    // the full value always stays reachable here.
    const cell = screen
      .getAllByText("VERY-LONG-PART-NUMBER-THAT-WOULD-CLIP-ON-AXIS")
      .find((node) => node.tagName === "TD");
    expect(cell).toBeTruthy();
    expect(screen.getByText("Studio A")).toBeTruthy();
  });
});
