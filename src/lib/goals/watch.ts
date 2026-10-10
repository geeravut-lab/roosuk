import { addDays } from "@/lib/health/dates";
import {
  countTags,
  type FoodTag,
  type LoggedMeal,
  type TagCount,
} from "./foodtags";

/**
 * "Keep an eye on this": for a condition the person told us they have, how often their own
 * logged meals contained something that tends to matter for it. Plain counting in code — the
 * thresholds are DRAFT numbers (servings per 7 days) that a dietitian and a doctor must review
 * before launch (master plan §13). A note is a prompt to look at habits and talk to the
 * doctor; it never says the person is ill, never forbids a food, never gives a dose.
 */
export type WatchLevel = "notice" | "caution";

interface Limit {
  tag: FoodTag;
  /** servings in 7 days that start a note / a stronger note */
  notice: number;
  caution: number;
}

export const WATCH_RULES: Record<string, readonly Limit[]> = {
  gout: [
    { tag: "purine_high", notice: 1, caution: 3 },
    { tag: "alcohol", notice: 2, caution: 5 },
    { tag: "purine_mod", notice: 8, caution: 14 },
    { tag: "sugar_high", notice: 7, caution: 14 },
  ],
  diabetes: [
    { tag: "sugar_high", notice: 5, caution: 10 },
    { tag: "refined_carb", notice: 17, caution: 24 },
  ],
  hypertension: [{ tag: "sodium_high", notice: 5, caution: 10 }],
  dyslipidemia: [
    { tag: "satfat_high", notice: 4, caution: 8 },
    { tag: "fried", notice: 4, caution: 8 },
  ],
  kidney_disease: [{ tag: "sodium_high", notice: 4, caution: 8 }],
  heart_disease: [
    { tag: "sodium_high", notice: 5, caution: 10 },
    { tag: "satfat_high", notice: 4, caution: 8 },
    { tag: "fried", notice: 4, caution: 8 },
    { tag: "alcohol", notice: 3, caution: 7 },
  ],
  fatty_liver: [
    { tag: "alcohol", notice: 1, caution: 3 },
    { tag: "sugar_high", notice: 5, caution: 10 },
    { tag: "fried", notice: 4, caution: 8 },
    { tag: "satfat_high", notice: 6, caution: 12 },
  ],
};

/** The conditions the watch understands (the rest of the profile list has nothing to count). */
export const WATCHED_CONDITIONS = Object.keys(WATCH_RULES);

/** Fewer logged days than this in the 30-day look-back and there is not enough to say anything. */
export const MIN_LOGGED_DAYS = 3;

export interface WatchAlert {
  condition: string;
  tag: FoodTag;
  level: WatchLevel;
  servings7: number;
  servings30: number;
  top: TagCount["top"];
}

export interface WatchResult {
  alerts: WatchAlert[];
  /** days with at least one logged meal in the last 30 */
  loggedDays30: number;
  /** too little was logged to judge anything */
  lowData: boolean;
}

/** The 7 days ending `today` (inclusive) and the 30 days ending `today`, from the person's confirmed meals. */
export function evaluateWatch(
  conditions: readonly string[],
  meals: readonly LoggedMeal[],
  today: string,
): WatchResult {
  const from30 = addDays(today, -29);
  const from7 = addDays(today, -6);
  const in30 = meals.filter(
    (m) => m.meal_date >= from30 && m.meal_date <= today,
  );
  const in7 = in30.filter((m) => m.meal_date >= from7);
  const loggedDays30 = new Set(in30.map((m) => m.meal_date)).size;
  if (loggedDays30 < MIN_LOGGED_DAYS)
    return { alerts: [], loggedDays30, lowData: true };

  const c7 = countTags(in7);
  const c30 = countTags(in30);
  const alerts: WatchAlert[] = [];
  for (const condition of conditions) {
    for (const limit of WATCH_RULES[condition] ?? []) {
      const n7 = c7.get(limit.tag)?.servings ?? 0;
      const level: WatchLevel | null =
        n7 >= limit.caution ? "caution" : n7 >= limit.notice ? "notice" : null;
      if (!level) continue;
      alerts.push({
        condition,
        tag: limit.tag,
        level,
        servings7: n7,
        servings30: c30.get(limit.tag)?.servings ?? n7,
        top: c7.get(limit.tag)?.top ?? [],
      });
    }
  }
  alerts.sort(
    (a, b) =>
      Number(b.level === "caution") - Number(a.level === "caution") ||
      b.servings7 - a.servings7,
  );
  return { alerts, loggedDays30, lowData: false };
}

/** ISO week key (Mon–Sun, Bangkok date in) — one weekly nudge per person per week. */
export function weekKey(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
