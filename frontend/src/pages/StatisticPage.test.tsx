import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  counts: Array<
    [
      approved: number,
      rejected: number,
      activeUnitCount?: number,
      utilizationPercent?: number | null,
      brokenCount?: number,
      lostCount?: number,
    ]
  >,
): ReservationsByAssetResponse {
  return {
    periodStart,
    periodEnd,
    data: counts.map(
      (
        [
          approvedCount,
          rejectedCount,
          activeUnitCount = 1,
          utilizationPercent = 0,
          brokenCount = 0,
          lostCount = 0,
        ],
        index,
      ) => ({
        assetId: `asset-${index}`,
        name: `Asset ${index}`,
        partNumber: `PN-${index}`,
        managementArea: { id: "area-1", name: "Studio A" },
        approvedCount,
        rejectedCount,
        activeUnitCount,
        utilizationPercent,
        brokenCount,
        lostCount,
      }),
    ),
  };
}

/** Both chart sections render an <ol> and a "list all/show N" toggle button
 * with overlapping text, so tests that need one or the other scope to its
 * landmark region rather than querying the whole page. */
function approvedRegion() {
  return screen.getByRole("region", { name: "Approved and rejected by asset" });
}
function utilizationRegion() {
  return screen.getByRole("region", { name: "Utilization by asset" });
}
function damageRegion() {
  return screen.getByRole("region", { name: "Broken and lost by asset" });
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

  it("shows only the Approved/Rejected section until the Utilization tab is picked", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [1, 0],
      ]),
    );
    render(<StatisticPage />);

    await waitFor(() => expect(approvedRegion()).toBeTruthy());
    expect(
      screen.queryByRole("region", { name: "Utilization by asset" }),
    ).toBeNull();
    expect(
      screen.getByRole("tab", { name: "Approved / Rejected" }),
    ).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));

    expect(
      screen.queryByRole("region", { name: "Approved and rejected by asset" }),
    ).toBeNull();
    expect(utilizationRegion()).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Utilization" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps the Chart/Table choice when switching statistic type", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [1, 0, 1, 50],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(approvedRegion()).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Table$/ }));
    expect(within(approvedRegion()).getByRole("table")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));

    expect(within(utilizationRegion()).getByRole("table")).toBeTruthy();
  });

  it("keeps idle assets hidden in table view until the same toggle is used", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [4, 0],
        [0, 0],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(approvedRegion()).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Table$/ }));

    // The idle asset (Asset 1) must not silently reappear just because the
    // view switched to a table -- same rows, same toggle, in both modes.
    expect(within(approvedRegion()).getAllByRole("row")).toHaveLength(2); // header + the one decided asset
    expect(within(approvedRegion()).queryByText("Asset 1")).toBeNull();

    fireEvent.click(
      within(approvedRegion()).getByRole("button", {
        name: /Show 1 assets? with no decisions/,
      }),
    );

    expect(within(approvedRegion()).getAllByRole("row")).toHaveLength(3);
    expect(within(approvedRegion()).getByText("Asset 1")).toBeTruthy();
  });

  it("keeps the utilization table sorted by utilization, not the API's approved/rejected order", async () => {
    reservationsByAsset.mockResolvedValue(
      // Asset 0 leads approved/rejected (the order the API returns), but
      // Asset 1 has the higher utilization.
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [5, 0, 1, 20],
        [1, 0, 1, 90],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Table$/ }));

    const rows = within(utilizationRegion()).getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain("Asset 1");
    expect(rows[1]!.textContent).toContain("Asset 0");
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
      await screen.findByText("No approvals or rejections in this range"),
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
      expect(within(approvedRegion()).getAllByRole("listitem")).toHaveLength(1),
    );

    fireEvent.click(
      within(approvedRegion()).getByRole("button", {
        name: /Show 2 assets with no decisions/,
      }),
    );
    expect(within(approvedRegion()).getAllByRole("listitem")).toHaveLength(3);
  });

  it("ranks assets by utilization percent, not by approved/rejected order", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [5, 0, 1, 20],
        [1, 0, 1, 90],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));

    // Asset 0 leads approved/rejected but Asset 1 has the higher
    // utilization, so the two sections must not share one sort order.
    await waitFor(() => {
      const rows = within(utilizationRegion()).getAllByRole("listitem");
      expect(rows[0]!.textContent).toContain("Asset 1");
      expect(rows[1]!.textContent).toContain("Asset 0");
    });
  });

  it("folds assets with no active units behind their own toggle", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [0, 0, 1, 40],
        [0, 0, 0, null],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));

    await waitFor(() =>
      expect(within(utilizationRegion()).getAllByRole("listitem")).toHaveLength(
        1,
      ),
    );

    fireEvent.click(
      within(utilizationRegion()).getByRole("button", {
        name: /Show 1 assets? with no active units/,
      }),
    );
    expect(within(utilizationRegion()).getAllByRole("listitem")).toHaveLength(
      2,
    );
  });

  it("shows the average, most-, and least-utilized assets in the Utilization tab's KPIs", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-07-26T00:00:00.000Z", "2026-08-25T00:00:00.000Z", [
        [0, 0, 1, 20],
        [0, 0, 1, 40],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Utilization" }));

    expect(screen.queryByText("Approved")).toBeNull();
    expect(await screen.findByText("Avg utilization")).toBeTruthy();
    expect(
      screen.getByText("30%", { selector: ".stat-kpi__value" }),
    ).toBeTruthy();
    expect(screen.getByText("Most utilized")).toBeTruthy();
    expect(screen.getByText("Least utilized")).toBeTruthy();
    // Asset 1 (40%) is the most utilized, Asset 0 (20%) the least -- scoped
    // to the KPI badges since the same P/N also appears in the ranked rows.
    const badges = screen.getAllByText(/^PN-/, {
      selector: ".stat-kpi__badge b",
    });
    expect(badges.map((node) => node.textContent)).toEqual(["PN-1", "PN-0"]);
  });

  it("totals broken and lost separately and names the worst-hit part number", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", [
        // [approved, rejected, units, util, broken, lost]
        [9, 0, 1, 10, 1, 0],
        [1, 0, 1, 10, 2, 3],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Broken / Lost" }));

    expect(screen.queryByText("Avg utilization")).toBeNull();
    // Broken: 1 + 2 = 3. Lost: 0 + 3 = 3.
    expect(
      await screen.findByText("3", {
        selector: ".stat-kpi--broken .stat-kpi__value",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("3", { selector: ".stat-kpi--lost .stat-kpi__value" }),
    ).toBeTruthy();
    // Asset 1 is down 5 units vs Asset 0's 1, even though Asset 0 has far
    // more approvals -- damage ranking must not inherit the API's order.
    expect(
      screen.getByText("PN-1", { selector: ".stat-kpi__badge b" }),
    ).toBeTruthy();
    expect(screen.getByText("5 units")).toBeTruthy();
  });

  it("hides undamaged assets behind a toggle and ranks the damaged ones first", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", [
        [5, 0, 1, 10, 0, 0],
        [1, 0, 1, 10, 0, 2],
        [1, 0, 1, 10, 1, 0],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Broken / Lost" }));

    const region = await screen.findByRole("region", {
      name: "Broken and lost by asset",
    });
    const names = () =>
      Array.from(region.querySelectorAll(".stat-bars__name")).map(
        (node) => node.textContent,
      );
    // Only the two damaged assets, worst first (Asset 1 lost 2, Asset 2
    // broke 1) -- the clean Asset 0 stays out of the way.
    expect(names()).toEqual(["Asset 1", "Asset 2"]);

    fireEvent.click(
      within(region).getByRole("button", {
        name: "Show 1 assets with nothing broken or lost",
      }),
    );
    expect(names()).toEqual(["Asset 1", "Asset 2", "Asset 0"]);
  });

  it("says nothing was broken or lost when the window is clean", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", [
        [4, 1],
      ]),
    );
    render(<StatisticPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Broken / Lost" }));

    expect(
      await within(damageRegion()).findByText(
        "Nothing broken or lost in this range",
      ),
    ).toBeTruthy();
  });

  it("filters the ranked rows by name, part number, or management area", async () => {
    const data = response(
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      [
        [5, 0],
        [3, 0],
        [1, 0],
      ],
    );
    data.data[0]!.name = "Camera body";
    data.data[0]!.partNumber = "CAM-1";
    data.data[1]!.name = "Tripod";
    data.data[1]!.partNumber = "TRI-9";
    data.data[2]!.name = "Lens";
    data.data[2]!.partNumber = "LEN-4";
    data.data[2]!.managementArea = { id: "area-2", name: "Warehouse" };
    reservationsByAsset.mockResolvedValue(data);
    render(<StatisticPage />);
    await waitFor(() => expect(approvedRegion()).toBeTruthy());

    const names = () =>
      Array.from(approvedRegion().querySelectorAll(".stat-bars__name")).map(
        (node) => node.textContent,
      );
    const box = screen.getByLabelText("Search assets");

    // By name, case-insensitively.
    fireEvent.change(box, { target: { value: "camera" } });
    expect(names()).toEqual(["Camera body"]);

    // By part number -- the ranked row shows it, so it must be searchable.
    fireEvent.change(box, { target: { value: "TRI-9" } });
    expect(names()).toEqual(["Tripod"]);

    // By management area, likewise shown on the row.
    fireEvent.change(box, { target: { value: "warehouse" } });
    expect(names()).toEqual(["Lens"]);

    // No refetch: filtering is local to the already-loaded response.
    expect(reservationsByAsset).toHaveBeenCalledTimes(1);
  });

  it("recomputes the KPI totals over the filtered assets", async () => {
    const data = response(
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      [
        [5, 2],
        [3, 1],
      ],
    );
    data.data[0]!.name = "Camera body";
    data.data[1]!.name = "Tripod";
    reservationsByAsset.mockResolvedValue(data);
    render(<StatisticPage />);

    // Unfiltered: approved 5 + 3 = 8, rejected 2 + 1 = 3.
    expect(
      await screen.findByText("8", {
        selector: ".stat-kpi--approved .stat-kpi__value",
      }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "tripod" },
    });

    // A headline total that still said 8 would contradict the single bar
    // drawn underneath it.
    expect(
      screen.getByText("3", {
        selector: ".stat-kpi--approved .stat-kpi__value",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("1", {
        selector: ".stat-kpi--rejected .stat-kpi__value",
      }),
    ).toBeTruthy();
    expect(screen.getByText("4 requests")).toBeTruthy();
  });

  it("distinguishes an unmatched search from an account with no assets", async () => {
    reservationsByAsset.mockResolvedValue(
      response("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z", [
        [5, 0],
      ]),
    );
    render(<StatisticPage />);
    await waitFor(() => expect(approvedRegion()).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "nothing-matches-this" },
    });

    expect(screen.queryByText("No assets yet")).toBeNull();
    expect(
      screen.getByText('No asset matches "nothing-matches-this"'),
    ).toBeTruthy();

    // Two controls clear the search -- the inline X in the toolbar and this
    // empty-state CTA -- so scope to the one being exercised here.
    fireEvent.click(
      within(approvedRegion()).getByRole("button", { name: "Clear search" }),
    );
    expect(approvedRegion().querySelectorAll(".stat-bars__name")).toHaveLength(
      1,
    );
  });

  it("keeps the search applied when switching statistic type", async () => {
    const data = response(
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      [
        [5, 0, 1, 80, 2, 0],
        [3, 0, 1, 20, 1, 1],
      ],
    );
    data.data[0]!.name = "Camera body";
    data.data[1]!.name = "Tripod";
    reservationsByAsset.mockResolvedValue(data);
    render(<StatisticPage />);
    await waitFor(() => expect(approvedRegion()).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "tripod" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Broken / Lost" }));

    // The filter belongs to the page, not to one chart -- it must survive a
    // segment change rather than silently resetting the reader's context.
    expect(
      Array.from(damageRegion().querySelectorAll(".stat-bars__name")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Tripod"]);
    expect(screen.getByLabelText("Search assets")).toHaveValue("tripod");
  });

  it("recovers from a failed request without losing the date fields", async () => {
    reservationsByAsset.mockRejectedValue(new Error("boom"));
    render(<StatisticPage />);

    await waitFor(() => expect(reservationsByAsset).toHaveBeenCalled());
    expect(screen.getByLabelText("Report start date")).toBeTruthy();
    expect(screen.getByLabelText("Report end date")).toBeTruthy();
  });

  it("keeps every value reachable in table view, including a long part number", async () => {
    const data = response(
      "2026-08-01T00:00:00.000Z",
      "2026-08-31T00:00:00.000Z",
      [[5, 2]],
    );
    data.data[0]!.partNumber = "VERY-LONG-PART-NUMBER-THAT-WOULD-CLIP-ON-AXIS";
    reservationsByAsset.mockResolvedValue(data);
    render(<StatisticPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Table$/ }));

    // P/N and management area share one "meta" line under the asset name --
    // both must be present in full, not clipped.
    const meta = screen.getByText(
      (content) =>
        content.includes("VERY-LONG-PART-NUMBER-THAT-WOULD-CLIP-ON-AXIS") &&
        content.includes("Studio A"),
    );
    expect(meta.tagName).toBe("SMALL");
  });
});
