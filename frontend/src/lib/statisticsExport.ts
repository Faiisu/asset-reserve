// Excel export for the Statistic page. One sheet per statistic topic -- the
// same three the page's segmented control switches between (Approved /
// Rejected, Utilization, Broken / Lost) -- so a workbook opens with the same
// structure the reader just navigated on screen.
//
// The rows exported are the *filtered* assets the page is currently showing
// (date range, search, management area), in the same order each topic's chart
// ranks them. Unlike the charts, nothing is hidden: an asset with no decision,
// no active unit, or no damage is still a row, sorted below the ranked ones,
// because an export is an archive and a silently dropped row cannot be
// recovered from the file.
import type { AssetReservationCount } from "../types";
import { formatRangeLabel } from "./dateRange";

/** A cell value we actually emit: text, a number, or an empty cell. */
type CellValue = string | number | null;

export type ExportSheet = {
  /** Worksheet tab name. Excel caps these at 31 characters. */
  name: string;
  /** Title shown in A1, above a blank row and the header row. */
  title: string;
  header: string[];
  rows: CellValue[][];
  /** Column widths, in characters, positionally matching `header`. */
  widths: number[];
};

/** Columns every topic starts with -- what the asset is and where it lives. */
const IDENTITY_HEADER = ["Asset", "P/N", "Management area"];
const IDENTITY_WIDTHS = [34, 20, 24];

function identityCells(asset: AssetReservationCount): CellValue[] {
  return [asset.name, asset.partNumber ?? "", asset.managementArea.name];
}

/**
 * Splits assets into the ones a topic ranks and the ones it has nothing to
 * say about, keeping the ranked ones first. Mirrors each chart's "show the
 * rest anyway" toggle, except the export always includes the rest.
 */
function rank(
  assets: AssetReservationCount[],
  isRanked: (asset: AssetReservationCount) => boolean,
  compare: (a: AssetReservationCount, b: AssetReservationCount) => number,
): AssetReservationCount[] {
  const ranked = assets.filter(isRanked).sort(compare);
  const rest = assets.filter((asset) => !isRanked(asset));
  return [...ranked, ...rest];
}

/**
 * Builds one sheet per statistic topic for the given assets and window.
 * Pure: the rendering into an actual .xlsx lives in exportStatisticsWorkbook.
 */
export function buildStatisticsSheets(
  assets: AssetReservationCount[],
  periodStart: string,
  periodEnd: string,
): ExportSheet[] {
  const windowLabel = formatRangeLabel(periodStart, periodEnd);

  // Decisions keep the API's approved+rejected desc order, which is the order
  // AssetReservationChart draws them in.
  const decisions = rank(
    assets,
    (asset) => asset.approvedCount + asset.rejectedCount > 0,
    () => 0,
  );

  const utilization = rank(
    assets,
    (asset) => asset.utilizationPercent !== null,
    (a, b) => b.utilizationPercent! - a.utilizationPercent!,
  );

  const damage = rank(
    assets,
    (asset) => asset.brokenCount + asset.lostCount > 0,
    // Same tie-break as AssetDamageChart: lost outranks broken, then name.
    (a, b) =>
      b.brokenCount + b.lostCount - (a.brokenCount + a.lostCount) ||
      b.lostCount - a.lostCount ||
      a.name.localeCompare(b.name),
  );

  return [
    {
      name: "Approved-Rejected",
      title: `Approved vs. rejected, by asset — ${windowLabel}`,
      header: [...IDENTITY_HEADER, "Approved", "Rejected", "Total decided"],
      widths: [...IDENTITY_WIDTHS, 12, 12, 14],
      rows: decisions.map((asset) => [
        ...identityCells(asset),
        asset.approvedCount,
        asset.rejectedCount,
        asset.approvedCount + asset.rejectedCount,
      ]),
    },
    {
      name: "Utilization",
      title: `Capacity actually used, by asset — ${windowLabel}`,
      header: [...IDENTITY_HEADER, "Active units", "Utilization (%)"],
      widths: [...IDENTITY_WIDTHS, 13, 15],
      rows: utilization.map((asset) => [
        ...identityCells(asset),
        asset.activeUnitCount,
        // Left empty rather than written as a dash: an asset with no active
        // unit has no measurable utilization, and a text placeholder in a
        // number column breaks averaging in Excel.
        asset.utilizationPercent,
      ]),
    },
    {
      name: "Broken-Lost",
      title: `Units not returned in good condition — ${windowLabel}`,
      header: [...IDENTITY_HEADER, "Broken", "Lost", "Total affected"],
      widths: [...IDENTITY_WIDTHS, 12, 12, 15],
      rows: damage.map((asset) => [
        ...identityCells(asset),
        asset.brokenCount,
        asset.lostCount,
        asset.brokenCount + asset.lostCount,
      ]),
    },
  ];
}

/**
 * `statistics_2026-07-27_2026-08-25.xlsx` -- sortable and self-describing.
 * The API echoes its window back as full ISO timestamps, so only the date
 * part is kept: a time carries no meaning for a whole-day window, and its
 * colons are not legal in a filename on Windows.
 */
export function statisticsFileName(
  periodStart: string,
  periodEnd: string,
): string {
  return `statistics_${periodStart.slice(0, 10)}_${periodEnd.slice(0, 10)}.xlsx`;
}

/**
 * Writes the three topic sheets to an .xlsx and hands it to the browser as a
 * download. The writer is imported lazily so its bundle only loads for a
 * reader who actually exports -- it is dead weight on every other visit to
 * the page.
 */
export async function exportStatisticsWorkbook(
  assets: AssetReservationCount[],
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const sheets = buildStatisticsSheets(assets, periodStart, periodEnd);

  await writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      // Title, blank spacer, header: all three stay in view while scrolling.
      stickyRowsCount: 3,
      columns: sheet.widths.map((width) => ({ width })),
      data: [
        [
          {
            value: sheet.title,
            fontWeight: "bold" as const,
            // Spans the table so a long title is not clipped by column B.
            columnSpan: sheet.header.length,
          },
        ],
        [],
        sheet.header.map((label) => ({
          value: label,
          fontWeight: "bold" as const,
          backgroundColor: "#F1F5F9",
        })),
        ...sheet.rows.map((row) =>
          row.map((value) =>
            typeof value === "number"
              ? { value, type: Number, align: "right" as const }
              : { value: value ?? undefined, type: String },
          ),
        ),
      ],
    })),
  ).toFile(statisticsFileName(periodStart, periodEnd));
}
