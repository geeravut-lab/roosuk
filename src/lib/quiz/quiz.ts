import { z } from "zod";
import {
  ALCOHOL_VALUES,
  MAX_AGE,
  MIN_AGE,
  SMOKING_VALUES,
  ageFromBirthYear,
  type Alcohol,
  type Smoking,
} from "@/lib/profile/profile";

/**
 * Health Quiz — the numbers come from CODE so they are stable, explainable and
 * free: a 0–100 habit score and a rough "health age". The health age is a
 * LIFESTYLE ESTIMATE meant to motivate, not a clinical measurement and not a
 * diagnosis; it is bounded (±10 years) and the page says so. Nothing here asks
 * for weight, height or body shape.
 *
 * ⚠ The weights below are a first draft chosen to be directionally sensible
 * (not validated against a cohort) and must be reviewed by the medical advisor.
 */
export const QUIZ_LEVERS = [
  "smoking",
  "activity",
  "sleep",
  "nutrition",
  "alcohol",
  "stress",
  "checkup",
] as const;
export type QuizLever = (typeof QUIZ_LEVERS)[number];

export interface QuizAnswers {
  birth_year: number;
  smoking: Smoking;
  alcohol: Alcohol;
  exercise_days: number;
  /** 1 <5 h · 2 5–6 h · 3 7–8 h · 4 9+ h */
  sleep_band: number;
  /** vegetables + fruit per day: 1 under 1 · 2 one–two · 3 three–four · 4 five or more */
  produce_band: number;
  /** 1 (calm) … 5 (very stressed) */
  stress: number;
  checkup_last_year: boolean;
}

export function parseQuizForm(
  formData: FormData,
  year: number,
): { ok: true; answers: QuizAnswers } | { ok: false } {
  const band = (n: number) => z.coerce.number().int().min(1).max(n);
  const schema = z.object({
    birth_year: z.coerce
      .number()
      .int()
      .refine(
        (v) =>
          ageFromBirthYear(v, year) >= MIN_AGE &&
          ageFromBirthYear(v, year) <= MAX_AGE,
      ),
    smoking: z.enum(SMOKING_VALUES),
    alcohol: z.enum(ALCOHOL_VALUES),
    exercise_days: z.coerce.number().int().min(0).max(7),
    sleep_band: band(4),
    produce_band: band(4),
    stress: band(5),
    checkup_last_year: z.enum(["yes", "no"]).transform((v) => v === "yes"),
  });
  const get = (k: string) => formData.get(k) ?? undefined;
  const parsed = schema.safeParse({
    birth_year: get("birth_year"),
    smoking: get("smoking"),
    alcohol: get("alcohol"),
    exercise_days: get("exercise_days"),
    sleep_band: get("sleep_band"),
    produce_band: get("produce_band"),
    stress: get("stress"),
    checkup_last_year: get("checkup_last_year"),
  });
  return parsed.success ? { ok: true, answers: parsed.data } : { ok: false };
}

// ── scoring ────────────────────────────────────────────────────────────────
const ACTIVITY_POINTS = (days: number) =>
  days === 0 ? 0 : days <= 2 ? 40 : days <= 4 ? 75 : 100;
const SLEEP_POINTS = [30, 65, 100, 80] as const;
const PRODUCE_POINTS = [10, 45, 80, 100] as const;
const SMOKING_POINTS: Record<Smoking, number> = {
  never: 100,
  former: 70,
  current: 0,
};
const ALCOHOL_POINTS: Record<Alcohol, number> = {
  none: 100,
  occasional: 85,
  weekly: 55,
  daily: 20,
};
const STRESS_POINTS = [100, 80, 55, 30, 10] as const;

/** 0–100 per lever. */
export function leverPoints(a: QuizAnswers): Record<QuizLever, number> {
  return {
    smoking: SMOKING_POINTS[a.smoking],
    activity: ACTIVITY_POINTS(a.exercise_days),
    sleep: SLEEP_POINTS[a.sleep_band - 1],
    nutrition: PRODUCE_POINTS[a.produce_band - 1],
    alcohol: ALCOHOL_POINTS[a.alcohol],
    stress: STRESS_POINTS[a.stress - 1],
    checkup: a.checkup_last_year ? 100 : 40,
  };
}

const WEIGHTS: Record<QuizLever, number> = {
  activity: 0.2,
  sleep: 0.2,
  nutrition: 0.15,
  smoking: 0.15,
  alcohol: 0.1,
  stress: 0.1,
  checkup: 0.1,
};

/** Years each answer adds to (+) or takes off (−) the health age. */
export function leverYears(a: QuizAnswers): Record<QuizLever, number> {
  return {
    smoking: a.smoking === "current" ? 4 : a.smoking === "former" ? 1 : 0,
    activity:
      a.exercise_days >= 5
        ? -2
        : a.exercise_days >= 3
          ? -1
          : a.exercise_days >= 1
            ? 0.5
            : 2,
    sleep: [2, 0.5, -1, 0.5][a.sleep_band - 1],
    nutrition: [1.5, 0.5, 0, -1][a.produce_band - 1],
    alcohol: a.alcohol === "daily" ? 2 : a.alcohol === "weekly" ? 0.5 : 0,
    stress: [-0.5, -0.5, 0, 0.5, 1.5][a.stress - 1],
    checkup: a.checkup_last_year ? 0 : 0.5,
  };
}

export const MAX_DELTA = 10;

export interface QuizResult {
  score: number;
  chronoAge: number;
  /** Health age minus real age, whole years, within ±10. */
  deltaYears: number;
  healthAge: number;
  /** Up to three levers worth working on, biggest first. */
  levers: QuizLever[];
}

export function computeQuiz(a: QuizAnswers, year: number): QuizResult {
  const points = leverPoints(a);
  const years = leverYears(a);
  const score = Math.round(
    QUIZ_LEVERS.reduce((s, k) => s + points[k] * WEIGHTS[k], 0),
  );
  const raw = QUIZ_LEVERS.reduce((s, k) => s + years[k], 0);
  const deltaYears = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, Math.round(raw)));
  const chronoAge = ageFromBirthYear(a.birth_year, year);

  // Levers with room to improve: most years first, then lowest points; ties keep QUIZ_LEVERS order.
  const levers = QUIZ_LEVERS.filter((k) => points[k] < 85)
    .sort((x, y) => years[y] - years[x] || points[x] - points[y])
    .slice(0, 3);

  return {
    score,
    chronoAge,
    deltaYears,
    healthAge: chronoAge + deltaYears,
    levers,
  };
}

// ── 7-day plan ─────────────────────────────────────────────────────────────
export interface PlanDay {
  day: number;
  /** The lever this day works on, or "review" for the last day. */
  lever: QuizLever | "review";
  /** Translation key of a template tip (template plans) or null when `text` is AI-written. */
  tipKey: string | null;
  text: string | null;
}

const MAINTAIN: readonly QuizLever[] = ["activity", "sleep", "nutrition"];
export const TIPS_PER_LEVER = 3;

/** The template plan: pure code, used when AI is unavailable and as the base the AI personalises. */
export function templatePlan(levers: readonly QuizLever[]): PlanDay[] {
  const focus = [...levers];
  for (const m of MAINTAIN)
    if (focus.length < 3 && !focus.includes(m)) focus.push(m);
  const days: PlanDay[] = [];
  for (let day = 1; day <= 6; day++) {
    const lever = focus[(day - 1) % 3];
    const n = Math.floor((day - 1) / 3) + 1;
    days.push({ day, lever, tipKey: `planTip_${lever}_${n}`, text: null });
  }
  days.push({ day: 7, lever: "review", tipKey: "planTip_review", text: null });
  return days;
}

/**
 * What an AI-written plan must never contain: medicines, supplements, treatment
 * claims, weight-loss or dieting talk. Thai has no spaces, so a plain substring
 * test would trip on ordinary words (อยาก, ภาษา, ปัญหา all contain "ยา"/"หา");
 * the word "medicine" is therefore matched on whole words from Thai word
 * segmentation, and the other Thai phrases are specific enough to match as text.
 * A false positive only costs the personalised plan (the template is used), a
 * false negative would put medical talk on a user's screen — so this errs strict.
 */
const BANNED_TEXT = [
  /อาหารเสริม/,
  /วิตามิน/,
  /การรักษา|รักษาโรค|รักษาอาการ|รักษาตัว|รักษาให้หาย/,
  /วินิจฉัย/,
  /ลดน้ำหนัก/,
  /ลดความอ้วน/,
  /อดอาหาร/,
  /\bmedicat/i,
  /\bsupplement/i,
  /\bprescri/i,
  /\bdiagnos/i,
  /\bcure\b/i,
  /\btreat(ment)?\b/i,
  /weight[- ]?loss|lose weight|diet pill|\bfast(ing)?\b/i,
];

const THAI_SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("th", { granularity: "word" })
    : null;

/** Whole Thai words that mean a medicine. */
const MEDICINE_WORDS = new Set([
  "ยา",
  "ยาเม็ด",
  "ยาแก้ปวด",
  "ยานอนหลับ",
  "ยาลดไข้",
]);

export function containsBannedAdvice(text: string): boolean {
  if (BANNED_TEXT.some((re) => re.test(text))) return true;
  if (THAI_SEGMENTER) {
    for (const seg of THAI_SEGMENTER.segment(text))
      if (seg.isWordLike && MEDICINE_WORDS.has(seg.segment)) return true;
  } else if (/(^|[^ก-๙])ยา($|[^ก-๙])/.test(text)) {
    return true; // no segmenter: only a standalone "ยา" counts
  }
  return false;
}

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: { day: { type: "number" }, text: { type: "string" } },
        required: ["day", "text"],
      },
    },
  },
  required: ["days"],
} as const;

export function planPrompt(
  result: QuizResult,
  lang: "th" | "en",
): { system: string; prompt: string } {
  return {
    system:
      "You write short, friendly habit-building plans for a Thai wellness app. " +
      "You never diagnose, never mention medicines, supplements, treatment, weight loss or dieting, and never use fear. " +
      "Only suggest small, concrete, free everyday actions.",
    prompt:
      `Write a 7-day plan in ${lang === "th" ? "Thai" : "English"}, one action per day (day 1 to 7), each 10–25 words.\n` +
      `The person's top areas to improve, most important first: ${result.levers.join(", ") || "keep up the current habits"}.\n` +
      "Areas: smoking = cutting down tobacco, activity = moving more, sleep = sleep routine, nutrition = vegetables and fruit, " +
      "alcohol = drinking less, stress = calming practices, checkup = booking a routine health check.\n" +
      "Days 1–6 each focus on one of those areas (cycle through them); day 7 is a calm review of how the week went.",
  };
}

/** AI output → 7 clean days, or null when anything is off (wrong count, length, banned words). */
export function normalizeAiPlan(
  raw: unknown,
  levers: readonly QuizLever[],
): PlanDay[] | null {
  const schema = z.object({
    days: z
      .array(
        z.object({ day: z.coerce.number().int(), text: z.string().trim() }),
      )
      .length(7),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return null;
  const byDay = new Map(parsed.data.days.map((d) => [d.day, d.text]));
  const base = templatePlan(levers);
  const out: PlanDay[] = [];
  for (let day = 1; day <= 7; day++) {
    const text = byDay.get(day);
    if (!text || text.length < 10 || text.length > 300) return null;
    if (containsBannedAdvice(text)) return null;
    out.push({ day, lever: base[day - 1].lever, tipKey: null, text });
  }
  return out;
}

export function parseStoredPlan(value: unknown): PlanDay[] {
  const schema = z
    .array(
      z.object({
        day: z.number(),
        lever: z.string(),
        tipKey: z.string().nullable(),
        text: z.string().nullable(),
      }),
    )
    .length(7);
  const r = schema.safeParse(value);
  return r.success ? (r.data as PlanDay[]) : [];
}
