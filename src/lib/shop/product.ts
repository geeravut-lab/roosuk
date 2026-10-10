import { z } from "zod";

/**
 * Supplement catalog, the pure side: what a product may say and look like, how a
 * CSV row becomes one, and the screen that keeps disease claims out of a supplement
 * page (a supplement is not a medicine, and this app never promises a cure or a
 * body-shape result).
 */
export const FOCUS_TAGS = [
  "sleep",
  "energy",
  "nutrition",
  "move",
  "stress",
  "general",
] as const;
export type FocusTag = (typeof FOCUS_TAGS)[number];

export function isFocusTag(v: unknown): v is FocusTag {
  return typeof v === "string" && (FOCUS_TAGS as readonly string[]).includes(v);
}

export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** A phrase a supplement page must not carry: cure/treat/prevent a disease, or promise weight loss. */
const CLAIMS =
  /รักษา(โรค|มะเร็ง|เบาหวาน|ความดัน|ไขมัน|หัวใจ)|หายขาด|ป้องกัน(โรค|มะเร็ง|เบาหวาน)|ลดน้ำหนัก|ลดพุง|เผาผลาญไขมัน|ผอม|\bcures?\b|\bcuring\b|\btreat(s|ing)?\b[^.\n]{0,25}\b(cancer|diabetes|hypertension|disease)\b|prevents? (cancer|diabetes|disease)|weight[- ]?loss|fat[- ]?burn|lose weight/i;

export function violatesProductClaims(text: string): boolean {
  return CLAIMS.test(text);
}

export const TEXT_FIELDS = [
  "name_th",
  "name_en",
  "brand",
  "summary_th",
  "summary_en",
  "description_th",
  "description_en",
  "ingredients",
  "usage_note",
  "caution",
  "serving",
] as const;

export interface ProductInput {
  sku: string;
  name_th: string;
  name_en: string | null;
  brand: string | null;
  summary_th: string | null;
  summary_en: string | null;
  description_th: string | null;
  description_en: string | null;
  ingredients: string | null;
  usage_note: string | null;
  caution: string | null;
  fda_no: string | null;
  serving: string | null;
  price_thb: number;
  compare_at_thb: number | null;
  stock: number | null;
  focus_tags: FocusTag[];
  active: boolean;
  sort: number;
  /** sold only to a person whose identity was verified (e-KYC); left out = leave as it is */
  requires_kyc?: boolean;
}

export type ProductField = keyof ProductInput | "partner" | "claims";

const MAX: Record<string, number> = {
  name_th: 120,
  name_en: 120,
  brand: 80,
  summary_th: 300,
  summary_en: 300,
  description_th: 4000,
  description_en: 4000,
  ingredients: 2000,
  usage_note: 1000,
  caution: 1000,
  fda_no: 40,
  serving: 80,
};

const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
const orNull = (v: unknown): string | null => clean(v) || null;
const truthy = (v: unknown) =>
  typeof v === "string" && /^(1|true|yes|on|y|ใช่|เปิด)$/i.test(v.trim());
const intOrNull = (v: unknown): number | null | "bad" => {
  const s = clean(v);
  if (s === "") return null;
  return /^\d{1,9}$/.test(s) ? Number(s) : "bad";
};

/** Validates one product from any source (a form, a CSV row). `get` reads a field by name. */
export function parseProduct(
  get: (key: string) => unknown,
): { ok: true; value: ProductInput } | { ok: false; fields: ProductField[] } {
  const bad = new Set<ProductField>();
  const sku = clean(get("sku"));
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(sku)) bad.add("sku");
  const name_th = clean(get("name_th"));
  if (!name_th || name_th.length > MAX.name_th) bad.add("name_th");

  const text: Record<string, string | null> = {};
  for (const f of TEXT_FIELDS) {
    if (f === "name_th") continue;
    text[f] = orNull(get(f));
    if (text[f] && text[f]!.length > MAX[f]) bad.add(f);
  }
  const fda_no = orNull(get("fda_no"));
  if (fda_no && fda_no.length > MAX.fda_no) bad.add("fda_no");

  const price = intOrNull(get("price_thb"));
  if (price === null || price === "bad" || price < 1 || price > 1_000_000)
    bad.add("price_thb");
  const compare = intOrNull(get("compare_at_thb"));
  if (compare === "bad") bad.add("compare_at_thb");
  else if (compare !== null && typeof price === "number" && compare <= price)
    bad.add("compare_at_thb");
  const stock = intOrNull(get("stock"));
  if (stock === "bad") bad.add("stock");
  const sortRaw = intOrNull(get("sort"));
  if (sortRaw === "bad") bad.add("sort");

  const tagsRaw = get("tags") ?? get("focus_tags");
  const tags = (
    Array.isArray(tagsRaw) ? tagsRaw.map(String) : clean(tagsRaw).split(/[;,|]/)
  )
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tags.some((t) => !isFocusTag(t))) bad.add("focus_tags");
  const focus_tags = FOCUS_TAGS.filter((t) => tags.includes(t));

  // Disease and body-shape claims are checked on every public text.
  const shown = [name_th, ...Object.values(text)].filter(Boolean) as string[];
  if (shown.some(violatesProductClaims)) bad.add("claims");

  if (bad.size) return { ok: false, fields: [...bad] };
  return {
    ok: true,
    value: {
      sku,
      name_th,
      name_en: text.name_en,
      brand: text.brand,
      summary_th: text.summary_th,
      summary_en: text.summary_en,
      description_th: text.description_th,
      description_en: text.description_en,
      ingredients: text.ingredients,
      usage_note: text.usage_note,
      caution: text.caution,
      fda_no,
      serving: text.serving,
      price_thb: price as number,
      compare_at_thb: compare as number | null,
      stock: stock as number | null,
      focus_tags,
      active: truthy(get("active")),
      sort: typeof sortRaw === "number" ? sortRaw : 100,
      // absent or blank = unchanged, so a re-import can never silently drop the requirement
      ...(clean(get("requires_kyc")) === ""
        ? {}
        : { requires_kyc: truthy(get("requires_kyc")) }),
    },
  };
}

// ── CSV ─────────────────────────────────────────────────────────────────────
export const PRODUCT_CSV_COLUMNS = [
  "sku",
  "partner",
  "name_th",
  "name_en",
  "brand",
  "price_thb",
  "compare_at_thb",
  "stock",
  "summary_th",
  "summary_en",
  "description_th",
  "description_en",
  "ingredients",
  "usage_note",
  "caution",
  "fda_no",
  "serving",
  "tags",
  "active",
  "requires_kyc",
  "images",
] as const;

export const PRODUCT_CSV_TEMPLATE =
  PRODUCT_CSV_COLUMNS.join(",") +
  "\n" +
  [
    "MAG-001",
    "Partner One",
    "แมกนีเซียมกลีซิเนต",
    "Magnesium glycinate",
    "BrandX",
    "390",
    "",
    "50",
    "เสริมแมกนีเซียมสำหรับผู้ที่ได้รับไม่พอจากอาหาร",
    "",
    "ผลิตภัณฑ์เสริมอาหาร อ่านฉลากก่อนใช้",
    "",
    "แมกนีเซียมกลีซิเนต",
    "ตามฉลาก",
    "ปรึกษาแพทย์หรือเภสัชกรหากมีโรคประจำตัว ตั้งครรภ์ หรือใช้ยา",
    "12-1-12345-1-0001",
    "60 แคปซูล",
    "sleep;stress",
    "yes",
    "",
    "MAG-001_1.jpg;MAG-001_2.jpg",
  ].join(",") +
  "\n";

export const CSV_MAX_PRODUCTS = 300;

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export interface CsvProduct {
  line: number;
  partner: string;
  images: string[];
  value: ProductInput;
}
export interface CsvIssue {
  line: number;
  sku: string;
  fields: ProductField[];
}

export type CsvResult =
  | { ok: true; products: CsvProduct[]; issues: CsvIssue[] }
  | { ok: false; reason: "header" | "empty" | "too_many" };

/** A product CSV: one row per product; bad rows are listed, good ones are kept. */
export function parseProductCsv(text: string): CsvResult {
  const rows = splitCsv(text);
  if (rows.length === 0) return { ok: false, reason: "empty" };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (
    col("sku") < 0 ||
    col("partner") < 0 ||
    col("name_th") < 0 ||
    col("price_thb") < 0
  )
    return { ok: false, reason: "header" };
  if (rows.length - 1 > CSV_MAX_PRODUCTS)
    return { ok: false, reason: "too_many" };
  const products: CsvProduct[] = [];
  const issues: CsvIssue[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (k: string) => (col(k) >= 0 ? r[col(k)] : undefined);
    const parsed = parseProduct(get);
    const sku = clean(get("sku"));
    const partner = clean(get("partner"));
    const fields: ProductField[] = parsed.ok ? [] : [...parsed.fields];
    if (!partner) fields.push("partner");
    if (sku && seen.has(sku.toLowerCase())) fields.push("sku");
    if (sku) seen.add(sku.toLowerCase());
    if (!parsed.ok || fields.length) {
      issues.push({ line, sku, fields: [...new Set(fields)] });
      return;
    }
    products.push({
      line,
      partner,
      images: clean(get("images"))
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_IMAGES),
      value: parsed.value,
    });
  });
  return { ok: true, products, issues };
}

/** Which of an image file name's products it belongs to, when the CSV has no `images` column: SKU_1.jpg, SKU-2.png, SKU.webp. */
export function imageSkuOf(fileName: string): string | null {
  const base = fileName.split("/").pop() ?? fileName;
  const m = /^(.+?)(?:[_-]\d{1,2})?\.(?:jpe?g|png|webp)$/i.exec(base);
  return m ? m[1] : null;
}

export const productFormSchema = z.object({ sku: z.string() });
