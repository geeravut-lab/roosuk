import { z } from "zod";

/**
 * Health Profile: what a user tells us once. No weight, height or BMI on
 * purpose (nothing here may become a body-shape target), no medications.
 */
export const SEX_VALUES = ["female", "male", "other", "unspecified"] as const;
export const SMOKING_VALUES = ["never", "former", "current"] as const;
export const ALCOHOL_VALUES = [
  "none",
  "occasional",
  "weekly",
  "daily",
] as const;
export const EXERCISE_DAYS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Self-reported conditions. Sensitive: optional, and only ever used to make wording and prompts relevant. */
export const CONDITION_VALUES = [
  "diabetes",
  "hypertension",
  "dyslipidemia",
  "kidney_disease",
  "heart_disease",
  "fatty_liver",
  "thyroid",
] as const;

/** What the user wants from the app — never a weight or appearance target. */
export const GOAL_VALUES = [
  "sleep",
  "energy",
  "nutrition",
  "move",
  "stress",
  "understand_labs",
] as const;

export type Sex = (typeof SEX_VALUES)[number];
export type Smoking = (typeof SMOKING_VALUES)[number];
export type Alcohol = (typeof ALCOHOL_VALUES)[number];

export interface HealthProfile {
  birth_year: number | null;
  sex: Sex | null;
  smoking: Smoking | null;
  alcohol: Alcohol | null;
  exercise_days: number | null;
  conditions: string[];
  goals: string[];
}

export const PROFILE_COLUMNS =
  "birth_year, sex, smoking, alcohol, exercise_days, conditions, goals";

export const EMPTY_PROFILE: HealthProfile = {
  birth_year: null,
  sex: null,
  smoking: null,
  alcohol: null,
  exercise_days: null,
  conditions: [],
  goals: [],
};

/** Whole years of age from a birth year (age at the end of `year`, so within a year of the truth). */
export function ageFromBirthYear(birthYear: number, year: number): number {
  return year - birthYear;
}

export const MIN_AGE = 10;
export const MAX_AGE = 110;

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.literal(""), z.enum(values)])
    .transform((v) => (v === "" ? null : (v as T[number])));

const subset = <T extends readonly string[]>(values: T) =>
  z
    .array(z.string())
    .transform((a) => [...new Set(a)])
    .refine((a) => a.every((x) => (values as readonly string[]).includes(x)));

/** The form → a clean profile. Empty answers become null (skipped), anything out of range fails. */
export function parseProfileForm(
  formData: FormData,
  year: number,
): { ok: true; profile: HealthProfile } | { ok: false } {
  const schema = z.object({
    birth_year: z
      .union([z.literal(""), z.coerce.number().int()])
      .transform((v) => (v === "" ? null : v))
      .refine(
        (v) =>
          v === null ||
          (ageFromBirthYear(v, year) >= MIN_AGE &&
            ageFromBirthYear(v, year) <= MAX_AGE),
      ),
    sex: optionalEnum(SEX_VALUES),
    smoking: optionalEnum(SMOKING_VALUES),
    alcohol: optionalEnum(ALCOHOL_VALUES),
    exercise_days: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(7)])
      .transform((v) => (v === "" ? null : v)),
    conditions: subset(CONDITION_VALUES),
    goals: subset(GOAL_VALUES),
  });
  const parsed = schema.safeParse({
    birth_year: formData.get("birth_year") ?? "",
    sex: formData.get("sex") ?? "",
    smoking: formData.get("smoking") ?? "",
    alcohol: formData.get("alcohol") ?? "",
    exercise_days: formData.get("exercise_days") ?? "",
    conditions: formData.getAll("conditions").map(String),
    goals: formData.getAll("goals").map(String),
  });
  return parsed.success
    ? { ok: true, profile: parsed.data as HealthProfile }
    : { ok: false };
}

/** How much of the profile is filled in (the six single-answer fields), for a gentle nudge. */
export function profileCompleteness(p: HealthProfile): {
  done: number;
  total: number;
} {
  const answers = [p.birth_year, p.sex, p.smoking, p.alcohol, p.exercise_days];
  return {
    done:
      answers.filter((a) => a !== null).length + (p.goals.length > 0 ? 1 : 0),
    total: 6,
  };
}

/** A short, identifier-free description for AI prompts (no name, no email, no birth year — an age band only). */
export function profileForPrompt(p: HealthProfile, year: number): string {
  const parts: string[] = [];
  if (p.birth_year !== null) {
    const age = ageFromBirthYear(p.birth_year, year);
    parts.push(`age ${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}`);
  }
  if (p.sex && p.sex !== "unspecified") parts.push(`sex: ${p.sex}`);
  if (p.smoking) parts.push(`smoking: ${p.smoking}`);
  if (p.alcohol) parts.push(`alcohol: ${p.alcohol}`);
  if (p.exercise_days !== null)
    parts.push(`exercise days/week: ${p.exercise_days}`);
  if (p.conditions.length)
    parts.push(`self-reported conditions: ${p.conditions.join(", ")}`);
  if (p.goals.length) parts.push(`goals: ${p.goals.join(", ")}`);
  return parts.length ? parts.join("; ") : "no profile information";
}
