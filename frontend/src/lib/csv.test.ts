import { parseAssetImportCsv } from "./csv";

describe("parseAssetImportCsv", () => {
  it("groups rows by P/N, collecting every S/N into one asset", () => {
    const csv = [
      "S/N,P/N,Description",
      "SN-001,EPS-PRJ-100,Epson projector",
      "SN-002,EPS-PRJ-100,Epson projector",
      "SN-100,SONY-FX3,Sony cinema camera",
    ].join("\n");

    const { rows, skippedRows } = parseAssetImportCsv(csv);

    expect(skippedRows).toBe(0);
    expect(rows).toEqual([
      {
        name: "EPS-PRJ-100",
        partNumber: "EPS-PRJ-100",
        description: "Epson projector",
        serialNumbers: "SN-001\nSN-002",
      },
      {
        name: "SONY-FX3",
        partNumber: "SONY-FX3",
        description: "Sony cinema camera",
        serialNumbers: "SN-100",
      },
    ]);
  });

  it("skips the header row even when data starts on line 1 of a group", () => {
    const csv = "S/N,P/N,Description\nSN-1,PN-1,First widget";
    const { rows } = parseAssetImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("PN-1");
  });

  it("skips rows with no P/N and reports the count", () => {
    const csv = [
      "S/N,P/N,Description",
      "SN-1,,Missing part number",
      "SN-2,PN-2,Has a part number",
    ].join("\n");

    const { rows, skippedRows } = parseAssetImportCsv(csv);
    expect(skippedRows).toBe(1);
    expect(rows).toEqual([
      { name: "PN-2", partNumber: "PN-2", description: "Has a part number", serialNumbers: "SN-2" },
    ]);
  });

  it("keeps the first non-empty description seen for a P/N", () => {
    const csv = [
      "S/N,P/N,Description",
      "SN-1,PN-1,",
      "SN-2,PN-1,Real description",
      "SN-3,PN-1,Different description",
    ].join("\n");

    const { rows } = parseAssetImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Real description");
    expect(rows[0].serialNumbers).toBe("SN-1\nSN-2\nSN-3");
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'S/N,P/N,Description\nSN-1,PN-1,"Includes cable, mount, and case"';
    const { rows } = parseAssetImportCsv(csv);
    expect(rows[0].description).toBe("Includes cable, mount, and case");
  });

  it("returns nothing for an empty or header-only file", () => {
    expect(parseAssetImportCsv("").rows).toEqual([]);
    expect(parseAssetImportCsv("S/N,P/N,Description").rows).toEqual([]);
  });
});
