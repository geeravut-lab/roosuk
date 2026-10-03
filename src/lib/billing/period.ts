/**
 * Quota windows are calendar-aligned in Thai time (UTC+7, no DST), so "this
 * month" resets at midnight in Bangkok, not at 07:00 (docs/10-billing-and-quota.md).
 */
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;

/** First day of the current Bangkok month, as YYYY-MM-01. */
export function bangkokMonthStart(now: Date): string {
  const t = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * First month of the window containing `monthStart`: windows of `periodMonths`
 * months aligned to January (3 → Jan/Apr/Jul/Oct quarters, 1 → the month itself).
 */
export function windowStart(monthStart: string, periodMonths: number): string {
  if (
    !Number.isInteger(periodMonths) ||
    periodMonths < 1 ||
    periodMonths > 12
  ) {
    throw new RangeError(
      `periodMonths must be an integer from 1 to 12, got ${periodMonths}`,
    );
  }
  const [year, month] = monthStart.split("-").map(Number);
  const startMonth = Math.floor((month - 1) / periodMonths) * periodMonths + 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}
