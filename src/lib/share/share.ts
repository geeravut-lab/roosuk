import type { MealItem } from "@/lib/food/food";
import type { LabItem } from "@/lib/lab/lab";
import { MAX_DELTA } from "@/lib/quiz/quiz";

/**
 * Shareable cards: what goes ON the card is decided here, in code. A card never
 * shows a name, a lab value, a marker or a photo — only a summary the person
 * chose to share (docs master plan §6: "ไม่เปิดเผยค่าสุขภาพละเอียด").
 */

export interface QuizCardData {
  score: number;
  healthAge: number;
  realAge: number;
}

const int = (v: unknown): number | null => {
  if (typeof v !== "string" || !/^\d{1,3}$/.test(v)) return null;
  return Number(v);
};

/** The numbers of a quiz card from a URL, or null. The card is public, so it only draws plausible quiz outcomes. */
export function parseQuizCard(params: {
  score?: unknown;
  health?: unknown;
  real?: unknown;
}): QuizCardData | null {
  const score = int(params.score);
  const healthAge = int(params.health);
  const realAge = int(params.real);
  if (score === null || healthAge === null || realAge === null) return null;
  if (score > 100 || realAge < 10 || realAge > 120) return null;
  // The quiz never moves health age more than ±MAX_DELTA from the real age.
  if (Math.abs(healthAge - realAge) > MAX_DELTA) return null;
  return { score, healthAge, realAge };
}

export interface LabCardData {
  assessed: number;
  normal: number;
  outside: number;
  collectedOn: string | null;
}

/** Counts only — assessed = judged against a range; "outside" = watch or abnormal. */
export function labCardData(
  items: readonly Pick<LabItem, "status">[],
  collectedOn: string | null,
): LabCardData {
  const assessed = items.filter((i) => i.status !== "unknown");
  return {
    assessed: assessed.length,
    normal: assessed.filter((i) => i.status === "normal").length,
    outside: assessed.filter((i) => i.status !== "normal").length,
    collectedOn,
  };
}

export interface FoodCardData {
  names: string[];
  more: number;
  kcal: number;
}

const SHOWN_DISHES = 3;

export function foodCardData(
  items: readonly Pick<MealItem, "name">[],
  kcal: number,
): FoodCardData {
  const all = items.map((i) => i.name.trim()).filter(Boolean);
  const names = all.slice(0, SHOWN_DISHES);
  return {
    names,
    more: all.length - names.length,
    kcal: Math.max(0, Math.round(kcal)),
  };
}

/** The site's host for the card footer (no scheme, no path). */
export function siteHost(siteUrl: string | undefined | null): string {
  try {
    return new URL(siteUrl || "https://roosuk.netlify.app").host;
  } catch {
    return "roosuk.netlify.app";
  }
}
