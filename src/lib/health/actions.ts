import { dayOfYear } from "./dates";
import {
  weakestFirst,
  type ActionableCategory,
  type HealthScore,
} from "./score";

/**
 * Today's 3 Actions — template based (no AI cost; Premium gets AI-tailored
 * ones later). The first is always the check-in itself; the other two target
 * the user's two weakest categories, rotating through a few suggestions so the
 * list does not repeat every day. Generic wellness habits only — never medical
 * advice, never about weight.
 */
export const CHECKIN_ACTION = "checkin";

export const ACTION_TEMPLATES: Record<ActionableCategory, readonly string[]> = {
  sleep: ["sleep_bedtime", "sleep_screens", "sleep_caffeine"],
  activity: ["move_walk", "move_stairs", "move_stretch"],
  nutrition: ["eat_veg", "eat_water", "eat_sweet"],
  recovery: ["rest_breathe", "rest_break", "rest_connect"],
};

export const ALL_ACTION_KEYS: readonly string[] = [
  CHECKIN_ACTION,
  ...Object.values(ACTION_TEMPLATES).flat(),
];

export function isActionKey(value: unknown): value is string {
  return typeof value === "string" && ALL_ACTION_KEYS.includes(value);
}

/**
 * `score` must come from data BEFORE today, so the list (and the ticks stored
 * against its keys) stays the same all day, even after today's check-in.
 * With no history yet, the starter pair is activity + nutrition.
 */
export function pickDailyActions(score: HealthScore, date: string): string[] {
  const order: ActionableCategory[] =
    score.overall === null
      ? ["activity", "nutrition"]
      : weakestFirst(score).slice(0, 2);
  const day = dayOfYear(date);
  const [first, second] = order.map((category, i) => {
    const options = ACTION_TEMPLATES[category];
    return options[(day + i) % options.length];
  });
  return [CHECKIN_ACTION, first, second];
}
