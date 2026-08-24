import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  counts: Array<[approved: number, rejected: number]>,
): ReservationsByAssetResponse {
  return {
    period,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-09-01T00:00:00.000Z",
    data: counts.map(([approvedCount, rejectedCount], index) => ({
      assetId: `asset-${index}`,
      name: `Asset ${index}`,
      partNumber: `PN-${index}`,
      managementArea: { id: "area-1", name: "Studio A" },
      approvedCount,
      rejectedCount,
    })),
  };
}

describe("StatisticPage", () => {
  beforeEach(() => {
    // A fixed clock for the whole suite so the default anchor ("today") is
    // deterministic. shouldAdvanceTime keeps promises and waitFor working;
    // without it the fake clock stalls every async assertion.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    reservationsByAsset.mockReset();
    hasPermission.mockReset();
    hasPermission.mockReturnValue(true);
  });

  afterEach(() => {
    // Restored here rather than at the end of each test: a test that fails
    // mid-way would otherwise leak the fake clock into every later one.
    vi.useRealTimers();
  });

  it("blocks the page without asset:view and never calls the API", async () => {
    hasPermission.mockReturnValue(false);
    render(<StatisticPage />);

    expect(await screen.findByText("You cannot view statistics")).toBeTruthy();
    expect(reservationsByAsset).not.toHaveBeenCalled();
  });

  it("requests the month period by default and totals approved/rejected separately", async () => {
    reservationsByAsset.mockResolvedValue(
      response("month", [
        [3, 1],
        [1, 0],
      ]),
    );
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(reservationsByAsset.mock.calls[0]![0]).toBe("month");
    // Approved: 3 + 1 = 4. Rejected: 1 + 0 = 1. Kept in separate KPI tiles,
    // never summed into one "reservations" figure -- scoped to the KPI
    // value element since a bar can carry the same digit as a row count.
    expect(
      await screen.findByText("4", { selector: ".stat-kpi__value" }),
    ).toBeTruthy();
    expect(
      screen.getByText("1", { selector: ".stat-kpi__value" }),
    ).toBeTruthy();
    // 4 approved of 5 decisions = 80%.
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("refetches from the server when the period changes", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [[2, 0]]));
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    reservationsByAsset.mockResolvedValue(response("year", [[9, 0]]));
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

  it("separates 'no assets at all' from 'assets exist but nothing decided'", async () => {
    // Every asset at zero is the normal shape of a quiet day, and must not
    // read as "there is no data here" -- it should point at a wider period.
    reservationsByAsset.mockResolvedValue(
      response("day", [
        [0, 0],
        [0, 0],
        [0, 0],
      ]),
    );
    render(<StatisticPage />);

    expect(
      await screen.findByText("No approvals or rejections in this period"),
    ).toBeTruthy();
    // The idle assets stay reachable rather than being silently dropped.
    expect(
      screen.getByRole("button", { name: /List all 3 assets/ }),
    ).toBeTruthy();
  });

  it("hides zero-count assets from the ranking but keeps them one click away", async () => {
    reservationsByAsset.mockResolvedValue(
      response("month", [
        [4, 0],
        [0, 0],
        [0, 0],
      ]),
    );
    render(<StatisticPage />);

    // Only the decided asset is ranked; the two idle ones are folded away.
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Show 2 assets with no decisions/,
      }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("anchors the first request to today", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [[1, 0]]));
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(reservationsByAsset.mock.calls[0]![1]).toBe("2026-08-24");
  });

  it("steps the anchor back a whole period and refetches", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [[1, 0]]));
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(2));
    expect(reservationsByAsset.mock.calls[1]![1]).toBe("2026-07-01");
  });

  it("offers a way back only once the reader has navigated away", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [[1, 0]]));
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());

    expect(screen.queryByRole("button", { name: /Back to/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    const back = await screen.findByRole("button", {
      name: /Back to this month/,
    });

    fireEvent.click(back);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Back to/ })).toBeNull(),
    );
  });

  it("sends a whole anchor date when a month is picked from the calendar", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [[1, 0]]));
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());

    const field = screen.getByLabelText(/Choose the month/);
    // A native month picker reports "YYYY-MM"; the API needs a full date.
    fireEvent.change(field, { target: { value: "2025-03" } });

    await waitFor(() =>
      expect(reservationsByAsset).toHaveBeenLastCalledWith(
        "month",
        "2025-03-01",
        expect.anything(),
      ),
    );
  });

  it("ignores the half-typed values a native picker emits mid-edit", async () => {
    reservationsByAsset.mockResolvedValue(response("month", [[1, 0]]));
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/Choose the month/), {
      target: { value: "" },
    });

    // A cleared field must not refetch, and must not blank the report.
    expect(reservationsByAsset).toHaveBeenCalledTimes(1);
  });

  it("keeps the period switch usable when the request fails", async () => {
    reservationsByAsset.mockRejectedValue(new Error("boom"));
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(screen.getByRole("tab", { name: "Week" })).toBeTruthy();
  });

  it("exposes every value in a table view, including long part numbers", async () => {
    const data = response("month", [[5, 2]]);
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
