import type { StatisticsPeriod } from "../types";

/** An anchor is a plain `YYYY-MM-DD` UTC calendar date naming any day inside
 * the period being reported on. The server snaps it to the period's real
 * boundaries, so this only has to stay a valid date -- it never has to sit on
 * the first day of the month or on a Monday. */
export type Anchor = string;

function toAnchor(utcMillis: number): Anchor {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

function partsOf(anchor: Anchor) {
  const [year, month, day] = anchor.split("-").map(Number);
  return { year: year ?? 1970, month: (month ?? 1) - 1, day: day ?? 1 };
}

export function todayAnchor(now: Date = new Date()): Anchor {
  return toAnchor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Moves one whole period forward or back. Month and year steps land on the
 * first of the period so stepping out of a 31-day month cannot skid into the
 * wrong one (Jan 31 + 1 month would otherwise overflow into March). */
export function shiftAnchor(
  anchor: Anchor,
  period: StatisticsPeriod,
  step: 1 | -1,
): Anchor {
  const { year, month, day } = partsOf(anchor);
  if (period === "day") return toAnchor(Date.UTC(year, month, day + step));
  if (period === "week") return toAnchor(Date.UTC(year, month, day + 7 * step));
  if (period === "month") return toAnchor(Date.UTC(year, month + step, 1));
  return toAnchor(Date.UTC(year + step, 0, 1));
}

/** Identifies the period an anchor falls in, so two anchors can be compared
 * without re-deriving both windows. Weeks resolve to their Monday. */
export function periodKey(anchor: Anchor, period: StatisticsPeriod): string {
  const { year, month, day } = partsOf(anchor);
  if (period === "year") return `${year}`;
  if (period === "month") return anchor.slice(0, 7);
  if (period === "day") return anchor;
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  // getUTCDay() is Sunday-based; shift so Monday starts the week.
  return toAnchor(Date.UTC(year, month, day - ((weekday + 6) % 7)));
}

export function isCurrentPeriod(
  anchor: Anchor,
  period: StatisticsPeriod,
  now: Date = new Date(),
): boolean {
  return periodKey(anchor, period) === periodKey(todayAnchor(now), period);
}

/** The value for the native picker: a month granularity gets a month picker
 * (`YYYY-MM`) and a year gets a plain number, so neither asks the reader to
 * choose a day that does not matter. */
export function toInputValue(anchor: Anchor, period: StatisticsPeriod): string {
  if (period === "year") return anchor.slice(0, 4);
  if (period === "month") return anchor.slice(0, 7);
  return anchor;
}

/** Names the selected window the way a reader would say it out loud
 * ("August 2026", "17 – 23 Aug 2026") rather than as a half-open range,
 * whose exclusive end reads as an off-by-one ("Aug 1 - Sep 1" for August).
 *
 * Every formatter is pinned to UTC: the boundaries are UTC midnights, so
 * formatting them in local time would render the 1st of a month as the last
 * day of the previous one for any reader west of Greenwich. */
export function formatPeriodLabel(
  periodStart: string,
  period: StatisticsPeriod,
): string {
  const start = new Date(periodStart);
  if (period === "year") {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }
  if (period === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start);
  }
  if (period === "day") {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(start);
  }
  // The stored end is exclusive; a week is named by its last real day.
  const last = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const dayMonth = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const full = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${dayMonth.format(start)} – ${full.format(last)}`;
}

/** Inverse of toInputValue. Returns null for a partial or cleared field --
 * native date inputs report "" mid-edit, which must not reset the view. */
export function fromInputValue(
  value: string,
  period: StatisticsPeriod,
): Anchor | null {
  if (period === "year") {
    return /^\d{4}$/.test(value) ? `${value}-01-01` : null;
  }
  if (period === "month") {
    return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
