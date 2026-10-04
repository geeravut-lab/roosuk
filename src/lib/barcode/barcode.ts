import { z } from "zod";
import type { MealItem, Nutrients } from "@/lib/food/food";

/**
 * Barcodes on packaged food are GS1 numbers (EAN-13 / UPC-A / EAN-8 / GTIN-14),
 * the one numbering standard used worldwide. The nutrition comes from Open Food
 * Facts, the largest open product database keyed by those numbers. The numbers
 * are what is PRINTED on the label (as entered by the database's contributors),
 * not an AI estimate, so the review page says where they come from.
 */

/** GS1 check digit: the last digit makes the weighted sum (3,1,3,1… from the right) a multiple of 10. */
export function gtinCheckDigitOk(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i++) {
    const d = Number(digits[digits.length - 2 - i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * What a person typed or a camera read → one EAN-13-style number, or null.
 * Spaces and hyphens are ignored; length must be 8, 12, 13 or 14; the check
 * digit must be right (a misread digit is the usual camera error, and it would
 * otherwise show someone else's product). UPC-A is padded to 13 digits, and a
 * GTIN-14 with a leading 0 is shortened, because that is how the database keys them.
 */
export function parseBarcode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.replace(/[\s-]/g, "");
  if (!/^\d{8}$|^\d{12,14}$/.test(v)) return null;
  if (!gtinCheckDigitOk(v)) return null;
  if (v.length === 12) return `0${v}`;
  if (v.length === 14 && v.startsWith("0")) return v.slice(1);
  return v;
}

export interface BarcodeProduct {
  name: string;
  brand: string | null;
  /** "serving": numbers are per the package's serving; "100g": per 100 g (no serving size known) */
  basis: "serving" | "100g";
  per_serving: Nutrients;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
  z.number().finite(),
);
const optNum = num.optional().catch(undefined);

/** Open Food Facts' answer → a product with per-serving numbers, or null when it is not usable. */
export function parseOffProduct(json: unknown): BarcodeProduct | null {
  const root = z
    .object({
      status: z.union([z.number(), z.string()]).optional(),
      product: z
        .object({
          product_name: z.string().optional().catch(undefined),
          product_name_th: z.string().optional().catch(undefined),
          product_name_en: z.string().optional().catch(undefined),
          generic_name: z.string().optional().catch(undefined),
          brands: z.string().optional().catch(undefined),
          serving_quantity: optNum,
          nutriments: z
            .record(z.string(), z.unknown())
            .optional()
            .catch(undefined),
        })
        .passthrough(),
    })
    .safeParse(json);
  if (!root.success) return null;
  const p = root.data.product;
  const n = p.nutriments ?? {};
  const get = (k: string): number | undefined => {
    const r = optNum.safeParse(n[k]);
    return r.success ? r.data : undefined;
  };
  const name = [
    p.product_name_th,
    p.product_name,
    p.product_name_en,
    p.generic_name,
  ]
    .map((s) => s?.trim())
    .find((s) => s);
  if (!name) return null;

  const servingG =
    p.serving_quantity && p.serving_quantity > 0 && p.serving_quantity <= 2000
      ? p.serving_quantity
      : null;
  const pick = (
    serving: string,
    per100: string,
  ): { v: number; basis: "serving" | "100g" } | null => {
    const s = get(serving);
    if (s !== undefined) return { v: s, basis: "serving" };
    const h = get(per100);
    if (h === undefined) return null;
    return servingG
      ? { v: (h * servingG) / 100, basis: "serving" }
      : { v: h, basis: "100g" };
  };
  const kcal = pick("energy-kcal_serving", "energy-kcal_100g");
  const protein = pick("proteins_serving", "proteins_100g");
  const carbs = pick("carbohydrates_serving", "carbohydrates_100g");
  const fat = pick("fat_serving", "fat_100g");
  if (!kcal) return null; // without energy it is not a meal entry
  const basis = [kcal, protein, carbs, fat].every(
    (x) => !x || x.basis === "serving",
  )
    ? "serving"
    : "100g";
  // per-serving values must be believable for one eating occasion
  const out = {
    kcal: Math.round(kcal.v),
    protein_g: round1(protein?.v ?? 0),
    carbs_g: round1(carbs?.v ?? 0),
    fat_g: round1(fat?.v ?? 0),
  };
  if (out.kcal < 0 || out.kcal > 3000) return null;
  for (const k of ["protein_g", "carbs_g", "fat_g"] as const)
    if (out[k] < 0 || out[k] > 500) return null;
  return {
    name: name.slice(0, 80),
    brand: p.brands?.split(",")[0]?.trim().slice(0, 40) || null,
    basis,
    per_serving: out,
  };
}

/** The meal item for a found product: 1 serving, from the label, never marked as an AI guess. */
export function barcodeMealItem(
  code: string,
  product: BarcodeProduct,
): MealItem {
  return {
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    catalog_key: `ean:${code}`,
    servings: 1,
    source: "barcode",
    confidence: 1,
    per_serving: product.per_serving,
  };
}
