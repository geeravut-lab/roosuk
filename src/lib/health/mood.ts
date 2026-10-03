import { addDays } from "./dates";
import type { CheckinRow } from "./checkin";

/** Lowest mood answer (1 of 5) on this many days in a row triggers a gentle, supportive note. */
export const LOW_MOOD_DAYS = 3;

/**
 * Not a diagnosis — just a nudge to reach out when someone reports the lowest
 * mood for several consecutive days (health guardrail: risky cases hand off to
 * a human). The latest check-in must be today or yesterday so it is current.
 */
export function hasSustainedLowMood(
  rows: CheckinRow[],
  today: string,
): boolean {
  const byDate = new Map(rows.map((r) => [r.checkin_date, r.mood]));
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  for (let i = 0; i < LOW_MOOD_DAYS; i++) {
    if (byDate.get(cursor) !== 1) return false;
    cursor = addDays(cursor, -1);
  }
  return true;
}
