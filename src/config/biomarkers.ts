/**
 * Reference ranges for Lab Scan — decided by CODE, never by the model
 * (docs/ROOSUK-MASTER-PLAN.md §8.1 layer 3). The model only reads the numbers
 * off the report; this table decides "normal / worth watching / abnormal".
 *
 * ⚠ DRAFT: generic adult ranges compiled from commonly published thresholds,
 * unisex (the envelope of the male and female ranges) because the app does not
 * know sex or age yet. They must be reviewed and signed off by the medical
 * advisor before real users sign up (master plan §13). The report's OWN printed
 * range is shown next to ours so the user can compare, and nothing here is a
 * diagnosis: a value outside a range is a reason to talk to a doctor.
 *
 * Bounds are inclusive; `null` = open. `watch` is the wider band around
 * `normal`: outside `watch` is "abnormal".
 */
export type Range = readonly [number | null, number | null];

export interface Biomarker {
  key: string;
  th: string;
  en: string;
  /** The unit the ranges are written in. */
  unit: string;
  normal: Range;
  watch: Range;
  /** Lower-case names as printed on Thai/English lab sheets. */
  aliases: readonly string[];
  /** Other units a report may use → factor that converts them to `unit`. */
  conversions?: readonly { unit: string; factor: number }[];
}

const b = (m: Biomarker): Biomarker => m;

export const BIOMARKERS: readonly Biomarker[] = [
  b({
    key: "fasting_glucose",
    th: "น้ำตาลในเลือดหลังอดอาหาร",
    en: "Fasting glucose",
    unit: "mg/dL",
    normal: [70, 99],
    watch: [60, 125],
    aliases: [
      "fbs",
      "fpg",
      "fasting glucose",
      "fasting blood sugar",
      "fasting plasma glucose",
      "glucose",
      "น้ำตาลในเลือด",
      "น้ำตาลหลังอดอาหาร",
    ],
    conversions: [{ unit: "mmol/l", factor: 18.016 }],
  }),
  b({
    key: "hba1c",
    th: "น้ำตาลเฉลี่ยสะสม (HbA1c)",
    en: "HbA1c",
    unit: "%",
    normal: [null, 5.6],
    watch: [null, 6.4],
    aliases: [
      "hba1c",
      "hb a1c",
      "a1c",
      "hemoglobin a1c",
      "glycated hemoglobin",
      "น้ำตาลเฉลี่ยสะสม",
    ],
  }),
  b({
    key: "total_cholesterol",
    th: "คอเลสเตอรอลรวม",
    en: "Total cholesterol",
    unit: "mg/dL",
    normal: [null, 199],
    watch: [null, 239],
    aliases: [
      "cholesterol",
      "total cholesterol",
      "tc",
      "chol",
      "คอเลสเตอรอล",
      "คอเลสเตอรอลรวม",
    ],
    conversions: [{ unit: "mmol/l", factor: 38.67 }],
  }),
  b({
    key: "ldl",
    th: "ไขมันเลว (LDL)",
    en: "LDL cholesterol",
    unit: "mg/dL",
    normal: [null, 129],
    watch: [null, 159],
    aliases: ["ldl", "ldl-c", "ldl cholesterol", "ldl-cholesterol", "แอลดีแอล"],
    conversions: [{ unit: "mmol/l", factor: 38.67 }],
  }),
  b({
    key: "hdl",
    th: "ไขมันดี (HDL)",
    en: "HDL cholesterol",
    unit: "mg/dL",
    normal: [40, null],
    watch: [35, null],
    aliases: ["hdl", "hdl-c", "hdl cholesterol", "hdl-cholesterol", "เอชดีแอล"],
    conversions: [{ unit: "mmol/l", factor: 38.67 }],
  }),
  b({
    key: "triglycerides",
    th: "ไตรกลีเซอไรด์",
    en: "Triglycerides",
    unit: "mg/dL",
    normal: [null, 149],
    watch: [null, 199],
    aliases: ["triglyceride", "triglycerides", "tg", "ไตรกลีเซอไรด์"],
    conversions: [{ unit: "mmol/l", factor: 88.57 }],
  }),
  b({
    key: "creatinine",
    th: "ครีเอตินิน",
    en: "Creatinine",
    unit: "mg/dL",
    normal: [0.6, 1.3],
    watch: [0.5, 1.5],
    aliases: ["creatinine", "cr", "ครีเอตินิน"],
    conversions: [{ unit: "umol/l", factor: 0.0113 }],
  }),
  b({
    key: "egfr",
    th: "อัตราการกรองของไต (eGFR)",
    en: "eGFR",
    unit: "mL/min/1.73m²",
    normal: [90, null],
    watch: [60, null],
    aliases: ["egfr", "gfr", "estimated gfr"],
  }),
  b({
    key: "bun",
    th: "ยูเรียไนโตรเจน (BUN)",
    en: "BUN",
    unit: "mg/dL",
    normal: [7, 20],
    watch: [5, 25],
    aliases: ["bun", "blood urea nitrogen", "ยูเรียไนโตรเจน"],
  }),
  b({
    key: "alt",
    th: "เอนไซม์ตับ ALT",
    en: "ALT",
    unit: "U/L",
    normal: [null, 40],
    watch: [null, 80],
    aliases: ["alt", "sgpt", "gpt", "alanine aminotransferase"],
  }),
  b({
    key: "ast",
    th: "เอนไซม์ตับ AST",
    en: "AST",
    unit: "U/L",
    normal: [null, 40],
    watch: [null, 80],
    aliases: ["ast", "sgot", "got", "aspartate aminotransferase"],
  }),
  b({
    key: "alp",
    th: "เอนไซม์ตับ ALP",
    en: "ALP",
    unit: "U/L",
    normal: [40, 130],
    watch: [30, 200],
    aliases: ["alp", "alkaline phosphatase"],
  }),
  b({
    key: "total_bilirubin",
    th: "บิลิรูบินรวม",
    en: "Total bilirubin",
    unit: "mg/dL",
    normal: [0.1, 1.2],
    watch: [0, 2],
    aliases: ["total bilirubin", "bilirubin total", "t. bilirubin"],
    conversions: [{ unit: "umol/l", factor: 0.0585 }],
  }),
  b({
    key: "uric_acid",
    th: "กรดยูริก",
    en: "Uric acid",
    unit: "mg/dL",
    normal: [2.4, 7],
    watch: [2, 8],
    aliases: ["uric acid", "กรดยูริก", "ยูริก"],
    conversions: [{ unit: "umol/l", factor: 0.0168 }],
  }),
  b({
    key: "hemoglobin",
    th: "ฮีโมโกลบิน",
    en: "Hemoglobin",
    unit: "g/dL",
    normal: [12, 17.5],
    watch: [11, 18.5],
    aliases: ["hemoglobin", "haemoglobin", "hb", "hgb", "ฮีโมโกลบิน"],
    conversions: [{ unit: "g/l", factor: 0.1 }],
  }),
  b({
    key: "hematocrit",
    th: "ฮีมาโทคริต",
    en: "Hematocrit",
    unit: "%",
    normal: [36, 52],
    watch: [33, 55],
    aliases: ["hematocrit", "haematocrit", "hct", "ฮีมาโทคริต"],
  }),
  b({
    key: "wbc",
    th: "เม็ดเลือดขาว",
    en: "White blood cells",
    unit: "K/uL",
    normal: [4, 11],
    watch: [3, 13],
    aliases: [
      "wbc",
      "white blood cell",
      "white blood cells",
      "wbc count",
      "เม็ดเลือดขาว",
    ],
    conversions: [
      { unit: "/ul", factor: 0.001 },
      { unit: "cells/ul", factor: 0.001 },
    ],
  }),
  b({
    key: "platelets",
    th: "เกล็ดเลือด",
    en: "Platelets",
    unit: "K/uL",
    normal: [150, 450],
    watch: [120, 500],
    aliases: ["platelet", "platelets", "plt", "platelet count", "เกล็ดเลือด"],
    conversions: [
      { unit: "/ul", factor: 0.001 },
      { unit: "cells/ul", factor: 0.001 },
    ],
  }),
  b({
    key: "tsh",
    th: "ฮอร์โมนไทรอยด์ (TSH)",
    en: "TSH",
    unit: "mIU/L",
    normal: [0.4, 4],
    watch: [0.2, 6],
    aliases: ["tsh", "thyroid stimulating hormone"],
    conversions: [
      { unit: "uiu/ml", factor: 1 },
      { unit: "miu/ml", factor: 1000 },
    ],
  }),
  b({
    key: "vitamin_d",
    th: "วิตามินดี",
    en: "Vitamin D",
    unit: "ng/mL",
    normal: [30, 100],
    watch: [20, 100],
    aliases: [
      "vitamin d",
      "25-oh vitamin d",
      "25-hydroxy vitamin d",
      "25(oh)d",
      "วิตามินดี",
    ],
    conversions: [{ unit: "nmol/l", factor: 0.4 }],
  }),
  b({
    key: "sodium",
    th: "โซเดียม",
    en: "Sodium",
    unit: "mmol/L",
    normal: [135, 145],
    watch: [130, 150],
    aliases: ["sodium", "na", "โซเดียม"],
    conversions: [{ unit: "meq/l", factor: 1 }],
  }),
  b({
    key: "potassium",
    th: "โพแทสเซียม",
    en: "Potassium",
    unit: "mmol/L",
    normal: [3.5, 5.1],
    watch: [3.2, 5.5],
    aliases: ["potassium", "k", "โพแทสเซียม"],
    conversions: [{ unit: "meq/l", factor: 1 }],
  }),
];

const BY_KEY = new Map(BIOMARKERS.map((m) => [m.key, m]));

export function biomarkerByKey(
  key: string | null | undefined,
): Biomarker | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** Lower-case, trimmed, punctuation-light form used to match names printed on reports. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS = new Map<string, string>();
for (const m of BIOMARKERS) {
  for (const a of [...m.aliases, m.en, m.th])
    ALIAS.set(normalizeName(a), m.key);
}

/** Resolve a printed name to a catalog key — exact alias only, so "Glucose, 2-hr PP" never gets fasting ranges. */
export function biomarkerKeyForName(name: string): string | null {
  return ALIAS.get(normalizeName(name)) ?? null;
}
