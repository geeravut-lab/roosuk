import { z } from "zod";
import {
  ENGINE_VERSION,
  LIVER_MARKERS,
  type LiverResult,
  type ReasonCode,
} from "./engine";
import { RED_FLAGS } from "./questionnaire";

/**
 * What comes back from `liver_assessments.result` is validated again before it
 * is shown — a row is only ever written by the server, but display code should
 * not depend on that. Anything that does not fit is dropped (null), never guessed.
 */
const marker = z.enum(LIVER_MARKERS);
const labStatus = z.enum(["normal", "watch", "abnormal", "unknown"]);

const scoreSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    value: z.number().finite(),
    band: z.enum(["low", "intermediate", "high"]),
    ageNote: z.enum(["under35", "over65"]).optional(),
  }),
  z.object({ status: z.literal("insufficient"), missing: z.array(z.string()) }),
  z.object({ status: z.literal("invalid"), fields: z.array(z.string()) }),
]);

const REASONS = [
  ...RED_FLAGS.map((f) => `rf_${f}`),
  "lab_severe",
  "lab_out_of_range",
  "fib4_intermediate",
  "fib4_high",
  "apri_high",
  "nfs_high",
  "hep_positive",
  "liver_history",
  "symptoms_specific",
  "many_factors",
] as [ReasonCode, ...ReasonCode[]];

export const resultSchema = z.object({
  v: z.literal(1),
  engine: z.string().max(60).catch(ENGINE_VERSION),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  urgency: z.enum(["none", "soon", "emergency"]),
  redFlags: z.array(z.enum(RED_FLAGS)),
  reasons: z.array(
    z.object({
      code: z.enum(REASONS),
      markers: z.array(marker).optional(),
    }),
  ),
  factors: z.array(
    z.enum([
      "body_size",
      "diabetes",
      "hypertension",
      "dyslipidemia",
      "metabolic_labs",
      "told_fatty_liver",
      "alcohol_daily",
      "family_history",
      "meds_herbs",
      "hep_b_cohort",
      "fli_high",
      "symptoms",
    ]),
  ),
  gaps: z.array(
    z.enum([
      "no_labs",
      "labs_too_old",
      "labs_stale",
      "fib4_missing",
      "hep_untested",
      "no_age",
    ]),
  ),
  scores: z.object({
    fib4: scoreSchema,
    apri: scoreSchema,
    nfs: scoreSchema,
    fli: scoreSchema,
  }),
  scoresOn: z.string().nullable(),
  outOfRange: z.array(z.object({ marker, status: labStatus })),
  bmi: z.number().nullable(),
  doctorQuestions: z.array(
    z.enum([
      "ultrasound",
      "elastography",
      "hepatitis_tests",
      "repeat_labs",
      "medicines_review",
      "alcohol_talk",
      "metabolic_review",
      "hepatitis_vaccine",
      "symptoms_review",
      "family_screening",
    ]),
  ),
});

export function parseStoredResult(value: unknown): LiverResult | null {
  const r = resultSchema.safeParse(value);
  return r.success ? (r.data as LiverResult) : null;
}
