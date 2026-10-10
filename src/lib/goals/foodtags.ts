import {
  CATALOG_TAGS,
  FOOD_TAGS,
  NAME_PATTERNS,
  SUGAR_FREE,
  type FoodTag,
} from "@/config/food-tags";

export { FOOD_TAGS, type FoodTag };

export interface TaggableItem {
  name: string;
  catalog_key?: string | null;
}

/**
 * The tags of one logged item: the table's own tags when the dish is in it, plus any
 * the NAME points to (so "ต้มเลือดหมู" or a described photo still counts). Pure — nothing is stored.
 */
export function tagsOf(item: TaggableItem): Set<FoodTag> {
  const out = new Set<FoodTag>();
  const fromTable = item.catalog_key
    ? CATALOG_TAGS[item.catalog_key]
    : undefined;
  for (const t of fromTable ?? []) out.add(t);
  const name = item.name ?? "";
  for (const tag of FOOD_TAGS) {
    if (!NAME_PATTERNS[tag].test(name)) continue;
    if (tag === "sugar_high" && SUGAR_FREE.test(name)) continue;
    out.add(tag);
  }
  // a dish with a high-purine word is not also "moderate"
  if (out.has("purine_high")) out.delete("purine_mod");
  return out;
}

export interface LoggedMeal {
  meal_date: string;
  items: { name: string; catalog_key?: string | null; servings?: number }[];
}

export interface TagCount {
  /** servings (a half serving counts half), rounded to one decimal */
  servings: number;
  /** distinct dishes by name, with how many servings of each */
  top: { name: string; servings: number }[];
}

/** Count the servings that carry each tag in the meals of one window. */
export function countTags(
  meals: readonly LoggedMeal[],
): Map<FoodTag, TagCount> {
  const acc = new Map<FoodTag, { total: number; by: Map<string, number> }>();
  for (const m of meals)
    for (const it of m.items) {
      const servings = Number.isFinite(it.servings)
        ? Math.max(0, it.servings!)
        : 1;
      for (const tag of tagsOf(it)) {
        const e = acc.get(tag) ?? { total: 0, by: new Map() };
        e.total += servings;
        e.by.set(it.name, (e.by.get(it.name) ?? 0) + servings);
        acc.set(tag, e);
      }
    }
  const out = new Map<FoodTag, TagCount>();
  for (const [tag, e] of acc)
    out.set(tag, {
      servings: Math.round(e.total * 10) / 10,
      top: [...e.by]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, s]) => ({ name, servings: Math.round(s * 10) / 10 })),
    });
  return out;
}
