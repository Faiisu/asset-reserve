import { describe, expect, it } from "vitest";
import {
  buildStatisticsSheets,
  statisticsFileName,
} from "./statisticsExport";
import type { AssetReservationCount } from "../types";

function asset(
  overrides: Partial<AssetReservationCount> & { name: string },
): AssetReservationCount {
  return {
    assetId: overrides.name,
    partNumber: `PN-${overrides.name}`,
    managementArea: { id: "area-1", name: "Studio A" },
    approvedCount: 0,
    rejectedCount: 0,
    activeUnitCount: 1,
    utilizationPercent: 0,
    brokenCount: 0,
    lostCount: 0,
    ...overrides,
  };
}

describe("buildStatisticsSheets", () => {
  it("emits one sheet per statistic topic", () => {
    const sheets = buildStatisticsSheets([], "2026-08-01", "2026-08-31");
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Approved-Rejected",
      "Utilization",
      "Broken-Lost",
    ]);
    // Excel rejects tab names longer than 31 characters.
    for (const sheet of sheets) expect(sheet.name.length).toBeLessThanOrEqual(31);
  });

  it("keeps the API's order for decisions and totals each row", () => {
    const sheets = buildStatisticsSheets(
      [
        asset({ name: "Camera", approvedCount: 5, rejectedCount: 2 }),
        asset({ name: "Tripod", approvedCount: 1, rejectedCount: 0 }),
      ],
      "2026-08-01",
      "2026-08-31",
    );

    const decisions = sheets[0];
    expect(decisions.header).toEqual([
      "Asset",
      "P/N",
      "Management area",
      "Approved",
      "Rejected",
      "Total decided",
    ]);
    expect(decisions.rows).toEqual([
      ["Camera", "PN-Camera", "Studio A", 5, 2, 7],
      ["Tripod", "PN-Tripod", "Studio A", 1, 0, 1],
    ]);
  });

  it("ranks utilization descending and leaves unmeasurable assets empty, last", () => {
    const sheets = buildStatisticsSheets(
      [
        asset({ name: "Idle", utilizationPercent: null, activeUnitCount: 0 }),
        asset({ name: "Low", utilizationPercent: 12.5 }),
        asset({ name: "High", utilizationPercent: 88 }),
      ],
      "2026-08-01",
      "2026-08-31",
    );

    expect(sheets[1].rows).toEqual([
      ["High", "PN-High", "Studio A", 1, 88],
      ["Low", "PN-Low", "Studio A", 1, 12.5],
      ["Idle", "PN-Idle", "Studio A", 0, null],
    ]);
  });

  it("ranks damage by broken+lost, breaking ties on lost", () => {
    const sheets = buildStatisticsSheets(
      [
        asset({ name: "Clean" }),
        asset({ name: "Broken two", brokenCount: 2 }),
        asset({ name: "Lost two", lostCount: 2 }),
        asset({ name: "Worst", brokenCount: 2, lostCount: 1 }),
      ],
      "2026-08-01",
      "2026-08-31",
    );

    expect(sheets[2].rows.map((row) => row[0])).toEqual([
      "Worst",
      "Lost two",
      "Broken two",
      "Clean",
    ]);
    expect(sheets[2].rows[0]).toEqual([
      "Worst",
      "PN-Worst",
      "Studio A",
      2,
      1,
      3,
    ]);
  });

  it("writes an empty P/N cell rather than dropping the column", () => {
    const sheets = buildStatisticsSheets(
      [asset({ name: "No P/N", partNumber: null, approvedCount: 1 })],
      "2026-08-01",
      "2026-08-31",
    );
    expect(sheets[0].rows[0][1]).toBe("");
  });

  it("names the file after the window the server resolved", () => {
    expect(statisticsFileName("2026-07-27", "2026-08-25")).toBe(
      "statistics_2026-07-27_2026-08-25.xlsx",
    );
  });
});
