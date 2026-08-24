/** Today as a `YYYY-MM-DD` UTC calendar date -- matches what a native
 * `<input type="date">` reads and writes, and what the statistics API
 * expects for `start`/`end`. */
export function todayIsoDate(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/** `YYYY-MM-DD` minus `days` calendar days, in UTC. */
export function subtractDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - days))
    .toISOString()
    .slice(0, 10);
}

/** Names the server-resolved [periodStart, periodEnd) range the way a reader
 * would say it out loud, e.g. "Aug 24, 2026" for a single day or
 * "Aug 1 - Aug 31, 2026" for a range -- never the raw exclusive-end ISO
 * boundary, which reads as an off-by-one ("Aug 1 - Sep 1" for August).
 *
 * Pinned to UTC throughout: the boundaries are UTC midnights, so formatting
 * them in local time would render the 1st of a range as the previous day
 * for any reader west of Greenwich. */
export function formatRangeLabel(
  periodStart: string,
  periodEnd: string,
): string {
  const start = new Date(periodStart);
  // periodEnd is exclusive, so the range's last real day is one day back.
  const lastDay = new Date(new Date(periodEnd).getTime() - 24 * 60 * 60 * 1000);

  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const dayWithYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  if (start.getTime() === lastDay.getTime()) {
    return dayWithYear.format(start);
  }
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear();
  return `${sameYear ? day.format(start) : dayWithYear.format(start)} – ${dayWithYear.format(lastDay)}`;
}
