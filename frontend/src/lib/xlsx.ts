// XLSX counterpart to lib/csv.ts's parseAssetImportCsv -- same fixed column
// order (S/N, P/N, description) and header-skip/P/N-grouping rule, just
// reading an .xlsx workbook's first sheet instead of CSV text. See
// lib/csv.ts's groupImportRowsByPartNumber for the actual grouping logic,
// which both formats share.
import { readSheet } from "read-excel-file/browser";
import { groupImportRowsByPartNumber, type CsvImportResult } from "./csv";

/**
 * Reads the first sheet of an .xlsx file and groups its rows by P/N. Cell
 * values come back typed (string/number/boolean/Date) from the sheet rather
 * than as raw text like CSV -- groupImportRowsByPartNumber normalizes those
 * the same way regardless of source.
 */
export async function parseAssetImportXlsx(file: File): Promise<CsvImportResult> {
  const allRows = await readSheet(file);
  const dataRows = allRows.slice(1); // drop header row
  return groupImportRowsByPartNumber(dataRows);
}
