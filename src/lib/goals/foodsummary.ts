import { addDays } from "@/lib/health/dates";
import type { MealType } from "./meals";

export interface SummaryMeal {
  meal_date: string;
  meal_type?: MealType | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: { name: string; servings?: number }[];
}

export interface FoodSummary {
  /** days in the window that have at least one logged meal */
  loggedDays: number;
  windowDays: number;
  meals: number;
  /** averages over LOGGED days — a day with one meal logged reads low, so say so */
  avgKcal: number | null;
  avgProteinG: number | null;
  avgCarbsG: number | null;
  avgFatG: number | null;
  /** share of calories, whole percent; null without data */
  macroPct: { protein: number; carbs: number; fat: number } | null;
  /** the dishes eaten most often, by number of days */
  topFoods: { name: string; days: number }[];
  /** enough days to lean on (otherwise the plan says it is a rough estimate) */
  reliable: boolean;
}

/** Days with food logged needed before the averages are used for anything. */
export const MIN_RELIABLE_DAYS = 7;

/** The last `windowDays` days (ending `today`) of the person's confirmed meals, boiled down. */
export function summarizeFood(
  meals: readonly SummaryMeal[],
  today: string,
  windowDays = 30,
): FoodSummary {
  const from = addDays(today, -(windowDays - 1));
  const rows = meals.filter((m) => m.meal_date >= from && m.meal_date <= today);
  const perDay = new Map<
    string,
    { kcal: number; p: number; c: number; f: number }
  >();
  const dishDays = new Map<string, Set<string>>();
  for (const m of rows) {
    const d = perDay.get(m.meal_date) ?? { kcal: 0, p: 0, c: 0, f: 0 };
    d.kcal += m.kcal;
    d.p += m.protein_g;
    d.c += m.carbs_g;
    d.f += m.fat_g;
    perDay.set(m.meal_date, d);
    for (const it of m.items) {
      const days = dishDays.get(it.name) ?? new Set<string>();
      days.add(m.meal_date);
      dishDays.set(it.name, days);
    }
  }
  const loggedDays = perDay.size;
  const empty = loggedDays === 0;
  const avg = (k: "kcal" | "p" | "c" | "f") =>
    empty
      ? null
      : Math.round(
          [...perDay.values()].reduce((s, d) => s + d[k], 0) / loggedDays,
        );
  const avgKcal = avg("kcal");
  const avgP = avg("p");
  const avgC = avg("c");
  const avgF = avg("f");
  const energy = (avgP ?? 0) * 4 + (avgC ?? 0) * 4 + (avgF ?? 0) * 9;
  return {
    loggedDays,
    windowDays,
    meals: rows.length,
    avgKcal,
    avgProteinG: avgP,
    avgCarbsG: avgC,
    avgFatG: avgF,
    macroPct:
      empty || energy === 0
        ? null
        : {
            protein: Math.round(((avgP ?? 0) * 400) / energy),
            carbs: Math.round(((avgC ?? 0) * 400) / energy),
            fat: Math.round(((avgF ?? 0) * 900) / energy),
          },
    topFoods: [...dishDays]
      .map(([name, days]) => ({ name, days: days.size }))
      .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name))
      .slice(0, 8),
    reliable: loggedDays >= MIN_RELIABLE_DAYS,
  };
}
