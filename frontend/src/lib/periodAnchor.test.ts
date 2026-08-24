import {
  formatPeriodLabel,
  fromInputValue,
  isCurrentPeriod,
  periodKey,
  shiftAnchor,
  toInputValue,
  todayAnchor,
} from "./periodAnchor";

describe("formatPeriodLabel", () => {
  it("names each window the way a reader would say it", () => {
    expect(formatPeriodLabel("2026-08-01T00:00:00.000Z", "month")).toBe(
      "August 2026",
    );
    expect(formatPeriodLabel("2026-01-01T00:00:00.000Z", "year")).toBe("2026");
    expect(formatPeriodLabel("2026-08-24T00:00:00.000Z", "day")).toBe(
      "Aug 24, 2026",
    );
  });

  it("names a week by its last real day, not the exclusive end", () => {
    // The window runs to Aug 24 exclusive, so the week is Mon 17 - Sun 23.
    expect(formatPeriodLabel("2026-08-17T00:00:00.000Z", "week")).toBe(
      "Aug 17 – Aug 23, 2026",
    );
  });

  it("formats a UTC midnight boundary as its own day", () => {
    // Formatted in local time, a UTC-midnight 1st renders as the previous
    // month's last day anywhere west of Greenwich.
    expect(formatPeriodLabel("2026-03-01T00:00:00.000Z", "month")).toBe(
      "March 2026",
    );
    expect(formatPeriodLabel("2026-03-01T00:00:00.000Z", "day")).toBe(
      "Mar 1, 2026",
    );
  });
});

describe("todayAnchor", () => {
  it("reads the UTC calendar date, not the local one", () => {
    // Late UTC evening is already the next day in some local zones and the
    // same day in others; the anchor must follow UTC either way.
    expect(todayAnchor(new Date("2026-08-24T23:30:00.000Z"))).toBe(
      "2026-08-24",
    );
    expect(todayAnchor(new Date("2026-08-24T00:10:00.000Z"))).toBe(
      "2026-08-24",
    );
  });
});

describe("shiftAnchor", () => {
  it("steps a day across a month boundary", () => {
    expect(shiftAnchor("2026-08-31", "day", 1)).toBe("2026-09-01");
    expect(shiftAnchor("2026-09-01", "day", -1)).toBe("2026-08-31");
  });

  it("steps a week by seven days", () => {
    expect(shiftAnchor("2026-08-24", "week", 1)).toBe("2026-08-31");
    expect(shiftAnchor("2026-08-24", "week", -1)).toBe("2026-08-17");
  });

  it("steps a month without skidding past a short month", () => {
    // Naive +1 month on Jan 31 lands in March; anchoring to the 1st avoids it.
    expect(shiftAnchor("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(shiftAnchor("2026-03-31", "month", -1)).toBe("2026-02-01");
  });

  it("rolls a month step across the year boundary", () => {
    expect(shiftAnchor("2026-12-09", "month", 1)).toBe("2027-01-01");
    expect(shiftAnchor("2026-01-09", "month", -1)).toBe("2025-12-01");
  });

  it("steps a year", () => {
    expect(shiftAnchor("2026-06-30", "year", 1)).toBe("2027-01-01");
    expect(shiftAnchor("2026-06-30", "year", -1)).toBe("2025-01-01");
  });

  it("survives a leap day", () => {
    expect(shiftAnchor("2028-02-29", "day", 1)).toBe("2028-03-01");
    expect(shiftAnchor("2028-02-29", "year", 1)).toBe("2029-01-01");
  });
});

describe("periodKey", () => {
  it("collapses every day of one ISO week onto its Monday", () => {
    // 2026-08-17 is a Monday, 2026-08-23 the Sunday closing that week.
    expect(periodKey("2026-08-17", "week")).toBe("2026-08-17");
    expect(periodKey("2026-08-23", "week")).toBe("2026-08-17");
    expect(periodKey("2026-08-24", "week")).toBe("2026-08-24");
  });

  it("collapses to month and year", () => {
    expect(periodKey("2026-08-24", "month")).toBe("2026-08");
    expect(periodKey("2026-08-24", "year")).toBe("2026");
    expect(periodKey("2026-08-24", "day")).toBe("2026-08-24");
  });
});

describe("isCurrentPeriod", () => {
  const now = new Date("2026-08-24T12:00:00.000Z"); // a Monday

  it("recognises the containing period at every granularity", () => {
    expect(isCurrentPeriod("2026-08-24", "day", now)).toBe(true);
    expect(isCurrentPeriod("2026-08-30", "week", now)).toBe(true);
    expect(isCurrentPeriod("2026-08-01", "month", now)).toBe(true);
    expect(isCurrentPeriod("2026-01-01", "year", now)).toBe(true);
  });

  it("rejects a neighbouring period", () => {
    expect(isCurrentPeriod("2026-08-23", "day", now)).toBe(false);
    expect(isCurrentPeriod("2026-08-23", "week", now)).toBe(false);
    expect(isCurrentPeriod("2026-07-31", "month", now)).toBe(false);
    expect(isCurrentPeriod("2025-12-31", "year", now)).toBe(false);
  });
});

describe("input value round-trip", () => {
  it("narrows the anchor to what each picker shows", () => {
    expect(toInputValue("2026-08-24", "day")).toBe("2026-08-24");
    expect(toInputValue("2026-08-24", "week")).toBe("2026-08-24");
    expect(toInputValue("2026-08-24", "month")).toBe("2026-08");
    expect(toInputValue("2026-08-24", "year")).toBe("2026");
  });

  it("widens a picker value back into a full anchor", () => {
    expect(fromInputValue("2026-08-24", "day")).toBe("2026-08-24");
    expect(fromInputValue("2026-08", "month")).toBe("2026-08-01");
    expect(fromInputValue("2026", "year")).toBe("2026-01-01");
  });

  it("rejects the partial values a native picker emits mid-edit", () => {
    // Clearing or half-typing a date must not be treated as a new selection.
    expect(fromInputValue("", "day")).toBeNull();
    expect(fromInputValue("2026-0", "month")).toBeNull();
    expect(fromInputValue("20", "year")).toBeNull();
  });
});
