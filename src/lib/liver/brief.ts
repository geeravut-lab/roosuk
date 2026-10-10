import { z } from "zod";
import { addDays } from "@/lib/health/dates";
import type { ChartPoint } from "@/lib/timeline/charts";
import type { LabPanel, LiverResult, DoctorQuestion } from "./engine";
import { resultSchema } from "./result";
import type { LiverAnswers } from "./questionnaire";
import {
  fib4Series,
  latestLabs,
  liverSeries,
  trendNotes,
  trendableLiver,
  type LiverLabRow,
} from "./trend";

/**
 * "Prepare for my liver check-up": everything a doctor would want from the Liver
 * Health module on one page — the latest assessment, the liver tests with their
 * trend, FIB-4, what the person told us, and questions to ask. It is what the
 * `liver` section of a Health Passport freezes, and what /liver/brief prints.
 * It lists what was recorded and never says what the person "has".
 */
export const MAX_TREND_POINTS = 12;

export interface LiverBrief {
  v: 1;
  /** Day of the assessment this brief is based on, or null if the person never did one. */
  assessedOn: string | null;
  result: LiverResult | null;
  answers: Pick<
    LiverAnswers,
    | "symptoms"
    | "meds"
    | "alcohol"
    | "hepB"
    | "hepC"
    | "history"
    | "familyLiver"
  > | null;
  labs: ReturnType<typeof latestLabs>;
  trends: {
    marker: ReturnType<typeof latestLabs>[number]["marker"];
    points: { date: string; value: number; status: ChartPoint["status"] }[];
  }[];
  fib4Trend: { date: string; value: number; status: ChartPoint["status"] }[];
  trendNotes: ReturnType<typeof trendNotes>;
  questions: DoctorQuestion[];
}

/** Without an assessment these two are still worth asking about once a person has gone looking. */
const BASELINE_QUESTIONS: DoctorQuestion[] = [
  "ultrasound",
  "hepatitis_tests",
  "repeat_labs",
];

const points = (s: ChartPoint[]) =>
  s
    .slice(-MAX_TREND_POINTS)
    .filter((p): p is ChartPoint & { value: number } => p.value !== null)
    .map((p) => ({ date: p.date, value: p.value, status: p.status }));

export function buildLiverBrief(input: {
  assessment: {
    created_on: string;
    result: LiverResult;
    answers: LiverAnswers | null;
  } | null;
  panels: readonly LabPanel[];
  rows: readonly LiverLabRow[];
  birthYear: number | null;
}): LiverBrief {
  const { assessment: a } = input;
  const f4 = fib4Series(input.panels, input.birthYear);
  return {
    v: 1,
    assessedOn: a?.created_on ?? null,
    result: a?.result ?? null,
    answers: a?.answers
      ? {
          symptoms: a.answers.symptoms,
          meds: a.answers.meds,
          alcohol: a.answers.alcohol,
          hepB: a.answers.hepB,
          hepC: a.answers.hepC,
          history: a.answers.history,
          familyLiver: a.answers.familyLiver,
        }
      : null,
    labs: latestLabs(input.panels),
    trends: trendableLiver(input.rows).map((marker) => ({
      marker,
      points: points(liverSeries(input.rows, marker)),
    })),
    fib4Trend: f4.length >= 2 ? points(f4) : [],
    trendNotes: trendNotes(input.rows),
    questions: a?.result.doctorQuestions.length
      ? a.result.doctorQuestions
      : a
        ? []
        : BASELINE_QUESTIONS,
  };
}

/** First day to draw on a mini chart: a little before the first point. */
export function chartFrom(pts: { date: string }[], today: string): string {
  const first = pts.length ? pts[0].date : today;
  return first < today ? first : addDays(today, -30);
}

// ── storage: the section inside a Health Passport snapshot ─────────────────
const pointSchema = z.object({
  date: z.string(),
  value: z.number().finite(),
  status: z.enum(["normal", "watch", "abnormal", "unknown"]).optional(),
});

const marker = resultSchema.shape.outOfRange.element.shape.marker;

export const briefSchema = z.object({
  v: z.literal(1),
  assessedOn: z.string().nullable(),
  result: resultSchema.nullable(),
  answers: z
    .object({
      symptoms: z.array(z.string()),
      meds: z.enum(["yes", "no", "unsure"]),
      alcohol: z.enum(["none", "occasional", "weekly", "daily"]).nullable(),
      hepB: z.enum([
        "unknown",
        "never_tested",
        "negative",
        "positive",
        "vaccinated",
      ]),
      hepC: z.enum(["unknown", "never_tested", "negative", "positive"]),
      history: z.array(z.string()),
      familyLiver: z.enum(["yes", "no", "unsure"]),
    })
    .nullable(),
  labs: z.array(
    z.object({
      marker,
      value: z.number().finite(),
      status: z.enum(["normal", "watch", "abnormal", "unknown"]),
      date: z.string(),
      unit: z.string(),
    }),
  ),
  trends: z.array(z.object({ marker, points: z.array(pointSchema) })),
  fib4Trend: z.array(pointSchema),
  trendNotes: z.array(
    z.object({ marker, kind: z.enum(["rising", "falling", "persistent"]) }),
  ),
  questions: z.array(
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

export function parseStoredBrief(value: unknown): LiverBrief | null {
  const r = briefSchema.safeParse(value);
  return r.success ? (r.data as unknown as LiverBrief) : null;
}
