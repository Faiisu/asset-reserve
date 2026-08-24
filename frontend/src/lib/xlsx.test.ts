import { parseAssetImportXlsx } from "./xlsx";

const { readSheetMock } = vi.hoisted(() => ({ readSheetMock: vi.fn() }));
vi.mock("read-excel-file/browser", () => ({ readSheet: readSheetMock }));

describe("parseAssetImportXlsx", () => {
  it("groups sheet rows by P/N, same as the CSV importer", async () => {
    readSheetMock.mockResolvedValue([
      ["S/N", "P/N", "Description"],
      ["SN-001", "EPS-PRJ-100", "Epson projector"],
      ["SN-002", "EPS-PRJ-100", "Epson projector"],
      ["SN-100", "SONY-FX3", "Sony cinema camera"],
    ]);

    const { rows, skippedRows } = await parseAssetImportXlsx(
      new File([], "assets.xlsx"),
    );

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

  it("stringifies numeric and null cells the sheet reader can hand back", async () => {
    // A numeric-looking P/N or S/N column is a common real-world Excel
    // gotcha -- Excel/read-excel-file may parse it as a number, not text.
    readSheetMock.mockResolvedValue([
      ["S/N", "P/N", "Description"],
      [1001, 5551, null],
      [1002, 5551, "Has a description"],
    ]);

    const { rows } = await parseAssetImportXlsx(new File([], "assets.xlsx"));

    expect(rows).toEqual([
      {
        name: "5551",
        partNumber: "5551",
        description: "Has a description",
        serialNumbers: "1001\n1002",
      },
    ]);
  });

  it("skips rows with no P/N", async () => {
    readSheetMock.mockResolvedValue([
      ["S/N", "P/N", "Description"],
      ["SN-1", null, "No part number"],
      ["SN-2", "PN-2", "Has one"],
    ]);

    const { rows, skippedRows } = await parseAssetImportXlsx(
      new File([], "assets.xlsx"),
    );
    expect(skippedRows).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].partNumber).toBe("PN-2");
  });
});
