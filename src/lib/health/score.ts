import { addDays } from "./dates";
import type { CheckinAnswers, CheckinRow } from "./checkin";

/**
 * Personal Health Score — computed by code from the user's own check-ins, never
 * by an LLM, so a number is stable, explainable and free to produce. It is a
 * habit mirror, not a diagnosis: nothing here uses weight or body shape.
 *
 * Categories (docs master plan §6): sleep, activity, nutrition, recovery and
 * lifestyle come from check-ins; `checkup` needs lab results (Lab Scan) and is
 * simply left out of the average until there are some — no data never costs points.
 */
export const SCORE_CATEGORIES = [
  "sleep",
  "activity",
  "nutrition",
  "recovery",
  "checkup",
  "lifestyle",
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

/** Categories a daily action can target (the ones the user can move today). */
export const ACTIONABLE = [
  "sleep",
  "activity",
  "nutrition",
  "recovery",
] as const;
export type ActionableCategory = (typeof ACTIONABLE)[number];

export const WINDOW_DAYS = 7;
/** Trend needs this many check-ins in BOTH weeks, or it is just noise. */
const TREND_MIN_DAYS = 3;
/** At or above this a category needs no extra attention. */
export const GOOD_ENOUGH = 85;

// Points per band. Sleep peaks at 7–8 h (the usual adult recommendation) and
// eases off for 9+; activity rises with minutes of movement.
const SLEEP_POINTS = [30, 65, 100, 80] as const;
const ACTIVITY_POINTS = [20, 55, 90, 100] as const;
const fromScale = (n: number) => ((n - 1) / 4) * 100;

export function categoryPoints(
  a: CheckinAnswers,
): Record<ActionableCategory, number> {
  return {
    sleep: SLEEP_POINTS[a.sleep_band - 1],
    activity: ACTIVITY_POINTS[a.activity_band - 1],
    nutrition: fromScale(a.nutrition),
    recovery: (fromScale(a.energy) + fromScale(a.mood)) / 2,
  };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** One day's score: the mean of its four check-in categories. */
export function dayScore(a: CheckinAnswers): number {
  return Math.round(mean(Object.values(categoryPoints(a))));
}

export interface HealthScore {
  /** null until there is at least one check-in in the window. */
  overall: number | null;
  categories: Record<ScoreCategory, number | null>;
  /** Check-ins inside the 7-day window. */
  daysUsed: number;
  /** Change vs the week before, only when both weeks have enough data. */
  trend: number | null;
  /** The category most worth attention this week, or null when all are good. */
  focus: ActionableCategory | null;
}

interface Snapshot {
  overall: number | null;
  categories: Record<ScoreCategory, number | null>;
  daysUsed: number;
}

function snapshot(rows: CheckinRow[], today: string): Snapshot {
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const inWindow = rows.filter(
    (r) => r.checkin_date >= from && r.checkin_date <= today,
  );
  const empty = Object.fromEntries(
    SCORE_CATEGORIES.map((c) => [c, null]),
  ) as Record<ScoreCategory, null>;
  if (inWindow.length === 0)
    return { overall: null, categories: empty, daysUsed: 0 };

  const points = inWindow.map((r) => categoryPoints(r));
  const avg = (c: ActionableCategory) =>
    Math.round(mean(points.map((p) => p[c])));
  const categories: Record<ScoreCategory, number | null> = {
    sleep: avg("sleep"),
    activity: avg("activity"),
    nutrition: avg("nutrition"),
    recovery: avg("recovery"),
    checkup: null,
    // Consistency: how many of the last 7 days were checked in.
    lifestyle: Math.round((inWindow.length / WINDOW_DAYS) * 100),
  };
  const present = Object.values(categories).filter(
    (v): v is number => v !== null,
  );
  return {
    overall: Math.round(mean(present)),
    categories,
    daysUsed: inWindow.length,
  };
}

export function computeHealthScore(
  rows: CheckinRow[],
  today: string,
): HealthScore {
  const now = snapshot(rows, today);
  const before = snapshot(rows, addDays(today, -WINDOW_DAYS));

  const trend =
    now.overall !== null &&
    before.overall !== null &&
    now.daysUsed >= TREND_MIN_DAYS &&
    before.daysUsed >= TREND_MIN_DAYS
      ? now.overall - before.overall
      : null;

  let focus: ActionableCategory | null = null;
  if (now.overall !== null) {
    // Lowest wins; ties go to the earlier category in ACTIONABLE (stable).
    const lowest = ACTIONABLE.reduce((best, c) =>
      (now.categories[c] ?? 100) < (now.categories[best] ?? 100) ? c : best,
    );
    if ((now.categories[lowest] ?? 100) < GOOD_ENOUGH) focus = lowest;
  }

  return { ...now, trend, focus };
}

/** Ordered categories, weakest first (ties keep ACTIONABLE order) — used to pick actions. */
export function weakestFirst(score: HealthScore): ActionableCategory[] {
  return [...ACTIONABLE].sort(
    (a, b) => (score.categories[a] ?? 100) - (score.categories[b] ?? 100),
  );
}
