/**
 * Calendar days in Thai time (UTC+7, no DST) as YYYY-MM-DD strings. A "day" for
 * check-ins, streaks and actions ends at midnight in Bangkok — the same rule the
 * database uses (`public.bangkok_today()`), so server and SQL always agree.
 */
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 86_400_000;

export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function toUtcMs(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`not a date: ${date}`);
  return ms;
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

/** 1-based day of the year — used to rotate template suggestions day by day. */
export function dayOfYear(date: string): number {
  return daysBetween(`${date.slice(0, 4)}-01-01`, date) + 1;
}
