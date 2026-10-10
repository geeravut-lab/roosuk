import { z } from "zod";
import { SEX_VALUES } from "@/lib/profile/profile";
import { WATCHED_CONDITIONS } from "./watch";
import { ACTIVITY_LEVELS, DIRECTIONS, PACES } from "./weight";

/**
 * What a person can aim for. A goal is a few taps of questions (never a long form), then a
 * short daily program. Valid values live here, not in the database (a CHECK over a list that
 * keeps growing is a trap).
 */
export const GOAL_KINDS = ["weight", "sleep", "brain", "condition"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** How long one program block lasts, in days; a finished block can be renewed. */
export const PROGRAM_DAYS: Record<GoalKind, number> = {
  weight: 28,
  sleep: 14,
  brain: 21,
  condition: 28,
};

export const MAX_ACTIVE_GOALS = 3;

/** Conditions a "manage a condition" goal can be about (all have something the watch can count). */
export const CONDITION_GOALS = WATCHED_CONDITIONS;

export const SLEEP_HOURS = ["lt5", "5to6", "6to7", "7to8", "gt8"] as const;
export const SLEEP_PROBLEMS = [
  "fall_asleep",
  "wake_night",
  "wake_early",
  "sleepy_day",
] as const;
export const CAFFEINE = ["none", "morning", "afternoon", "evening"] as const;
export const BRAIN_AIMS = [
  "focus",
  "memory",
  "stress",
  "afternoon_slump",
] as const;
export const SIT_HOURS = ["lt4", "4to8", "gt8"] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const int = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z.number().int().min(min).max(max),
  );
const decimal = (min: number, max: number) =>
  z.preprocess(
    (v) =>
      typeof v === "string" && v.trim() !== ""
        ? Number(v.replace(",", "."))
        : v,
    z.number().min(min).max(max),
  );

export const weightParams = z.object({
  direction: z.enum(DIRECTIONS),
  heightCm: int(120, 220),
  weightKg: decimal(30, 250),
  targetKg: decimal(30, 250).nullable(),
  pace: z.enum(PACES),
  activity: z.enum(ACTIVITY_LEVELS),
  flags: z.object({
    pregnant: z.boolean(),
    edHistory: z.boolean(),
    medical: z.boolean(),
  }),
  /** only when the profile does not already hold them */
  sex: z.enum(SEX_VALUES).nullable(),
  birthYear: int(1900, 2100),
});
export type WeightParams = z.infer<typeof weightParams>;

export const sleepParams = z.object({
  avgHours: z.enum(SLEEP_HOURS),
  problem: z.enum(SLEEP_PROBLEMS),
  caffeine: z.enum(CAFFEINE),
  wakeTime: time,
});
export type SleepParams = z.infer<typeof sleepParams>;

export const brainParams = z.object({
  aim: z.enum(BRAIN_AIMS),
  sitHours: z.enum(SIT_HOURS),
  sleepHours: z.enum(SLEEP_HOURS),
});
export type BrainParams = z.infer<typeof brainParams>;

export const conditionParams = z.object({
  condition: z.enum(CONDITION_GOALS as [string, ...string[]]),
  underCare: z.boolean(),
});
export type ConditionParams = z.infer<typeof conditionParams>;

export type GoalParams =
  WeightParams | SleepParams | BrainParams | ConditionParams;

export const PARAM_SCHEMAS = {
  weight: weightParams,
  sleep: sleepParams,
  brain: brainParams,
  condition: conditionParams,
} as const;

export function isGoalKind(v: unknown): v is GoalKind {
  return typeof v === "string" && (GOAL_KINDS as readonly string[]).includes(v);
}

/** Hours of sleep as a number, for the program's maths. */
export const SLEEP_HOURS_VALUE: Record<(typeof SLEEP_HOURS)[number], number> = {
  lt5: 4.5,
  "5to6": 5.5,
  "6to7": 6.5,
  "7to8": 7.5,
  gt8: 8.5,
};

/** HH:MM minus hours, wrapping around midnight. */
export function minusHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let minutes = h * 60 + m - Math.round(hours * 60);
  minutes = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
