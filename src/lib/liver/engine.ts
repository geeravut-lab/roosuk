import { biomarkerByKey } from "@/config/biomarkers";
import type { LabStatus } from "@/lib/lab/lab";
import { daysBetween } from "@/lib/health/dates";
import {
  CUTOFFS,
  apri,
  bmiOf,
  fib4,
  fli,
  nfs,
  type ScoreName,
  type ScoreResult,
} from "./scores";
import {
  SPECIFIC_SYMPTOMS,
  hepPositive,
  type LiverAnswers,
  type RedFlag,
} from "./questionnaire";

/**
 * The Liver Risk Engine (Phase L1): answers + the latest Lab Scan values in,
 * one of four levels out. Plain deterministic code — no model reads a number or
 * chooses a level (design doc §5.1, §8). The result holds CODES only; the
 * wording is built from the dictionary at display time (view.ts), so the same
 * stored result reads correctly in either language and can be re-explained
 * after the wording is reviewed.
 *
 * 🔒 NEEDS DOCTOR REVIEW before launch: every threshold and every rule below
 * (what raises a person from level 0 to 1 to 2 to 3). A hepatologist/internist
 * must sign them off; until then they are drafts compiled from the commonly
 * published AASLD/EASL/THASL material.
 */
export const ENGINE_VERSION = "liver-l1-2026.1-draft";

export type Level = 0 | 1 | 2 | 3;
export type Urgency = "none" | "soon" | "emergency";

/** The tests the module reads, in the units Lab Scan stores. */
export const LIVER_MARKERS = [
  "alt",
  "ast",
  "alp",
  "ggt",
  "total_bilirubin",
  "direct_bilirubin",
  "albumin",
  "platelets",
  "inr",
  "hba1c",
  "fasting_glucose",
  "triglycerides",
  "hdl",
] as const;
export type LiverMarker = (typeof LIVER_MARKERS)[number];

/** The tests whose being outside the range counts as "abnormal liver tests". */
export const CORE_MARKERS: readonly LiverMarker[] = [
  "alt",
  "ast",
  "alp",
  "ggt",
  "total_bilirubin",
  "direct_bilirubin",
  "albumin",
  "platelets",
  "inr",
];

export interface LabValue {
  /** In the catalog unit. */
  value: number;
  status: LabStatus;
}
/** Everything measured on one day (one or more reports). */
export interface LabPanel {
  date: string;
  values: Partial<Record<LiverMarker, LabValue>>;
}

/** Labs older than this are shown but never move the level (they may not describe today). */
export const FRESH_DAYS = 365;
/** Labs older than this are flagged "consider repeating". */
export const STALE_DAYS = 180;
export const YEAR_BORN_B_COHORT = 1991; // born up to 1991 (before the 1992 national hepatitis B vaccination)

/** 🔒 Severe values: ≥ this sends the person to be seen soon even with no symptoms. */
export const SEVERE = {
  /** × the upper limit of normal in the Lab Scan range */
  transaminaseTimesUln: 10,
  totalBilirubin: 3.0,
  inr: 1.5,
  albuminBelow: 2.5,
  plateletsBelow: 50,
} as const;

/** 🔒 Body-size thresholds for Asian adults (WHO Asia-Pacific). */
export const BODY = {
  bmi: 23,
  waistMale: 90,
  waistFemale: 80,
} as const;

export type ReasonCode =
  | `rf_${RedFlag}`
  | "lab_severe"
  | "lab_out_of_range"
  | "fib4_intermediate"
  | "fib4_high"
  | "apri_high"
  | "nfs_high"
  | "hep_positive"
  | "liver_history"
  | "symptoms_specific"
  | "many_factors";

export type FactorCode =
  | "body_size"
  | "diabetes"
  | "hypertension"
  | "dyslipidemia"
  | "metabolic_labs"
  | "told_fatty_liver"
  | "alcohol_daily"
  | "family_history"
  | "meds_herbs"
  | "hep_b_cohort"
  | "fli_high"
  | "symptoms";

export type GapCode =
  | "no_labs"
  | "labs_too_old"
  | "labs_stale"
  | "fib4_missing"
  | "hep_untested"
  | "no_age";

export interface Reason {
  code: ReasonCode;
  /** Names of the tests behind a lab reason, for display. */
  markers?: LiverMarker[];
}

export interface LiverResult {
  v: 1;
  engine: string;
  level: Level;
  urgency: Urgency;
  redFlags: RedFlag[];
  reasons: Reason[];
  factors: FactorCode[];
  gaps: GapCode[];
  scores: Record<ScoreName, ScoreResult>;
  /** The day of the panel the scores were computed from (null = none). */
  scoresOn: string | null;
  /** Newest fresh value of each core test that is outside its range. */
  outOfRange: { marker: LiverMarker; status: LabStatus }[];
  bmi: number | null;
  /** Doctor-visit questions this person's situation raises (codes). */
  doctorQuestions: DoctorQuestion[];
}

export type DoctorQuestion =
  | "ultrasound"
  | "elastography"
  | "hepatitis_tests"
  | "repeat_labs"
  | "medicines_review"
  | "alcohol_talk"
  | "metabolic_review"
  | "hepatitis_vaccine"
  | "symptoms_review"
  | "family_screening";

export interface LiverInput {
  /** YYYY-MM-DD (Bangkok). */
  today: string;
  answers: LiverAnswers;
  /** Newest first or any order — the engine sorts. */
  panels: readonly LabPanel[];
}

const above = (key: LiverMarker, v: number) => {
  const hi = biomarkerByKey(key)?.normal[1];
  return hi !== null && hi !== undefined && v > hi;
};
const below = (key: LiverMarker, v: number) => {
  const lo = biomarkerByKey(key)?.normal[0];
  return lo !== null && lo !== undefined && v < lo;
};

const yearOf = (isoDate: string) => Number(isoDate.slice(0, 4));

/** Newest value of one test within the fresh window, with the day it was measured. */
function latest(
  panels: readonly LabPanel[],
  key: LiverMarker,
  today: string,
): { value: number; status: LabStatus; date: string } | null {
  let best: { value: number; status: LabStatus; date: string } | null = null;
  for (const p of panels) {
    const v = p.values[key];
    if (!v || p.date > today) continue;
    if (daysBetween(p.date, today) > FRESH_DAYS) continue;
    if (!best || p.date > best.date) best = { ...v, date: p.date };
  }
  return best;
}

/** The newest fresh panel that has every one of `keys`. */
function panelWith(
  panels: readonly LabPanel[],
  keys: readonly LiverMarker[],
  today: string,
): LabPanel | null {
  let best: LabPanel | null = null;
  for (const p of panels) {
    if (p.date > today || daysBetween(p.date, today) > FRESH_DAYS) continue;
    if (!keys.every((k) => p.values[k])) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best;
}

export function assessLiver(input: LiverInput): LiverResult {
  const { today, answers: a } = input;
  const panels = input.panels.filter((p) => p.date <= today);
  const reasons: Reason[] = [];
  const factors: FactorCode[] = [];
  const gaps: GapCode[] = [];

  // ── 1. Red flags: nothing else matters ───────────────────────────────────
  for (const f of a.redFlags) reasons.push({ code: `rf_${f}` });

  // ── 2. Labs ─────────────────────────────────────────────────────────────
  const fresh = Object.fromEntries(
    LIVER_MARKERS.map((k) => [k, latest(panels, k, today)]),
  ) as Record<LiverMarker, ReturnType<typeof latest>>;
  const anyLab = panels.some((p) => Object.keys(p.values).length > 0);
  const anyFresh = LIVER_MARKERS.some((k) => fresh[k]);
  if (!anyLab) gaps.push("no_labs");
  else if (!anyFresh) gaps.push("labs_too_old");
  else {
    const newest = LIVER_MARKERS.map((k) => fresh[k]?.date ?? "")
      .sort()
      .pop()!;
    if (daysBetween(newest, today) > STALE_DAYS) gaps.push("labs_stale");
  }

  const outOfRange = CORE_MARKERS.flatMap((marker) => {
    const l = fresh[marker];
    return l && l.status !== "normal" && l.status !== "unknown"
      ? [{ marker, status: l.status }]
      : [];
  });

  const severe: LiverMarker[] = [];
  for (const m of ["alt", "ast"] as const) {
    const uln = biomarkerByKey(m)?.normal[1];
    const l = fresh[m];
    if (l && uln && l.value >= uln * SEVERE.transaminaseTimesUln)
      severe.push(m);
  }
  const tb = fresh.total_bilirubin;
  if (tb && tb.value >= SEVERE.totalBilirubin) severe.push("total_bilirubin");
  const inr = fresh.inr;
  if (inr && inr.value >= SEVERE.inr) severe.push("inr");
  const alb = fresh.albumin;
  if (alb && alb.value < SEVERE.albuminBelow) severe.push("albumin");
  const plt = fresh.platelets;
  if (plt && plt.value < SEVERE.plateletsBelow) severe.push("platelets");

  // ── 3. Scores ───────────────────────────────────────────────────────────
  const bmi = bmiOf(a.heightCm, a.weightKg);
  const ageAt = (date: string) =>
    a.birthYear === null ? null : yearOf(date) - a.birthYear;
  if (a.birthYear === null) gaps.push("no_age");

  /** Which of `keys` have no fresh value at all; if all do, the values exist but never on one day. */
  const missingOf = (keys: readonly LiverMarker[]): string[] => {
    const m = keys.filter((k) => !fresh[k]);
    return m.length ? m : ["same_day"];
  };
  const fibPanel = panelWith(panels, ["ast", "alt", "platelets"], today);
  const aprPanel = panelWith(panels, ["ast", "platelets"], today);
  const nfsPanel = panelWith(
    panels,
    ["ast", "alt", "platelets", "albumin"],
    today,
  );
  const fliPanel = panelWith(panels, ["triglycerides", "ggt"], today);
  const glucose = fresh.fasting_glucose;
  const a1c = fresh.hba1c;
  // NFS needs a yes/no on "diabetes or raised fasting glucose": the answer or a lab can say yes; only an explicit "no" says no.
  const glucoseOrDiabetes: boolean | null =
    a.diabetes === "yes" ||
    (glucose !== null && glucose.value >= CUTOFFS.nfs.glucoseFlag) ||
    (a1c !== null && a1c.value >= 6.5)
      ? true
      : a.diabetes === "no"
        ? false
        : null;
  const scores: LiverResult["scores"] = {
    fib4: fibPanel
      ? fib4({
          age: ageAt(fibPanel.date),
          ast: fibPanel.values.ast!.value,
          alt: fibPanel.values.alt!.value,
          platelets: fibPanel.values.platelets!.value,
        })
      : {
          status: "insufficient",
          missing: missingOf(["ast", "alt", "platelets"]),
        },
    apri: aprPanel
      ? apri({
          ast: aprPanel.values.ast!.value,
          platelets: aprPanel.values.platelets!.value,
        })
      : { status: "insufficient", missing: missingOf(["ast", "platelets"]) },
    nfs: nfsPanel
      ? nfs({
          age: ageAt(nfsPanel.date),
          bmi,
          glucoseOrDiabetes,
          ast: nfsPanel.values.ast!.value,
          alt: nfsPanel.values.alt!.value,
          platelets: nfsPanel.values.platelets!.value,
          albumin: nfsPanel.values.albumin!.value,
        })
      : {
          status: "insufficient",
          missing: missingOf(["ast", "alt", "platelets", "albumin"]),
        },
    fli: fliPanel
      ? fli({
          triglycerides: fliPanel.values.triglycerides!.value,
          ggt: fliPanel.values.ggt!.value,
          bmi,
          waist: a.waistCm,
        })
      : {
          status: "insufficient",
          missing: missingOf(["triglycerides", "ggt"]),
        },
  };
  if (scores.fib4.status !== "ok" && anyFresh) gaps.push("fib4_missing");

  // ── 4. Risk factors ─────────────────────────────────────────────────────
  const waistLimit =
    a.sex === "male"
      ? BODY.waistMale
      : a.sex === "female"
        ? BODY.waistFemale
        : null;
  if (
    (bmi !== null && bmi >= BODY.bmi) ||
    (a.waistCm !== null && waistLimit !== null && a.waistCm >= waistLimit)
  )
    factors.push("body_size");
  if (a.diabetes === "yes") factors.push("diabetes");
  if (a.hypertension === "yes") factors.push("hypertension");
  if (a.dyslipidemia === "yes") factors.push("dyslipidemia");
  const tg = fresh.triglycerides;
  const hdl = fresh.hdl;
  const glu = fresh.fasting_glucose;
  const a1 = fresh.hba1c;
  if (
    (tg && above("triglycerides", tg.value)) ||
    (hdl && below("hdl", hdl.value)) ||
    (glu && above("fasting_glucose", glu.value)) ||
    (a1 && above("hba1c", a1.value))
  )
    factors.push("metabolic_labs");
  if (a.history.includes("told_fatty_liver")) factors.push("told_fatty_liver");
  if (a.alcohol === "daily") factors.push("alcohol_daily");
  if (a.familyLiver === "yes") factors.push("family_history");
  if (a.meds === "yes") factors.push("meds_herbs");
  if (
    a.birthYear !== null &&
    a.birthYear <= YEAR_BORN_B_COHORT &&
    (a.hepB === "never_tested" || a.hepB === "unknown")
  )
    factors.push("hep_b_cohort");
  if (a.symptoms.length > 0) factors.push("symptoms");
  const fliScore = scores.fli;
  if (fliScore.status === "ok" && fliScore.band === "high")
    factors.push("fli_high");
  if (
    a.hepB === "never_tested" ||
    a.hepB === "unknown" ||
    a.hepC === "never_tested" ||
    a.hepC === "unknown"
  )
    gaps.push("hep_untested");

  // ── 5. Level ────────────────────────────────────────────────────────────
  const fibS = scores.fib4;
  const aprS = scores.apri;
  const nfsS = scores.nfs;
  // factors that count toward "several risk factors" (the study-derived index and the symptom list do not)
  const counted = factors.filter(
    (f) => f !== "fli_high" && f !== "symptoms" && f !== "hep_b_cohort",
  );
  const level2: Reason[] = [];
  if (outOfRange.length)
    level2.push({
      code: "lab_out_of_range",
      markers: outOfRange.map((o) => o.marker),
    });
  if (fibS.status === "ok" && fibS.band === "intermediate")
    level2.push({ code: "fib4_intermediate" });
  if (fibS.status === "ok" && fibS.band === "high")
    level2.push({ code: "fib4_high" });
  if (aprS.status === "ok" && aprS.band === "high")
    level2.push({ code: "apri_high" });
  if (nfsS.status === "ok" && nfsS.band === "high")
    level2.push({ code: "nfs_high" });
  if (hepPositive(a)) level2.push({ code: "hep_positive" });
  if (
    a.history.includes("abnormal_liver_tests") ||
    a.history.includes("liver_disease")
  )
    level2.push({ code: "liver_history" });
  if (a.symptoms.some((s) => SPECIFIC_SYMPTOMS.includes(s)))
    level2.push({ code: "symptoms_specific" });
  if (counted.length >= 3) level2.push({ code: "many_factors" });

  let level: Level;
  let urgency: Urgency = "none";
  if (a.redFlags.length > 0) {
    level = 3;
    urgency = "emergency";
  } else if (severe.length > 0) {
    level = 3;
    urgency = "soon";
    reasons.push({ code: "lab_severe", markers: severe });
  } else if (level2.length > 0) level = 2;
  else if (factors.length > 0) level = 1;
  else level = 0;
  // the lab / score / history reasons are shown whatever the level
  reasons.push(...level2);

  return {
    v: 1,
    engine: ENGINE_VERSION,
    level,
    urgency,
    redFlags: a.redFlags,
    reasons,
    factors,
    gaps,
    scores,
    scoresOn: fibPanel?.date ?? null,
    outOfRange,
    bmi,
    doctorQuestions: doctorQuestions({
      level,
      a,
      scores,
      outOfRange,
      gaps,
      factors,
    }),
  };
}

/** Questions worth taking to the visit, picked by the person's situation (codes; wording in the dictionary). */
function doctorQuestions(i: {
  level: Level;
  a: LiverAnswers;
  scores: LiverResult["scores"];
  outOfRange: LiverResult["outOfRange"];
  gaps: GapCode[];
  factors: FactorCode[];
}): DoctorQuestion[] {
  const q: DoctorQuestion[] = [];
  const fib = i.scores.fib4;
  if (
    i.level >= 2 ||
    i.factors.includes("told_fatty_liver") ||
    i.factors.includes("body_size")
  )
    q.push("ultrasound");
  if (
    (fib.status === "ok" && fib.band !== "low") ||
    (i.scores.apri.status === "ok" && i.scores.apri.band !== "low")
  )
    q.push("elastography");
  if (
    i.gaps.includes("hep_untested") ||
    hepPositive(i.a) ||
    i.factors.includes("hep_b_cohort")
  )
    q.push("hepatitis_tests");
  if (i.a.hepB === "never_tested" || i.a.hepB === "unknown")
    q.push("hepatitis_vaccine");
  if (
    i.outOfRange.length ||
    i.gaps.includes("labs_stale") ||
    i.gaps.includes("labs_too_old") ||
    i.gaps.includes("no_labs")
  )
    q.push("repeat_labs");
  if (i.a.meds === "yes") q.push("medicines_review");
  if (i.a.alcohol === "daily" || i.a.alcohol === "weekly")
    q.push("alcohol_talk");
  if (
    i.factors.some((f) =>
      [
        "diabetes",
        "hypertension",
        "dyslipidemia",
        "metabolic_labs",
        "body_size",
      ].includes(f),
    )
  )
    q.push("metabolic_review");
  if (i.a.symptoms.length) q.push("symptoms_review");
  if (i.a.familyLiver === "yes") q.push("family_screening");
  return q;
}
