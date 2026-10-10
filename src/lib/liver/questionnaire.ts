import { z } from "zod";

/**
 * The Liver Health Check questionnaire, as data. Order of the screen is the
 * order of the design doc: red flags FIRST (anything there ends the check at
 * once with an emergency message), then body size, metabolic history, liver and
 * hepatitis history, alcohol, medicines/herbs (a yes/no flag only — no names,
 * no advice), and chronic symptoms. Questions that are already known (birth
 * year, sex, alcohol, conditions from the health profile; hepatitis status from
 * the last check) arrive pre-filled instead of being asked again.
 *
 * Answers are stored as CODES; every sentence lives in the dictionary.
 */

export const RED_FLAGS = [
  "jaundice",
  "ruq_pain",
  "gi_bleed",
  "ascites_breathless",
  "confusion",
] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

/** Chronic symptoms. The first three are the ones that, on their own, warrant a follow-up (🔒 doctor review). */
export const SYMPTOMS = [
  "dark_urine_pale_stool",
  "itching",
  "weight_loss",
  "fatigue",
  "ruq_discomfort",
  "appetite_loss",
] as const;
export type Symptom = (typeof SYMPTOMS)[number];
export const SPECIFIC_SYMPTOMS: readonly Symptom[] = [
  "dark_urine_pale_stool",
  "itching",
  "weight_loss",
];

export const HISTORY = [
  "told_fatty_liver",
  "abnormal_liver_tests",
  "liver_disease",
] as const;
export type History = (typeof HISTORY)[number];

export const TRI = ["yes", "no", "unsure"] as const;
export type Tri = (typeof TRI)[number];

export const HEP_B = [
  "unknown",
  "never_tested",
  "negative",
  "positive",
  "vaccinated",
] as const;
export type HepB = (typeof HEP_B)[number];
export const HEP_C = [
  "unknown",
  "never_tested",
  "negative",
  "positive",
] as const;
export type HepC = (typeof HEP_C)[number];

export const ALCOHOL = ["none", "occasional", "weekly", "daily"] as const;
export type AlcoholUse = (typeof ALCOHOL)[number];

export const SEXES = ["female", "male"] as const;
export type LiverSex = (typeof SEXES)[number];

export interface LiverAnswers {
  redFlags: RedFlag[];
  birthYear: number | null;
  sex: LiverSex | null;
  heightCm: number | null;
  weightKg: number | null;
  waistCm: number | null;
  diabetes: Tri;
  hypertension: Tri;
  dyslipidemia: Tri;
  history: History[];
  familyLiver: Tri;
  hepB: HepB;
  hepC: HepC;
  alcohol: AlcoholUse | null;
  meds: Tri;
  symptoms: Symptom[];
}

/** What is already known about the person; used to pre-fill and to fill gaps. */
export interface LiverDefaults {
  birthYear: number | null;
  sex: LiverSex | null;
  alcohol: AlcoholUse | null;
  conditions: readonly string[];
  hepB: HepB;
  hepC: HepC;
}

const subset = <T extends string>(values: readonly T[]) =>
  z.array(z.string()).transform((xs) => values.filter((v) => xs.includes(v)));

/** The shape stored in `liver_assessments.answers` — validated again on the way out. */
export const answersSchema = z.object({
  redFlags: subset(RED_FLAGS),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  sex: z.enum(SEXES).nullable(),
  heightCm: z.number().min(100).max(230).nullable(),
  weightKg: z.number().min(25).max(300).nullable(),
  waistCm: z.number().min(40).max(200).nullable(),
  diabetes: z.enum(TRI),
  hypertension: z.enum(TRI),
  dyslipidemia: z.enum(TRI),
  history: subset(HISTORY),
  familyLiver: z.enum(TRI),
  hepB: z.enum(HEP_B),
  hepC: z.enum(HEP_C),
  alcohol: z.enum(ALCOHOL).nullable(),
  meds: z.enum(TRI),
  symptoms: subset(SYMPTOMS),
});

export function parseStoredAnswers(value: unknown): LiverAnswers | null {
  const r = answersSchema.safeParse(value);
  return r.success ? (r.data as LiverAnswers) : null;
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const many = (form: FormData, name: string) =>
  form.getAll(name).filter((v): v is string => typeof v === "string");

/** "" → null; a number outside [min, max] → undefined (the whole form is refused). */
function numberField(
  form: FormData,
  name: string,
  min: number,
  max: number,
): number | null | undefined {
  const raw = text(form, name).replace(/,/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function oneOf<T extends string>(
  values: readonly T[],
  raw: string,
): T | undefined {
  return (values as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/**
 * Form → answers. Red flags are read first: a person who ticked one gets the
 * emergency result even if they answered nothing else, so every other field is
 * then optional. Without a red flag everything except body size is required.
 */
export function parseLiverForm(
  form: FormData,
  known: LiverDefaults,
): { ok: true; answers: LiverAnswers } | { ok: false } {
  const flagsRaw = many(form, "redFlags");
  const redFlags = RED_FLAGS.filter((f) => flagsRaw.includes(f));
  // "none of these" must be an explicit answer — silence is not an answer.
  if (redFlags.length === 0 && !flagsRaw.includes("none")) return { ok: false };
  const urgent = redFlags.length > 0;

  const birthYear = numberField(form, "birthYear", 1900, 2100);
  const heightCm = numberField(form, "heightCm", 100, 230);
  const weightKg = numberField(form, "weightKg", 25, 300);
  const waistCm = numberField(form, "waistCm", 40, 200);
  if (
    birthYear === undefined ||
    heightCm === undefined ||
    weightKg === undefined ||
    waistCm === undefined
  )
    return { ok: false };

  const tri = (name: string): Tri | undefined => {
    const v = oneOf(TRI, text(form, name));
    if (v) return v;
    // pre-filled from the health profile when the person did not touch it
    return urgent ? "unsure" : undefined;
  };
  const diabetes = tri("diabetes");
  const hypertension = tri("hypertension");
  const dyslipidemia = tri("dyslipidemia");
  const familyLiver = tri("familyLiver");
  const meds = tri("meds");
  const hepB =
    oneOf(HEP_B, text(form, "hepB")) ?? (urgent ? known.hepB : undefined);
  const hepC =
    oneOf(HEP_C, text(form, "hepC")) ?? (urgent ? known.hepC : undefined);
  const alcohol =
    oneOf(ALCOHOL, text(form, "alcohol")) ??
    (urgent ? known.alcohol : undefined);
  const sex = oneOf(SEXES, text(form, "sex")) ?? known.sex ?? null;
  const histRaw = many(form, "history");
  const symRaw = many(form, "symptoms");
  // "none" has to be chosen explicitly for the two multi-answer questions too.
  if (!urgent && (!(histRaw.length > 0) || !(symRaw.length > 0)))
    return { ok: false };

  const age = birthYear ?? known.birthYear;
  if (
    !urgent &&
    (age === null ||
      !diabetes ||
      !hypertension ||
      !dyslipidemia ||
      !familyLiver ||
      !meds ||
      !hepB ||
      !hepC ||
      !alcohol)
  )
    return { ok: false };

  return {
    ok: true,
    answers: {
      redFlags,
      birthYear: age,
      sex,
      heightCm,
      weightKg,
      waistCm,
      diabetes: diabetes ?? "unsure",
      hypertension: hypertension ?? "unsure",
      dyslipidemia: dyslipidemia ?? "unsure",
      history: HISTORY.filter((h) => histRaw.includes(h)),
      familyLiver: familyLiver ?? "unsure",
      hepB: hepB ?? "unknown",
      hepC: hepC ?? "unknown",
      alcohol: alcohol ?? null,
      meds: meds ?? "unsure",
      symptoms: SYMPTOMS.filter((s) => symRaw.includes(s)),
    },
  };
}

/** Pre-filled "yes" for the three metabolic questions the profile already answers; the rest stay unanswered. */
export function prefillTri(
  conditions: readonly string[],
  key: "diabetes" | "hypertension" | "dyslipidemia",
): Tri | "" {
  return conditions.includes(key) ? "yes" : "";
}

/** True when the person says their liver or hepatitis status is "positive" for either virus. */
export const hepPositive = (a: Pick<LiverAnswers, "hepB" | "hepC">) =>
  a.hepB === "positive" || a.hepC === "positive";
