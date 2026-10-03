import { CHECKIN_ACTION, pickDailyActions } from "./actions";
import type { CheckinRow } from "./checkin";
import { addDays } from "./dates";
import { hasSustainedLowMood } from "./mood";
import { computeHealthScore, dayScore, type HealthScore } from "./score";
import { computeStreak, recentDays, type Streak } from "./streak";

export interface ActionItem {
  key: string;
  done: boolean;
}

export interface HabitView {
  today: string;
  todayRow: CheckinRow | null;
  score: HealthScore;
  streak: Streak;
  week: { date: string; done: boolean }[];
  actions: ActionItem[];
  doneCount: number;
  lowMood: boolean;
}

/**
 * Everything the Today page shows, derived from the check-in rows and today's
 * ticks. The action list is chosen from data BEFORE today so it stays the same
 * all day (ticks are stored against its keys) — only the score moves after a
 * check-in.
 */
export function buildHabitView(
  rows: CheckinRow[],
  doneKeys: ReadonlySet<string>,
  today: string,
): HabitView {
  const todayRow = rows.find((r) => r.checkin_date === today) ?? null;
  const dates = rows.map((r) => r.checkin_date);

  const beforeToday = computeHealthScore(
    rows.filter((r) => r.checkin_date < today),
    addDays(today, -1),
  );
  const actions = pickDailyActions(beforeToday, today).map((key) => ({
    key,
    done: key === CHECKIN_ACTION ? todayRow !== null : doneKeys.has(key),
  }));

  return {
    today,
    todayRow,
    score: computeHealthScore(rows, today),
    streak: computeStreak(dates, today),
    week: recentDays(dates, today, 7),
    actions,
    doneCount: actions.filter((a) => a.done).length,
    lowMood: hasSustainedLowMood(rows, today),
  };
}

/** One bar of the timeline chart: the day's own score. */
export function dailyScores(
  rows: CheckinRow[],
): { date: string; score: number }[] {
  return rows.map((r) => ({ date: r.checkin_date, score: dayScore(r) }));
}
