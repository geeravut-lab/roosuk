"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { trackEvent } from "@/lib/analytics/server";
import { requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { addDays, bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
import { readGoalParams } from "@/lib/goals/form";
import {
  MAX_ACTIVE_GOALS,
  PROGRAM_DAYS,
  isGoalKind,
  type GoalKind,
  type WeightParams,
} from "@/lib/goals/kinds";
import {
  ageOf,
  generateProgramFor,
  loadActiveGoals,
  loadGoal,
  loadGoalProfile,
} from "@/lib/goals/server";
import {
  assessWeightGoal,
  validBody,
  type WeightNote,
  type WeightStatus,
} from "@/lib/goals/weight";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface GoalFormState {
  error?: ErrorKey;
  field?: string;
  /** why a weight goal cannot be offered (or what to be careful about) */
  notes?: WeightNote[];
  status?: WeightStatus;
  range?: { min: number; max: number };
}

const UNIQUE_VIOLATION = "23505";

/** Save a new program version for a goal (the server writes; the person only reads). */
async function saveProgram(
  userId: string,
  goal: {
    id: string;
    kind: GoalKind;
    params: WeightParams | Record<string, unknown>;
  },
  lang: "th" | "en",
  today: string,
): Promise<void> {
  const db = createAdminClient();
  const made = await generateProgramFor(
    userId,
    goal as Parameters<typeof generateProgramFor>[1],
    lang,
    today,
  );
  const { data: last } = await db
    .from("goal_programs")
    .select("version")
    .eq("goal_id", goal.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();
  const { data, error } = await db
    .from("goal_programs")
    .insert({
      goal_id: goal.id,
      user_id: userId,
      version: (last?.version ?? 0) + 1,
      source: made.source,
      model: made.model,
      valid_from: today,
      valid_to: addDays(today, PROGRAM_DAYS[goal.kind] - 1),
      targets: made.targets,
      plan: made.plan,
    })
    .select("id");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  await trackEvent("goal_program_made", userId, made.source);
}

/** Create a goal from its short intake form, then write the first program. */
export async function createGoalAction(
  kindRaw: string,
  _prev: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  await assertFeature("goals");
  const user = await requireUser();
  if (!isGoalKind(kindRaw)) throw new AppError("err_invalid_input");
  const kind = kindRaw;
  const today = bangkokDate(new Date());

  const read = readGoalParams(
    kind,
    (k) => formData.get(k),
    (k) => formData.getAll(k).filter((v): v is string => typeof v === "string"),
  );
  if (!read.ok) return { error: "err_goal_value", field: read.field };
  let params = read.params;

  const profile = await loadGoalProfile();
  if (kind === "weight") {
    const w = params as WeightParams;
    const age = ageOf(profile, w, Number(today.slice(0, 4)));
    const sex = profile.sex ?? w.sex;
    if (age === null) return { error: "err_goal_value", field: "birth_year" };
    const intake = {
      direction: w.direction,
      sex,
      age,
      heightCm: w.heightCm,
      weightKg: w.weightKg,
      targetKg: w.targetKg,
      pace: w.pace,
      activity: w.activity,
      flags: w.flags,
    };
    if (!validBody(intake))
      return { error: "err_goal_value", field: "weight_kg" };
    const a = assessWeightGoal(intake);
    if (a.status === "blocked")
      return { error: "err_goal_blocked", notes: a.notes, status: a.status };
    if (a.status === "fix")
      return {
        error: "err_goal_fix",
        notes: a.notes,
        status: a.status,
        range: a.targetRange ?? undefined,
        field: "target_kg",
      };
    // the pace the rules allow wins over the one asked for
    params = { ...w, pace: a.pace };
    // height (and birth year / sex, when the profile lacked them) are remembered with the profile
    const supabase = await createClient();
    const { error } = await supabase.from("health_profiles").upsert(
      {
        user_id: user.id,
        height_cm: w.heightCm,
        ...(profile.birth_year === null ? { birth_year: w.birthYear } : {}),
        ...(profile.sex === null && w.sex ? { sex: w.sex } : {}),
      },
      { onConflict: "user_id" },
    );
    if (error) return { error: "err_save_failed" };
  }

  const active = await loadActiveGoals();
  if (active.length >= MAX_ACTIVE_GOALS) return { error: "err_goal_limit" };

  const db = createAdminClient();
  const { data, error } = await db
    .from("user_goals")
    .insert({
      user_id: user.id,
      kind,
      params,
      started_on: today,
      ends_on: addDays(today, PROGRAM_DAYS[kind] - 1),
    })
    .select("id");
  if (error?.code === UNIQUE_VIOLATION) return { error: "err_goal_exists" };
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  const id = data[0].id as string;
  await trackEvent("goal_created", user.id, kind);

  try {
    await saveProgram(user.id, { id, kind, params }, await getLang(), today);
  } catch (err) {
    // no program means no goal: leave nothing half-made behind
    await db.from("user_goals").delete().eq("id", id).eq("user_id", user.id);
    throw err;
  }
  revalidatePath("/goals");
  revalidatePath("/today");
  redirect(`/goals/${id}`);
}

/** A fresh program for a goal that is still running (the person asked for one). */
export async function regenerateProgramAction(
  formData: FormData,
): Promise<void> {
  await assertFeature("goals");
  const user = await requireUser();
  const id = String(formData.get("goal") ?? "");
  const goal = await loadGoal(id);
  if (!goal || goal.status !== "active")
    throw new AppError("err_goal_not_found");
  const today = bangkokDate(new Date());
  await saveProgram(user.id, goal, await getLang(), today);
  revalidatePath(`/goals/${id}`);
  revalidatePath("/today");
  redirect(`/goals/${id}`);
}

/** Tick or untick one of today's tasks. The database allows only today, only the person's own live goal. */
export async function toggleTaskAction(formData: FormData): Promise<void> {
  await assertFeature("goals");
  const user = await requireUser();
  const goalId = String(formData.get("goal") ?? "");
  const key = String(formData.get("task") ?? "");
  const done = formData.get("done") === "1";
  if (!/^t[1-6]$/.test(key) || !goalId) throw new AppError("err_invalid_input");
  const today = bangkokDate(new Date());
  const supabase = await createClient();
  if (done) {
    const { error } = await supabase.from("goal_task_checks").upsert(
      { user_id: user.id, goal_id: goalId, task_date: today, task_key: key },
      {
        onConflict: "user_id,goal_id,task_date,task_key",
        ignoreDuplicates: true,
      },
    );
    if (error) throw new AppError("err_save_failed");
  } else {
    const { error } = await supabase
      .from("goal_task_checks")
      .delete()
      .eq("goal_id", goalId)
      .eq("task_date", today)
      .eq("task_key", key);
    if (error) throw new AppError("err_save_failed");
  }
  revalidatePath(`/goals/${goalId}`);
  revalidatePath("/today");
}

/** Stop a goal: finished (done) or given up (no judgement). */
export async function endGoalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("goal") ?? "");
  const status =
    formData.get("status") === "completed" ? "completed" : "abandoned";
  const { data, error } = await createAdminClient()
    .from("user_goals")
    .update({ status, ended_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .select("id");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/goals");
  revalidatePath("/today");
  redirect("/goals");
}

export interface WeightState {
  error?: ErrorKey;
  saved?: boolean;
}

/** One weigh-in for today (replaces today's earlier one). */
export async function logWeightAction(
  _prev: WeightState,
  formData: FormData,
): Promise<WeightState> {
  await assertFeature("goals");
  const user = await requireUser();
  const raw = String(formData.get("weight_kg") ?? "")
    .trim()
    .replace(",", ".");
  const kg = Number(raw);
  if (!/^\d{2,3}(\.\d)?$/.test(raw) || kg < 25 || kg > 300)
    return { error: "err_weight_value" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("weight_logs")
    .upsert(
      { user_id: user.id, logged_on: bangkokDate(new Date()), weight_kg: kg },
      { onConflict: "user_id,logged_on" },
    );
  if (error) return { error: "err_save_failed" };
  revalidatePath("/goals", "layout");
  revalidatePath("/today");
  return { saved: true };
}
