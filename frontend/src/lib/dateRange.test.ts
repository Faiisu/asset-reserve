import { formatRangeLabel, subtractDays, todayIsoDate } from "./dateRange";

describe("todayIsoDate", () => {
  it("reads the UTC calendar date, not the local one", () => {
    expect(todayIsoDate(new Date("2026-08-24T23:30:00.000Z"))).toBe(
      "2026-08-24",
    );
    expect(todayIsoDate(new Date("2026-08-24T00:10:00.000Z"))).toBe(
      "2026-08-24",
    );
  });
});

describe("subtractDays", () => {
  it("steps back across a month boundary", () => {
    expect(subtractDays("2026-09-01", 1)).toBe("2026-08-31");
  });

  it("steps back across a year boundary", () => {
    expect(subtractDays("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("steps back a full 29 days", () => {
    expect(subtractDays("2026-08-24", 29)).toBe("2026-07-26");
  });
});

describe("formatRangeLabel", () => {
  it("names a single-day window as one date", () => {
    expect(
      formatRangeLabel("2026-08-24T00:00:00.000Z", "2026-08-25T00:00:00.000Z"),
    ).toBe("Aug 24, 2026");
  });

  it("names a multi-day window within one year without repeating it", () => {
    expect(
      formatRangeLabel("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    ).toBe("Aug 1 – Aug 31, 2026");
  });

  it("spells out both years when the window crosses a year boundary", () => {
    expect(
      formatRangeLabel("2025-12-15T00:00:00.000Z", "2026-01-15T00:00:00.000Z"),
    ).toBe("Dec 15, 2025 – Jan 14, 2026");
  });

  it("formats a UTC midnight boundary as its own day", () => {
    // Formatted in local time, a UTC-midnight 1st renders as the previous
    // day anywhere west of Greenwich.
    expect(
      formatRangeLabel("2026-03-01T00:00:00.000Z", "2026-03-02T00:00:00.000Z"),
    ).toBe("Mar 1, 2026");
  });
});
