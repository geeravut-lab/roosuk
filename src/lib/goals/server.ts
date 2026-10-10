import "server-only";
import { runAi } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { checkAndConsume, refundUsage } from "@/lib/billing/quota.server";
import { addDays } from "@/lib/health/dates";
import { createClient } from "@/lib/supabase/server";
import type { Sex } from "@/lib/profile/profile";
import type { GoalKind, GoalParams } from "./kinds";
import { type SummaryMeal, summarizeFood } from "./foodsummary";
import type { LoggedMeal } from "./foodtags";
import {
  PROGRAM_SCHEMA,
  ageBand,
  computeTargets,
  normalizeProgram,
  parseStoredProgram,
  programPrompt,
  programSystemPrompt,
  type CheckinSummary,
  type GoalProgram,
  type ProgramContext,
  type ProgramTargets,
} from "./program";
import { templateProgram } from "./templates";
import { evaluateWatch, watchedConditions } from "./watch";
import { weightTrend } from "./weight";

export interface GoalRow {
  id: string;
  kind: GoalKind;
  status: "active" | "completed" | "abandoned";
  params: GoalParams;
  started_on: string;
  ends_on: string;
  created_at: string;
}

export const GOAL_COLUMNS =
  "id, kind, status, params, started_on, ends_on, created_at";

export interface GoalProfile {
  birth_year: number | null;
  sex: Sex | null;
  conditions: string[];
  height_cm: number | null;
}

/** The signed-in person's own rows (their client, so RLS applies) — never someone else's. */
export async function loadActiveGoals(): Promise<GoalRow[]> {
  const { data } = await (
    await createClient()
  )
    .from("user_goals")
    .select(GOAL_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<GoalRow[]>();
  return data ?? [];
}

export async function loadGoal(id: string): Promise<GoalRow | null> {
  const { data } = await (
    await createClient()
  )
    .from("user_goals")
    .select(GOAL_COLUMNS)
    .eq("id", id)
    .maybeSingle<GoalRow>();
  return data;
}

export interface StoredProgram {
  id: string;
  version: number;
  source: "ai" | "template";
  valid_from: string;
  valid_to: string;
  targets: ProgramTargets;
  plan: GoalProgram | null;
  created_at: string;
}

export async function loadProgram(
  goalId: string,
): Promise<StoredProgram | null> {
  const { data } = await (
    await createClient()
  )
    .from("goal_programs")
    .select(
      "id, version, source, valid_from, valid_to, targets, plan, created_at",
    )
    .eq("goal_id", goalId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<Omit<StoredProgram, "plan"> & { plan: unknown }>();
  return data ? { ...data, plan: parseStoredProgram(data.plan) } : null;
}

export async function loadChecks(
  goalId: string,
  from: string,
  to: string,
): Promise<{ task_date: string; task_key: string }[]> {
  const { data } = await (
    await createClient()
  )
    .from("goal_task_checks")
    .select("task_date, task_key")
    .eq("goal_id", goalId)
    .gte("task_date", from)
    .lte("task_date", to)
    .limit(500)
    .returns<{ task_date: string; task_key: string }[]>();
  return data ?? [];
}

interface MealRow {
  id: string;
  confirmed_at: string | null;
  meal_date: string;
  meal_type: SummaryMeal["meal_type"];
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: { name: string; catalog_key?: string | null; servings?: number }[];
}

/** The person's confirmed meals of the last `days` days (default 30). */
export async function loadMeals(
  today: string,
  days = 30,
): Promise<
  (SummaryMeal & LoggedMeal & { id: string; confirmed_at: string | null })[]
> {
  const { data } = await (
    await createClient()
  )
    .from("meal_logs")
    .select(
      "id, confirmed_at, meal_date, meal_type, kcal, protein_g, carbs_g, fat_g, items",
    )
    .eq("status", "confirmed")
    .gte("meal_date", addDays(today, -(days - 1)))
    .lte("meal_date", today)
    .order("meal_date", { ascending: false })
    .limit(1000)
    .returns<MealRow[]>();
  return (data ?? []).map((m) => ({
    ...m,
    kcal: Number(m.kcal),
    protein_g: Number(m.protein_g),
    carbs_g: Number(m.carbs_g),
    fat_g: Number(m.fat_g),
    items: Array.isArray(m.items) ? m.items : [],
  }));
}

export async function loadWeights(
  today: string,
  days = 60,
): Promise<{ date: string; kg: number }[]> {
  const { data } = await (
    await createClient()
  )
    .from("weight_logs")
    .select("logged_on, weight_kg")
    .gte("logged_on", addDays(today, -days))
    .order("logged_on", { ascending: true })
    .limit(400)
    .returns<{ logged_on: string; weight_kg: number | string }[]>();
  return (data ?? []).map((w) => ({
    date: w.logged_on,
    kg: Number(w.weight_kg),
  }));
}

export async function loadGoalProfile(): Promise<GoalProfile> {
  const { data } = await (
    await createClient()
  )
    .from("health_profiles")
    .select("birth_year, sex, conditions, height_cm")
    .maybeSingle<GoalProfile>();
  return (
    data ?? { birth_year: null, sex: null, conditions: [], height_cm: null }
  );
}

export async function loadCheckinSummary(
  today: string,
): Promise<CheckinSummary | null> {
  const { data } = await (
    await createClient()
  )
    .from("daily_checkins")
    .select("sleep_band, activity_band, energy, mood, nutrition")
    .gte("checkin_date", addDays(today, -13))
    .lte("checkin_date", today)
    .limit(20)
    .returns<
      {
        sleep_band: number;
        activity_band: number;
        energy: number;
        mood: number;
        nutrition: number;
      }[]
    >();
  const rows = data ?? [];
  if (!rows.length) return null;
  const avg = (k: keyof (typeof rows)[number]) =>
    Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 10) / 10;
  return {
    days: rows.length,
    avgSleepBand: avg("sleep_band"),
    avgEnergy: avg("energy"),
    avgMood: avg("mood"),
    avgNutrition: avg("nutrition"),
    avgActivityBand: avg("activity_band"),
  };
}

export interface GeneratedProgram {
  plan: GoalProgram;
  targets: ProgramTargets;
  source: "ai" | "template";
  model: string | null;
  /** why the standard program was used instead of an AI one */
  fallback: null | "quota" | "ai_failed";
}

export function ageOf(
  profile: GoalProfile,
  params: GoalParams,
  year: number,
): number | null {
  const birth =
    profile.birth_year ?? (params as { birthYear?: number }).birthYear ?? null;
  return birth === null ? null : year - birth;
}

/**
 * Build a program: the numbers by code, the wording by the model when the person's plan
 * allows another use and the answer passes the guardrails — otherwise the standard
 * program, which is always safe. Uses one `goalPlan` quota unit only when the AI actually
 * delivered. Runs under the person's own session for reading (RLS) and the server's for
 * the quota and the call.
 */
export async function generateProgramFor(
  userId: string,
  goal: Pick<GoalRow, "kind" | "params">,
  lang: "th" | "en",
  today: string,
): Promise<GeneratedProgram> {
  const [profile, meals, checkins, weights, goals] = await Promise.all([
    loadGoalProfile(),
    loadMeals(today, 30),
    loadCheckinSummary(today),
    loadWeights(today, 45),
    loadActiveGoals(),
  ]);
  const year = Number(today.slice(0, 4));
  const age = ageOf(profile, goal.params, year);
  const sex = profile.sex ?? (goal.params as { sex?: Sex | null }).sex ?? null;
  const targets = computeTargets(goal.kind, goal.params, {
    age: age ?? 35,
    sex,
  });
  const conditions = watchedConditions(profile.conditions, [...goals, goal]);
  const watch = evaluateWatch(conditions, meals, today);
  const trend = weightTrend(weights);
  const ctx: ProgramContext = {
    kind: goal.kind,
    lang,
    params: goal.params,
    targets,
    profile: {
      ageBand: age === null ? "unknown" : ageBand(age),
      sex,
      conditions,
    },
    food: summarizeFood(meals, today),
    checkins,
    watchTags: watch.alerts.map(
      (a) => `${a.condition}:${a.tag} (${a.servings7} servings in 7 days)`,
    ),
    weight: weights.length
      ? {
          current: weights[weights.length - 1].kg,
          kgPerWeek: trend?.kgPerWeek ?? null,
        }
      : null,
  };

  const standard = (
    fallback: GeneratedProgram["fallback"],
  ): GeneratedProgram => ({
    plan: templateProgram(ctx),
    targets,
    source: "template",
    model: null,
    fallback,
  });

  const decision = await checkAndConsume(userId, "goalPlan");
  if (!decision.allowed) return standard("quota");
  try {
    const ai = await runAi("goal_plan", {
      system: programSystemPrompt(lang),
      prompt: programPrompt(ctx),
      jsonSchema: PROGRAM_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 2048,
    });
    const plan = normalizeProgram(ai.json);
    if (plan)
      return {
        plan,
        targets,
        source: "ai",
        model: `${ai.provider}/${ai.model}`.slice(0, 100),
        fallback: null,
      };
  } catch (err) {
    console.error(
      "[goals] program failed:",
      err instanceof AiError ? err.code : err,
    );
  }
  await refundUsage(userId, "goalPlan");
  return standard("ai_failed");
}

export interface WatchView {
  conditions: string[];
  result: ReturnType<typeof evaluateWatch>;
}

/** What the food watch says for this person today (their own profile, goals and logged meals). */
export async function loadWatch(today: string): Promise<WatchView> {
  const [profile, goals, meals] = await Promise.all([
    loadGoalProfile(),
    loadActiveGoals(),
    loadMeals(today, 30),
  ]);
  const conditions = watchedConditions(profile.conditions, goals);
  return { conditions, result: evaluateWatch(conditions, meals, today) };
}

export interface GoalProgress {
  goal: GoalRow;
  total: number;
  done: number;
  /** the calorie target of a weight goal's program, when it has one */
  kcal: number | null;
}

/** Each running goal with how many of today's tasks are ticked. */
export async function loadGoalProgress(today: string): Promise<GoalProgress[]> {
  const goals = await loadActiveGoals();
  return Promise.all(
    goals.map(async (goal) => {
      const [program, checks] = await Promise.all([
        loadProgram(goal.id),
        loadChecks(goal.id, today, today),
      ]);
      return {
        goal,
        total: program?.plan?.tasks.length ?? 0,
        done: checks.length,
        kcal: program?.targets.kcal ?? null,
      };
    }),
  );
}
