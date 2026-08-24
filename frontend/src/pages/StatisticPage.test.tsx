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
  periodStart: string,
  periodEnd: string,
  counts: Array<[approved: number, rejected: number]>,
): ReservationsByAssetResponse {
  return {
    periodStart,
    periodEnd,
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
    // A fixed clock for the whole suite so the default 30-day range is
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

  it("requests the trailing 30 days by default", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [3, 1],
        [1, 0],
      ]),
    );
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    // "Today" (2026-08-24) minus 29 days, through today.
    expect(reservationsByAsset).toHaveBeenCalledWith(
      "2026-07-26",
      "2026-08-24",
      expect.anything(),
    );
    // Approved: 3 + 1 = 4. Rejected: 1 + 0 = 1. Kept in separate KPI tiles,
    // scoped to the KPI value element since a bar can carry the same digit.
    expect(
      await screen.findByText("4", { selector: ".stat-kpi__value" }),
    ).toBeTruthy();
    expect(
      screen.getByText("1", { selector: ".stat-kpi__value" }),
    ).toBeTruthy();
  });

  it("shows the most-requested asset as a badge, not an approval rate", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", [
        [3, 1],
        [1, 0],
      ]),
    );
    render(<StatisticPage />);

    expect(screen.queryByText("Approval rate")).toBeNull();
    expect(await screen.findByText("Most requested")).toBeTruthy();
    // Asset 0 leads with 3 approved + 1 rejected = 4, the highest total.
    // Scoped to the badge -- the same P/N also appears in the ranked row.
    expect(
      screen.getByText("PN-0", { selector: ".stat-kpi__badge b" }),
    ).toBeTruthy();
    expect(screen.getByText("4 requests")).toBeTruthy();
  });

  it("refetches from the server when the start date changes", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [2, 0],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    reservationsByAsset.mockResolvedValue(
      response("2026-08-01T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [9, 0],
      ]),
    );
    fireEvent.change(screen.getByLabelText("Report start date"), {
      target: { value: "2026-08-01" },
    });

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(2));
    expect(reservationsByAsset).toHaveBeenLastCalledWith(
      "2026-08-01",
      "2026-08-24",
      expect.anything(),
    );
  });

  it("pulls the end date forward when a later start is picked", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [1, 0],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    // The default end is "today" (2026-08-24); a start after that would
    // otherwise send an invalid start > end range to the server.
    fireEvent.change(screen.getByLabelText("Report start date"), {
      target: { value: "2026-09-01" },
    });

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(2));
    expect(reservationsByAsset).toHaveBeenLastCalledWith(
      "2026-09-01",
      "2026-09-01",
      expect.anything(),
    );
  });

  it("pushes the start date back when an earlier end is picked", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [1, 0],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Report end date"), {
      target: { value: "2026-01-01" },
    });

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(2));
    expect(reservationsByAsset).toHaveBeenLastCalledWith(
      "2026-01-01",
      "2026-01-01",
      expect.anything(),
    );
  });

  it("ignores a cleared date field rather than blanking the report", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [1, 0],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Report start date"), {
      target: { value: "" },
    });

    expect(reservationsByAsset).toHaveBeenCalledTimes(1);
  });

  it("separates 'no assets at all' from 'assets exist but nothing decided'", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [0, 0],
        [0, 0],
        [0, 0],
      ]),
    );
    render(<StatisticPage />);

    expect(
      await screen.findByText("No approvals or rejections in this period"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /List all 3 assets/ }),
    ).toBeTruthy();
  });

  it("hides zero-count assets from the ranking but keeps them one click away", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [4, 0],
        [0, 0],
        [0, 0],
      ]),
    );
    render(<StatisticPage />);

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Show 2 assets with no decisions/ }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("recovers from a failed request without losing the date fields", async () => {
    reservationsByAsset.mockRejectedValue(new Error("boom"));
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(screen.getByLabelText("Report start date")).toBeTruthy();
    expect(screen.getByLabelText("Report end date")).toBeTruthy();
  });

  it("exposes every value in a table view, including long part numbers", async () => {
    const data = response(
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      [[5, 2]],
    );
    data.data[0]!.partNumber = "VERY-LONG-PART-NUMBER-THAT-WOULD-CLIP-ON-AXIS";
    reservationsByAsset.mockResolvedValue(data);
    render(<StatisticPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Table$/ }));

    const cell = screen
      .getAllByText("VERY-LONG-PART-NUMBER-THAT-WOULD-CLIP-ON-AXIS")
      .find((node) => node.tagName === "TD");
    expect(cell).toBeTruthy();
    expect(screen.getByText("Studio A")).toBeTruthy();
  });
});
