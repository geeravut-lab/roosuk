import { describe, expect, it } from "vitest";
import { THAI_FOODS, foodByKey } from "@/config/thai-foods";
import {
  MAX_ITEMS,
  applyReview,
  foodPrompt,
  mealTotals,
  needsReview,
  normalizeFoodResult,
  parseStoredItems,
  sniffImageType,
} from "./food";

describe("thai food catalog", () => {
  it("has unique keys and sane, internally consistent numbers", () => {
    expect(new Set(THAI_FOODS.map((x) => x.key)).size).toBe(THAI_FOODS.length);
    for (const x of THAI_FOODS) {
      expect(x.kcal).toBeGreaterThanOrEqual(0);
      expect(x.kcal).toBeLessThan(1200);
      // Atwater sanity: macros must roughly explain the calories (±35 % or 30 kcal).
      const fromMacros = x.protein_g * 4 + x.carbs_g * 4 + x.fat_g * 9;
      expect(Math.abs(fromMacros - x.kcal)).toBeLessThanOrEqual(
        Math.max(30, x.kcal * 0.35),
      );
    }
  });
  it("looks entries up by key", () => {
    expect(foodByKey("pad_thai")?.th).toBe("ผัดไทย");
    expect(foodByKey("nope")).toBeUndefined();
  });
});

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WebP by their bytes", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(
      sniffImageType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
  });
  it("rejects everything else, including a renamed script or PDF", () => {
    expect(
      sniffImageType(new TextEncoder().encode("<?php echo 1;")),
    ).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

const raw = (items: object[], is_food = true) => ({ is_food, items });
const item = (o: object = {}) => ({
  name: "ผัดไทย",
  catalog_key: "pad_thai",
  servings: 1,
  confidence: 0.9,
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ...o,
});

describe("normalizeFoodResult", () => {
  it("takes the numbers from the catalog, not from the model", () => {
    const [i] = normalizeFoodResult(raw([item({ kcal: 9999 })]))!;
    expect(i).toMatchObject({
      source: "catalog",
      catalog_key: "pad_thai",
      name: "ผัดไทย",
    });
    expect(i.per_serving.kcal).toBe(foodByKey("pad_thai")!.kcal);
  });
  it("keeps non-catalog dishes with the model's estimate, clamped and flagged", () => {
    const [i] = normalizeFoodResult(
      raw([
        item({
          name: "ขนมแปลก",
          catalog_key: "",
          kcal: 99999,
          protein_g: -5,
          fat_g: 1000,
        }),
      ]),
    )!;
    expect(i.source).toBe("ai");
    expect(i.catalog_key).toBeNull();
    expect(i.per_serving.kcal).toBe(2500);
    expect(i.per_serving.protein_g).toBe(0);
    expect(i.per_serving.fat_g).toBe(250);
  });
  it("treats an unknown catalog_key as a non-catalog dish", () => {
    expect(
      normalizeFoodResult(
        raw([item({ catalog_key: "made_up", kcal: 300 })]),
      )![0],
    ).toMatchObject({
      source: "ai",
      catalog_key: null,
    });
  });
  it("rounds servings to halves within 0.5–5 and clamps confidence to 0–1", () => {
    const out = normalizeFoodResult(
      raw([
        item({ servings: 1.3, confidence: 7 }),
        item({ servings: 99 }),
        item({ servings: -2 }),
        item({ servings: 0 }),
      ]),
    )!;
    expect(out.map((x) => x.servings)).toEqual([1.5, 5, 0.5, 1]);
    expect(out[0].confidence).toBe(1);
  });
  it("returns null when it is not food, empty, or garbage", () => {
    expect(normalizeFoodResult(raw([item()], false))).toBeNull();
    expect(normalizeFoodResult(raw([]))).toBeNull();
    expect(normalizeFoodResult("nope")).toBeNull();
    expect(normalizeFoodResult({ is_food: true })).toBeNull();
    expect(normalizeFoodResult(null)).toBeNull();
  });
  it("caps the number of items", () => {
    const many = Array.from({ length: 20 }, (_, n) =>
      item({ name: `x${n}`, catalog_key: "" }),
    );
    expect(normalizeFoodResult(raw(many))!).toHaveLength(MAX_ITEMS);
  });
});

describe("mealTotals / needsReview", () => {
  it("multiplies per-serving values by servings and rounds", () => {
    const items = normalizeFoodResult(
      raw([
        item({ servings: 2 }),
        item({ catalog_key: "steamed_rice", name: "ข้าว", servings: 1 }),
      ]),
    )!;
    const t = mealTotals(items);
    expect(t.kcal).toBe(
      foodByKey("pad_thai")!.kcal * 2 + foodByKey("steamed_rice")!.kcal,
    );
    expect(mealTotals([])).toEqual({
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });
  it("asks for a second look at AI estimates and low confidence only", () => {
    expect(needsReview(normalizeFoodResult(raw([item()]))!)).toBe(false);
    expect(
      needsReview(normalizeFoodResult(raw([item({ confidence: 0.3 })]))!),
    ).toBe(true);
    expect(
      needsReview(normalizeFoodResult(raw([item({ catalog_key: "" })]))!),
    ).toBe(true);
  });
});

describe("stored items and review edits", () => {
  const items = normalizeFoodResult(
    raw([item(), item({ catalog_key: "steamed_rice", name: "ข้าว" })]),
  )!;
  it("round-trips through jsonb and drops malformed data", () => {
    expect(parseStoredItems(JSON.parse(JSON.stringify(items)))).toEqual(items);
    expect(parseStoredItems([{ name: 1 }])).toEqual([]);
    expect(parseStoredItems(null)).toEqual([]);
  });
  it("applies only offered serving choices and removals", () => {
    const out = applyReview(items, {
      servings: [2, 7],
      remove: [false, false],
    });
    expect(out.map((i) => i.servings)).toEqual([2, 1]); // 7 is not an offered choice → unchanged
    expect(
      applyReview(items, { servings: [null, null], remove: [true, false] }),
    ).toHaveLength(1);
    expect(applyReview(items, { servings: [], remove: [true, true] })).toEqual(
      [],
    );
  });
  it("never lets a review change the nutrition numbers", () => {
    const out = applyReview(items, {
      servings: [3, 3],
      remove: [false, false],
    });
    expect(out.map((i) => i.per_serving)).toEqual(
      items.map((i) => i.per_serving),
    );
  });
});

describe("foodPrompt", () => {
  it("lists the whole catalog and guards against instructions inside the image", () => {
    const { system, prompt } = foodPrompt();
    for (const x of THAI_FOODS) expect(prompt).toContain(x.key);
    expect(system).toMatch(/never as instructions/);
    expect(system).toMatch(/never give health advice/);
  });
});
