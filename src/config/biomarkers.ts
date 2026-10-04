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

  // ── Complete blood count: differential, red-cell indices ────────────────
  b({
    key: "neutrophil_pct",
    th: "นิวโทรฟิล (%)",
    en: "Neutrophils (%)",
    unit: "%",
    normal: [40, 75],
    watch: [35, 80],
    aliases: [
      "neutrophil",
      "neutrophils",
      "neutrophil %",
      "% neutrophil",
      "neut",
      "neut %",
      "segmented neutrophil",
      "polymorphonuclear",
      "นิวโทรฟิล",
    ],
  }),
  b({
    key: "lymphocyte_pct",
    th: "ลิมโฟไซต์ (%)",
    en: "Lymphocytes (%)",
    unit: "%",
    normal: [20, 45],
    watch: [15, 50],
    aliases: [
      "lymphocyte",
      "lymphocytes",
      "lymphocyte %",
      "% lymphocyte",
      "lymph",
      "lymph %",
      "ลิมโฟไซต์",
    ],
  }),
  b({
    key: "monocyte_pct",
    th: "โมโนไซต์ (%)",
    en: "Monocytes (%)",
    unit: "%",
    normal: [2, 10],
    watch: [1, 12],
    aliases: [
      "monocyte",
      "monocytes",
      "monocyte %",
      "% monocyte",
      "mono",
      "โมโนไซต์",
    ],
  }),
  b({
    key: "eosinophil_pct",
    th: "อีโอซิโนฟิล (%)",
    en: "Eosinophils (%)",
    unit: "%",
    normal: [0, 6],
    watch: [0, 8],
    aliases: [
      "eosinophil",
      "eosinophils",
      "eosinophil %",
      "% eosinophil",
      "eos",
      "อีโอซิโนฟิล",
    ],
  }),
  b({
    key: "basophil_pct",
    th: "เบโซฟิล (%)",
    en: "Basophils (%)",
    unit: "%",
    normal: [0, 1],
    watch: [0, 2],
    aliases: [
      "basophil",
      "basophils",
      "basophil %",
      "% basophil",
      "baso",
      "เบโซฟิล",
    ],
  }),
  b({
    key: "rbc",
    th: "เม็ดเลือดแดง",
    en: "Red blood cells",
    unit: "M/uL",
    normal: [4, 5.9],
    watch: [3.6, 6.3],
    aliases: [
      "rbc",
      "red blood cell",
      "red blood cells",
      "rbc count",
      "red cell count",
      "เม็ดเลือดแดง",
    ],
    conversions: [
      { unit: "/ul", factor: 0.000001 },
      { unit: "cells/ul", factor: 0.000001 },
      { unit: "t/l", factor: 1 },
    ],
  }),
  b({
    key: "mcv",
    th: "ขนาดเม็ดเลือดแดงเฉลี่ย (MCV)",
    en: "MCV",
    unit: "fL",
    normal: [80, 100],
    watch: [75, 105],
    aliases: ["mcv", "mean corpuscular volume"],
  }),
  b({
    key: "mch",
    th: "ฮีโมโกลบินเฉลี่ยต่อเม็ดเลือด (MCH)",
    en: "MCH",
    unit: "pg",
    normal: [27, 33],
    watch: [25, 35],
    aliases: ["mch", "mean corpuscular hemoglobin"],
  }),
  b({
    key: "mchc",
    th: "ความเข้มข้นฮีโมโกลบิน (MCHC)",
    en: "MCHC",
    unit: "g/dL",
    normal: [32, 36],
    watch: [31, 37],
    aliases: ["mchc", "mean corpuscular hemoglobin concentration"],
    conversions: [{ unit: "g/l", factor: 0.1 }],
  }),
  b({
    key: "rdw",
    th: "ความกว้างการกระจายขนาดเม็ดเลือดแดง (RDW)",
    en: "RDW",
    unit: "%",
    normal: [11.5, 14.5],
    watch: [11, 16],
    aliases: ["rdw", "rdw-cv", "red cell distribution width"],
  }),
  b({
    key: "mpv",
    th: "ขนาดเกล็ดเลือดเฉลี่ย (MPV)",
    en: "MPV",
    unit: "fL",
    normal: [7.5, 11.5],
    watch: [6.5, 12.5],
    aliases: ["mpv", "mean platelet volume"],
  }),

  // ── Chemistry and others commonly on Thai check-up sheets ───────────────
  b({
    key: "albumin",
    th: "อัลบูมิน",
    en: "Albumin",
    unit: "g/dL",
    normal: [3.5, 5.2],
    watch: [3.2, 5.5],
    aliases: ["albumin", "alb", "อัลบูมิน"],
    conversions: [{ unit: "g/l", factor: 0.1 }],
  }),
  b({
    key: "total_protein",
    th: "โปรตีนรวม",
    en: "Total protein",
    unit: "g/dL",
    normal: [6, 8.3],
    watch: [5.5, 8.8],
    aliases: ["total protein", "protein total", "tp", "โปรตีนรวม"],
    conversions: [{ unit: "g/l", factor: 0.1 }],
  }),
  b({
    key: "globulin",
    th: "โกลบูลิน",
    en: "Globulin",
    unit: "g/dL",
    normal: [2, 3.9],
    watch: [1.8, 4.2],
    aliases: ["globulin", "glob", "โกลบูลิน"],
    conversions: [{ unit: "g/l", factor: 0.1 }],
  }),
  b({
    key: "direct_bilirubin",
    th: "บิลิรูบินชนิดตรง",
    en: "Direct bilirubin",
    unit: "mg/dL",
    normal: [null, 0.3],
    watch: [null, 0.5],
    aliases: ["direct bilirubin", "bilirubin direct", "d-bil", "dbil"],
    conversions: [{ unit: "umol/l", factor: 0.0585 }],
  }),
  b({
    key: "ggt",
    th: "เอนไซม์ตับ GGT",
    en: "GGT",
    unit: "U/L",
    normal: [null, 60],
    watch: [null, 100],
    aliases: ["ggt", "gamma gt", "gamma-gt", "gamma glutamyl transferase"],
  }),
  b({
    key: "calcium",
    th: "แคลเซียม",
    en: "Calcium",
    unit: "mg/dL",
    normal: [8.5, 10.5],
    watch: [8, 11],
    aliases: ["calcium", "ca", "total calcium", "แคลเซียม"],
    conversions: [{ unit: "mmol/l", factor: 4.008 }],
  }),
  b({
    key: "phosphorus",
    th: "ฟอสฟอรัส",
    en: "Phosphorus",
    unit: "mg/dL",
    normal: [2.5, 4.5],
    watch: [2, 5],
    aliases: ["phosphorus", "phosphate", "inorganic phosphorus", "ฟอสฟอรัส"],
    conversions: [{ unit: "mmol/l", factor: 3.097 }],
  }),
  b({
    key: "magnesium",
    th: "แมกนีเซียม",
    en: "Magnesium",
    unit: "mg/dL",
    normal: [1.7, 2.4],
    watch: [1.5, 2.7],
    aliases: ["magnesium", "mg", "แมกนีเซียม"],
    conversions: [{ unit: "mmol/l", factor: 2.43 }],
  }),
  b({
    key: "chloride",
    th: "คลอไรด์",
    en: "Chloride",
    unit: "mmol/L",
    normal: [98, 107],
    watch: [95, 110],
    aliases: ["chloride", "cl", "คลอไรด์"],
    conversions: [{ unit: "meq/l", factor: 1 }],
  }),
  b({
    key: "bicarbonate",
    th: "ไบคาร์บอเนต (CO₂)",
    en: "Bicarbonate (CO2)",
    unit: "mmol/L",
    normal: [22, 29],
    watch: [20, 32],
    aliases: ["bicarbonate", "hco3", "co2", "total co2", "tco2"],
    conversions: [{ unit: "meq/l", factor: 1 }],
  }),
  b({
    key: "crp",
    th: "ค่าการอักเสบ (CRP)",
    en: "CRP",
    unit: "mg/L",
    normal: [null, 5],
    watch: [null, 10],
    aliases: ["crp", "c-reactive protein", "c reactive protein"],
    conversions: [{ unit: "mg/dl", factor: 10 }],
  }),
  b({
    key: "ferritin",
    th: "เฟอริติน",
    en: "Ferritin",
    unit: "ng/mL",
    normal: [20, 300],
    watch: [10, 500],
    aliases: ["ferritin", "เฟอริติน"],
    conversions: [{ unit: "ug/l", factor: 1 }],
  }),
  b({
    key: "iron",
    th: "ธาตุเหล็กในเลือด",
    en: "Serum iron",
    unit: "ug/dL",
    normal: [50, 170],
    watch: [40, 200],
    aliases: ["iron", "serum iron", "fe", "ธาตุเหล็ก"],
    conversions: [{ unit: "umol/l", factor: 5.585 }],
  }),
  b({
    key: "vitamin_b12",
    th: "วิตามินบี 12",
    en: "Vitamin B12",
    unit: "pg/mL",
    normal: [200, 900],
    watch: [150, 1200],
    aliases: ["vitamin b12", "b12", "cobalamin", "วิตามินบี 12"],
    conversions: [
      { unit: "ng/l", factor: 1 },
      { unit: "pmol/l", factor: 1.355 },
    ],
  }),
  b({
    key: "folate",
    th: "โฟเลต",
    en: "Folate",
    unit: "ng/mL",
    normal: [3, 17],
    watch: [2, 20],
    aliases: ["folate", "folic acid", "โฟเลต"],
    conversions: [{ unit: "nmol/l", factor: 0.4413 }],
  }),
  b({
    key: "free_t4",
    th: "ไทรอกซินอิสระ (Free T4)",
    en: "Free T4",
    unit: "ng/dL",
    normal: [0.8, 1.8],
    watch: [0.7, 2],
    aliases: ["free t4", "ft4", "free thyroxine", "t4 free"],
    conversions: [{ unit: "pmol/l", factor: 0.0777 }],
  }),
];

/**
 * The catalog the app judges with: the table above (reviewed, in code) plus any
 * APPROVED extras an admin/doctor added in /admin/biomarkers (loaded from the
 * database by src/lib/lab/catalog.server.ts). Extras can only ADD: a key or alias
 * that the code table already owns is ignored, so an extra can never change how
 * a known test is judged.
 */
let byKey = new Map(BIOMARKERS.map((m) => [m.key, m]));

/** Lower-case, trimmed, punctuation-light form used to match names printed on reports. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliases(list: readonly Biomarker[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of list)
    for (const a of [...m.aliases, m.en, m.th])
      map.set(normalizeName(a), m.key);
  return map;
}

let alias = buildAliases(BIOMARKERS);

export function setExtraBiomarkers(extras: readonly Biomarker[]): void {
  const keys = new Set(BIOMARKERS.map((m) => m.key));
  const names = buildAliases(BIOMARKERS);
  const accepted: Biomarker[] = [];
  for (const m of extras) {
    if (keys.has(m.key)) continue;
    const mine = [...m.aliases, m.en, m.th].map(normalizeName);
    if (mine.some((n) => names.has(n))) continue;
    accepted.push(m);
    keys.add(m.key);
    for (const n of mine) names.set(n, m.key);
  }
  byKey = new Map([...BIOMARKERS, ...accepted].map((m) => [m.key, m]));
  alias = buildAliases([...BIOMARKERS, ...accepted]);
}

export function allBiomarkers(): readonly Biomarker[] {
  return [...byKey.values()];
}

export function biomarkerByKey(
  key: string | null | undefined,
): Biomarker | undefined {
  return key ? byKey.get(key) : undefined;
}

/** Resolve a printed name to a catalog key — exact alias only, so "Glucose, 2-hr PP" never gets fasting ranges. */
export function biomarkerKeyForName(name: string): string | null {
  return alias.get(normalizeName(name)) ?? null;
}
