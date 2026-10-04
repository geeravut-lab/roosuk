import { isFocusTag, type FocusTag } from "./product";

/**
 * "Picked for you" for Premium: products whose focus tags meet what the person
 * said they want (their goals) or what their own check-ins say needs attention
 * most. It is a match on tags the admin set, nothing clinical — it never reads a lab
 * value or a condition to suggest a product, and always comes with the reminder
 * to ask a doctor or pharmacist.
 */
const GOAL_TO_TAG: Record<string, FocusTag> = {
  sleep: "sleep",
  energy: "energy",
  nutrition: "nutrition",
  move: "move",
  stress: "stress",
};
const CATEGORY_TO_TAG: Record<string, FocusTag> = {
  sleep: "sleep",
  activity: "move",
  nutrition: "nutrition",
  recovery: "energy",
};

export interface Wants {
  tags: FocusTag[];
  /** why each tag is wanted, for the explanation under a product */
  because: Partial<Record<FocusTag, "goal" | "checkin">>;
}

export function wantedTags(
  goals: readonly string[],
  focusCategory: string | null,
): Wants {
  const because: Wants["because"] = {};
  for (const g of goals) {
    const t = GOAL_TO_TAG[g];
    if (t) because[t] = "goal";
  }
  const c = focusCategory ? CATEGORY_TO_TAG[focusCategory] : undefined;
  if (c && !because[c]) because[c] = "checkin";
  return { tags: Object.keys(because) as FocusTag[], because };
}

export interface Recommendable {
  id: string;
  focus_tags: string[];
  sort: number;
}

export interface Pick<T> {
  product: T;
  matched: FocusTag[];
}

export function recommend<T extends Recommendable>(
  products: readonly T[],
  wants: Wants,
  limit = 6,
): Pick<T>[] {
  if (wants.tags.length === 0) return [];
  return products
    .map((product) => ({
      product,
      matched: product.focus_tags
        .filter(isFocusTag)
        .filter((t) => wants.tags.includes(t)),
    }))
    .filter((p) => p.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length || a.product.sort - b.product.sort,
    )
    .slice(0, limit);
}
