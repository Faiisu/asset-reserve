// Minimal CSV parsing for the batch-asset-import POC (Add asset > Multiple
// assets > Import CSV). Handles quoted fields (commas/newlines inside
// quotes, "" as an escaped quote) since part numbers/descriptions can
// reasonably contain commas -- a naive line.split(",") would silently
// misalign columns on those rows.

/** Splits one logical CSV row into its raw string fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/** Splits raw CSV text into logical rows, respecting quoted newlines. */
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let row = "";
  let inQuotes = false;
  // Normalize CRLF/CR up front so \n-based iteration below is enough.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '"') inQuotes = !inQuotes;
    if (char === "\n" && !inQuotes) {
      rows.push(row);
      row = "";
    } else {
      row += char;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export type ImportedAssetRow = {
  name: string;
  partNumber: string;
  description: string;
  serialNumbers: string;
};

export type CsvImportResult = {
  rows: ImportedAssetRow[];
  /** Data rows that had no P/N and couldn't be grouped into an asset. */
  skippedRows: number;
};

/**
 * Parses a batch-import CSV: fixed column order S/N, P/N, description, one
 * header row (skipped). Rows are grouped by P/N -- each unique P/N becomes
 * one asset row (name = P/N, matching the existing "one asset, many
 * serialized units" data model), with every matching row's S/N collected
 * into that asset's serial-numbers list. The first non-empty description
 * seen for a given P/N wins; rows with no P/N are skipped and counted since
 * there's nothing to group them by.
 */
export function parseAssetImportCsv(text: string): CsvImportResult {
  const allRows = splitCsvRows(text).filter((line) => line.trim().length > 0);
  const dataRows = allRows.slice(1); // drop header row

  const order: string[] = [];
  const groups = new Map<
    string,
    { partNumber: string; description: string; serials: string[] }
  >();
  let skippedRows = 0;

  for (const line of dataRows) {
    const [serialRaw, partNumberRaw, descriptionRaw] = parseCsvLine(line);
    const serial = (serialRaw ?? "").trim();
    const partNumber = (partNumberRaw ?? "").trim();
    const description = (descriptionRaw ?? "").trim();

    if (!partNumber) {
      skippedRows++;
      continue;
    }

    const key = partNumber.toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { partNumber, description, serials: [] };
      groups.set(key, group);
      order.push(key);
    } else if (!group.description && description) {
      group.description = description;
    }
    if (serial) group.serials.push(serial);
  }

  return {
    rows: order.map((key) => {
      const group = groups.get(key)!;
      return {
        name: group.partNumber,
        partNumber: group.partNumber,
        description: group.description,
        serialNumbers: group.serials.join("\n"),
      };
    }),
    skippedRows,
  };
}
