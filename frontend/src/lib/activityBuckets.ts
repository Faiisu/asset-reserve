export type ActivityGranularity = "day" | "week" | "month" | "year";

export type ActivityCategory = "checkedOut" | "returned" | "other";

export type ActivityBucket = {
  key: string;
  start: string;
  label: string;
  fullLabel: string;
  checkedOut: number;
  returned: number;
  other: number;
  total: number;
};

const BUCKET_CAPS: Record<ActivityGranularity, number> = {
  day: 30,
  week: 26,
  month: 24,
  year: 20,
};

const RETURN_EVENT_TYPES = new Set([
  "RETURNED_GOOD",
  "RETURNED_BROKEN",
  "RETURNED_LOST",
]);

function categorize(eventType: string): ActivityCategory {
  if (eventType === "CHECKED_OUT") return "checkedOut";
  if (RETURN_EVENT_TYPES.has(eventType)) return "returned";
  return "other";
}

function bucketStart(date: Date, granularity: ActivityGranularity): Date {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  if (granularity === "day") return day;
  if (granularity === "week") {
    const weekday = day.getUTCDay();
    const diffToMonday = (weekday + 6) % 7;
    day.setUTCDate(day.getUTCDate() - diffToMonday);
    return day;
  }
  if (granularity === "month") {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  }
  return new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
}

function nextBucketStart(date: Date, granularity: ActivityGranularity): Date {
  const next = new Date(date);
  if (granularity === "day") next.setUTCDate(next.getUTCDate() + 1);
  else if (granularity === "week") next.setUTCDate(next.getUTCDate() + 7);
  else if (granularity === "month") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function bucketKey(date: Date, granularity: ActivityGranularity): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  if (granularity === "year") return `${y}`;
  if (granularity === "month") return `${y}-${String(m).padStart(2, "0")}`;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const shortDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const shortMonthFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});
const fullDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const fullMonthFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

function labelFor(
  start: Date,
  granularity: ActivityGranularity,
): { label: string; fullLabel: string } {
  if (granularity === "day") {
    return {
      label: shortDayFormat.format(start),
      fullLabel: fullDayFormat.format(start),
    };
  }
  if (granularity === "week") {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      label: shortDayFormat.format(start),
      fullLabel: `Week of ${fullDayFormat.format(start)} – ${fullDayFormat.format(end)}`,
    };
  }
  if (granularity === "month") {
    return {
      label: shortMonthFormat.format(start),
      fullLabel: fullMonthFormat.format(start),
    };
  }
  const year = `${start.getUTCFullYear()}`;
  return { label: year, fullLabel: year };
}

/** Buckets events into fixed-width time slots (UTC calendar boundaries), filling
 * gaps with zero counts, then keeps only the most recent BUCKET_CAPS[granularity]
 * slots so a long-lived unit's daily view doesn't render hundreds of bars. */
export function buildActivityBuckets(
  events: Array<{ eventType: string; createdAt: string }>,
  granularity: ActivityGranularity,
  now: Date = new Date(),
): ActivityBucket[] {
  if (events.length === 0) return [];

  const counts = new Map<
    string,
    { start: Date; checkedOut: number; returned: number; other: number }
  >();
  let earliest: Date | null = null;

  for (const event of events) {
    const start = bucketStart(new Date(event.createdAt), granularity);
    const key = bucketKey(start, granularity);
    if (!earliest || start < earliest) earliest = start;
    const entry = counts.get(key) ?? {
      start,
      checkedOut: 0,
      returned: 0,
      other: 0,
    };
    entry[categorize(event.eventType)] += 1;
    counts.set(key, entry);
  }
  if (!earliest) return [];

  const nowStart = bucketStart(now, granularity);
  const buckets: ActivityBucket[] = [];
  let cursor = earliest;
  let guard = 0;
  while (cursor <= nowStart && guard < 5000) {
    guard += 1;
    const key = bucketKey(cursor, granularity);
    const entry = counts.get(key);
    const { label, fullLabel } = labelFor(cursor, granularity);
    const checkedOut = entry?.checkedOut ?? 0;
    const returned = entry?.returned ?? 0;
    const other = entry?.other ?? 0;
    buckets.push({
      key,
      start: cursor.toISOString(),
      label,
      fullLabel,
      checkedOut,
      returned,
      other,
      total: checkedOut + returned + other,
    });
    cursor = nextBucketStart(cursor, granularity);
  }

  const cap = BUCKET_CAPS[granularity];
  return buckets.length > cap ? buckets.slice(buckets.length - cap) : buckets;
}
