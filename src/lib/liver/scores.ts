/**
 * Liver risk scores — deterministic code, never the LLM
 * (docs/RooSuk Liver Health Module Design.pdf §5.1, §8).
 *
 * These are SCREENING tools that say who should be looked at more closely. They
 * are not a diagnosis, and no sentence built from them may say what a person
 * "has". Every cut-off below is the commonly published one and is marked
 * 🔒 NEEDS DOCTOR REVIEW: a hepatologist / internist must confirm the values and
 * the Thai-population caveats (THASL, AASLD, EASL) before the module goes live.
 *
 * Inputs are in the units the Lab Scan catalog stores (src/config/biomarkers.ts):
 *   AST, ALT, GGT  U/L · platelets  10^3/µL (= 10^9/L) · albumin  g/dL
 *   triglycerides  mg/dL · glucose  mg/dL · waist  cm · BMI  kg/m²
 */

/** 🔒 NEEDS DOCTOR REVIEW — all cut-offs and plausibility limits in this file. */
export const CUTOFFS = {
  fib4: {
    /** below this: low risk of advanced fibrosis */
    low: 1.3,
    /** from age 65 the low cut-off is higher (FIB-4 over-calls older people) */
    lowAge65: 2.0,
    /** above this: high */
    high: 2.67,
    age65: 65,
    /** FIB-4 was derived in 35–65: outside that it is less reliable (a note, not a block) */
    reliableFrom: 35,
    /** the youngest age it is calculated for */
    minAge: 18,
    maxAge: 110,
  },
  apri: {
    /** AST upper limit of normal used by the formula (U/L); same as the Lab Scan range's top */
    astUln: 40,
    low: 0.5,
    high: 1.5,
  },
  nfs: {
    low: -1.455,
    /** from age 65 the low cut-off is higher */
    lowAge65: 0.12,
    high: 0.676,
    age65: 65,
    /** fasting glucose at/above which the "impaired fasting glucose or diabetes" term is 1 */
    glucoseFlag: 110,
  },
  fli: {
    low: 30,
    high: 60,
  },
} as const;

/** Plausible values: anything outside is treated as a unit / typing mistake, never computed. */
export const PLAUSIBLE = {
  alt: [1, 10000],
  ast: [1, 10000],
  ggt: [1, 5000],
  platelets: [10, 1500],
  albumin: [1, 7],
  triglycerides: [10, 5000],
  bmi: [12, 80],
  waist: [40, 200],
} as const;

export type Band = "low" | "intermediate" | "high";
export type ScoreName = "fib4" | "apri" | "nfs" | "fli";

export type ScoreResult =
  | {
      status: "ok";
      value: number;
      band: Band;
      /** FIB-4 only: the age rule that changed how it should be read */
      ageNote?: "under35" | "over65";
    }
  | { status: "insufficient"; missing: string[] }
  | { status: "invalid"; fields: string[] };

const round = (n: number, d: number) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
const inRange = (v: number, [lo, hi]: readonly [number, number]) =>
  Number.isFinite(v) && v >= lo && v <= hi;

type Num = number | null | undefined;
const has = (v: Num): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Collect what is absent and what is outside a plausible range, then decide whether the score may be computed. */
function gate(
  fields: Record<string, { v: Num; range?: readonly [number, number] }>,
): { ok: true } | { ok: false; result: ScoreResult } {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const [name, f] of Object.entries(fields)) {
    if (!has(f.v)) missing.push(name);
    else if (f.range && !inRange(f.v, f.range)) invalid.push(name);
  }
  if (invalid.length)
    return { ok: false, result: { status: "invalid", fields: invalid } };
  if (missing.length)
    return { ok: false, result: { status: "insufficient", missing } };
  return { ok: true };
}

/** FIB-4 = (age × AST) / (platelets × √ALT). Bands use the value rounded to 2 decimals, as shown. */
export function fib4(i: {
  age: Num;
  ast: Num;
  alt: Num;
  platelets: Num;
}): ScoreResult {
  const g = gate({
    age: { v: i.age, range: [CUTOFFS.fib4.minAge, CUTOFFS.fib4.maxAge] },
    ast: { v: i.ast, range: PLAUSIBLE.ast },
    alt: { v: i.alt, range: PLAUSIBLE.alt },
    platelets: { v: i.platelets, range: PLAUSIBLE.platelets },
  });
  if (!g.ok) return g.result;
  const age = i.age as number;
  const value = round(
    (age * (i.ast as number)) /
      ((i.platelets as number) * Math.sqrt(i.alt as number)),
    2,
  );
  const over65 = age >= CUTOFFS.fib4.age65;
  const low = over65 ? CUTOFFS.fib4.lowAge65 : CUTOFFS.fib4.low;
  const band: Band =
    value < low ? "low" : value > CUTOFFS.fib4.high ? "high" : "intermediate";
  return {
    status: "ok",
    value,
    band,
    ageNote: over65
      ? "over65"
      : age < CUTOFFS.fib4.reliableFrom
        ? "under35"
        : undefined,
  };
}

/** APRI = (AST / AST upper limit of normal) / platelets × 100. */
export function apri(i: { ast: Num; platelets: Num }): ScoreResult {
  const g = gate({
    ast: { v: i.ast, range: PLAUSIBLE.ast },
    platelets: { v: i.platelets, range: PLAUSIBLE.platelets },
  });
  if (!g.ok) return g.result;
  const value = round(
    ((i.ast as number) / CUTOFFS.apri.astUln / (i.platelets as number)) * 100,
    2,
  );
  const band: Band =
    value < CUTOFFS.apri.low
      ? "low"
      : value > CUTOFFS.apri.high
        ? "high"
        : "intermediate";
  return { status: "ok", value, band };
}

/**
 * NAFLD Fibrosis Score = −1.675 + 0.037·age + 0.094·BMI + 1.13·(IFG or diabetes)
 *   + 0.99·AST/ALT − 0.013·platelets − 0.66·albumin(g/dL).
 * Only meaningful for people with suspected fatty liver; it is shown as a second look, not a verdict.
 */
export function nfs(i: {
  age: Num;
  bmi: Num;
  /** true when the person has diabetes or a fasting glucose ≥ 110 mg/dL; null = not known */
  glucoseOrDiabetes: boolean | null;
  ast: Num;
  alt: Num;
  platelets: Num;
  albumin: Num;
}): ScoreResult {
  const g = gate({
    age: { v: i.age, range: [CUTOFFS.fib4.minAge, CUTOFFS.fib4.maxAge] },
    bmi: { v: i.bmi, range: PLAUSIBLE.bmi },
    ast: { v: i.ast, range: PLAUSIBLE.ast },
    alt: { v: i.alt, range: PLAUSIBLE.alt },
    platelets: { v: i.platelets, range: PLAUSIBLE.platelets },
    albumin: { v: i.albumin, range: PLAUSIBLE.albumin },
    glucoseOrDiabetes: {
      v: i.glucoseOrDiabetes === null ? null : 1,
    },
  });
  if (!g.ok) return g.result;
  const age = i.age as number;
  const value = round(
    -1.675 +
      0.037 * age +
      0.094 * (i.bmi as number) +
      1.13 * (i.glucoseOrDiabetes ? 1 : 0) +
      0.99 * ((i.ast as number) / (i.alt as number)) -
      0.013 * (i.platelets as number) -
      0.66 * (i.albumin as number),
    2,
  );
  const low = age >= CUTOFFS.nfs.age65 ? CUTOFFS.nfs.lowAge65 : CUTOFFS.nfs.low;
  const band: Band =
    value < low ? "low" : value > CUTOFFS.nfs.high ? "high" : "intermediate";
  return { status: "ok", value, band };
}

/**
 * Fatty Liver Index (Bedogni 2006): 0–100.
 *   y = 0.953·ln(TG) + 0.139·BMI + 0.718·ln(GGT) + 0.053·waist − 15.745
 *   FLI = e^y / (1 + e^y) × 100
 * Reads as "how likely it is that the liver is carrying extra fat", to prompt a
 * conversation; it never says a person has a condition.
 */
export function fli(i: {
  triglycerides: Num;
  bmi: Num;
  ggt: Num;
  waist: Num;
}): ScoreResult {
  const g = gate({
    triglycerides: { v: i.triglycerides, range: PLAUSIBLE.triglycerides },
    bmi: { v: i.bmi, range: PLAUSIBLE.bmi },
    ggt: { v: i.ggt, range: PLAUSIBLE.ggt },
    waist: { v: i.waist, range: PLAUSIBLE.waist },
  });
  if (!g.ok) return g.result;
  const y =
    0.953 * Math.log(i.triglycerides as number) +
    0.139 * (i.bmi as number) +
    0.718 * Math.log(i.ggt as number) +
    0.053 * (i.waist as number) -
    15.745;
  const value = round((Math.exp(y) / (1 + Math.exp(y))) * 100, 0);
  const band: Band =
    value < CUTOFFS.fli.low
      ? "low"
      : value >= CUTOFFS.fli.high
        ? "high"
        : "intermediate";
  return { status: "ok", value, band };
}

/** Body-mass index from centimetres and kilograms, or null when either is missing or implausible. */
export function bmiOf(heightCm: Num, weightKg: Num): number | null {
  if (!has(heightCm) || !has(weightKg)) return null;
  if (heightCm < 100 || heightCm > 230 || weightKg < 25 || weightKg > 300)
    return null;
  const m = heightCm / 100;
  return round(weightKg / (m * m), 1);
}
