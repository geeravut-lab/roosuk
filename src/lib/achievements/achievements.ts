import type { Dict } from "@/lib/i18n/dict";

/**
 * The badge catalogue. The keys are the ones the database allows
 * (user_achievements.key check) — a test compares the two lists, so a badge
 * cannot exist on one side only. Every badge is about showing up or finishing a
 * step; none is about weight, body shape, calories or score targets.
 */
export type AchievementGroup = "streak" | "log" | "setup";

export interface Achievement {
  key: AchievementKey;
  group: AchievementGroup;
  /** which counter measures progress toward it (null = a yes/no step) */
  stat: keyof AchievementStats | null;
  need: number;
}

export const ACHIEVEMENTS = [
  { key: "checkin_first", group: "streak", stat: "days", need: 1 },
  { key: "streak_3", group: "streak", stat: "bestStreak", need: 3 },
  { key: "streak_7", group: "streak", stat: "bestStreak", need: 7 },
  { key: "streak_14", group: "streak", stat: "bestStreak", need: 14 },
  { key: "streak_30", group: "streak", stat: "bestStreak", need: 30 },
  { key: "checkin_days_30", group: "streak", stat: "days", need: 30 },
  { key: "meal_first", group: "log", stat: "meals", need: 1 },
  { key: "meal_20", group: "log", stat: "meals", need: 20 },
  { key: "lab_first", group: "log", stat: "labs", need: 1 },
  { key: "lab_two_dates", group: "log", stat: "labDates", need: 2 },
  { key: "profile_done", group: "setup", stat: null, need: 1 },
  { key: "line_linked", group: "setup", stat: null, need: 1 },
  { key: "quiz_done", group: "setup", stat: null, need: 1 },
] as const satisfies readonly {
  key: string;
  group: AchievementGroup;
  stat: string | null;
  need: number;
}[];

export type AchievementKey = (typeof ACHIEVEMENTS)[number]["key"];

export interface AchievementStats {
  days: number;
  bestStreak: number;
  meals: number;
  labs: number;
  labDates: number;
}

export const GROUPS: readonly AchievementGroup[] = ["streak", "log", "setup"];

export const nameKey = (k: AchievementKey) => `ach_${k}_name` as keyof Dict;
export const descKey = (k: AchievementKey) => `ach_${k}_desc` as keyof Dict;

/** "have / need" for a badge not yet earned; null for yes/no steps. `have` never exceeds `need`. */
export function progress(
  a: Pick<Achievement, "stat" | "need">,
  stats: AchievementStats,
): { have: number; need: number } | null {
  if (!a.stat) return null;
  return { have: Math.min(Math.max(stats[a.stat], 0), a.need), need: a.need };
}

/** A badge earned within the last two days is shown as new. */
export function isNew(earnedOn: string, today: string): boolean {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${earnedOn}T00:00:00Z`)) /
      86_400_000,
  );
  return days >= 0 && days <= 1;
}
