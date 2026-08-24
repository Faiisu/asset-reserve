import { buildActivityBuckets } from "./activityBuckets";

const now = new Date("2026-08-24T12:00:00.000Z");

describe("buildActivityBuckets", () => {
  it("returns an empty list for no events", () => {
    expect(buildActivityBuckets([], "day", now)).toEqual([]);
  });

  it("categorizes checked-out, returned, and other events per day bucket", () => {
    const events = [
      { eventType: "CHECKED_OUT", createdAt: "2026-08-24T08:00:00.000Z" },
      { eventType: "RETURNED_GOOD", createdAt: "2026-08-24T09:00:00.000Z" },
      { eventType: "RETURNED_BROKEN", createdAt: "2026-08-23T09:00:00.000Z" },
      { eventType: "REGISTERED", createdAt: "2026-08-23T01:00:00.000Z" },
    ];

    const buckets = buildActivityBuckets(events, "day", now);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      key: "2026-08-23",
      checkedOut: 0,
      returned: 1,
      other: 1,
      total: 2,
    });
    expect(buckets[1]).toMatchObject({
      key: "2026-08-24",
      checkedOut: 1,
      returned: 1,
      other: 0,
      total: 2,
    });
  });

  it("fills gaps between the earliest event and now with zero-count buckets", () => {
    const events = [
      { eventType: "REGISTERED", createdAt: "2026-08-20T00:00:00.000Z" },
    ];

    const buckets = buildActivityBuckets(events, "day", now);

    // Aug 20 (registered) through Aug 24 (now) inclusive = 5 daily buckets.
    expect(buckets).toHaveLength(5);
    expect(buckets.map((b) => b.key)).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
    ]);
    expect(buckets[1]).toMatchObject({
      checkedOut: 0,
      returned: 0,
      other: 0,
      total: 0,
    });
  });

  it("buckets by ISO week (Monday start)", () => {
    const events = [
      // 2026-08-24 is a Monday; 2026-08-19 is the preceding Wednesday.
      { eventType: "CHECKED_OUT", createdAt: "2026-08-19T00:00:00.000Z" },
      { eventType: "CHECKED_OUT", createdAt: "2026-08-24T00:00:00.000Z" },
    ];

    const buckets = buildActivityBuckets(events, "week", now);

    expect(buckets.map((b) => b.key)).toEqual(["2026-08-17", "2026-08-24"]);
    expect(buckets[0].checkedOut).toBe(1);
    expect(buckets[1].checkedOut).toBe(1);
  });

  it("buckets by month and by year", () => {
    const events = [
      { eventType: "RETURNED_LOST", createdAt: "2025-08-01T00:00:00.000Z" },
      { eventType: "RETURNED_LOST", createdAt: "2026-08-01T00:00:00.000Z" },
    ];

    const monthBuckets = buildActivityBuckets(events, "month", now);
    expect(monthBuckets[0].key).toBe("2025-08");
    expect(monthBuckets.at(-1)!.key).toBe("2026-08");

    const yearBuckets = buildActivityBuckets(events, "year", now);
    expect(yearBuckets.map((b) => b.key)).toEqual(["2025", "2026"]);
    expect(yearBuckets[0].returned).toBe(1);
    expect(yearBuckets[1].returned).toBe(1);
  });

  it("caps day buckets to the most recent 30 slots", () => {
    const events = [
      { eventType: "REGISTERED", createdAt: "2026-01-01T00:00:00.000Z" },
    ];

    const buckets = buildActivityBuckets(events, "day", now);

    expect(buckets).toHaveLength(30);
    expect(buckets.at(-1)!.key).toBe("2026-08-24");
  });
});
