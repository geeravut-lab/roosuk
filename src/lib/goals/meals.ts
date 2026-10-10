/** The four slots of a day's food diary. */
export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function isMealType(v: unknown): v is MealType {
  return typeof v === "string" && (MEAL_TYPES as readonly string[]).includes(v);
}

/**
 * A sensible slot for "now" (Bangkok hour), used to pre-select the slot when someone logs a
 * meal; they can change it. Breakfast until 10:30, lunch until 14:30, a snack in the
 * afternoon, dinner from 17:30.
 */
export function defaultMealType(now: Date): MealType {
  const minutes = ((now.getUTCHours() + 7) % 24) * 60 + now.getUTCMinutes();
  if (minutes < 10 * 60 + 30) return "breakfast";
  if (minutes < 14 * 60 + 30) return "lunch";
  if (minutes < 17 * 60 + 30) return "snack";
  return "dinner";
}
