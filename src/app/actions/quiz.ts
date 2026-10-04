"use server";

import { redirect } from "next/navigation";
import { runAi } from "@/lib/ai/server";
import { getCurrentUser } from "@/lib/auth/server";
import { checkAndConsume } from "@/lib/billing/quota.server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";
import {
  PLAN_SCHEMA,
  computeQuiz,
  normalizeAiPlan,
  parseQuizForm,
  planPrompt,
  templatePlan,
  type PlanDay,
  type QuizResult,
} from "@/lib/quiz/quiz";
import { createAdminClient } from "@/lib/supabase/admin";

export interface QuizState {
  error?: ErrorKey;
  /** Shown instead of a saved page: anonymous visitors and users out of quiz allowance. */
  result?: QuizResult;
  plan?: PlanDay[];
  /** Why this result was not saved (the page explains and offers the next step). */
  unsaved?: "anonymous" | "quota";
  quotaError?: ErrorKey;
}

/**
 * The quiz. The score and health age are code (free, stable) and are ALWAYS
 * returned. Saving + the 7-day plan need a signed-in user with quiz allowance:
 * anonymous visitors get the numbers and an invitation to sign up (the funnel),
 * and nothing about them is stored.
 */
export async function submitQuizAction(
  _prev: QuizState,
  formData: FormData,
): Promise<QuizState> {
  const year = new Date().getFullYear();
  const parsed = parseQuizForm(formData, year);
  if (!parsed.ok) return { error: "err_quiz_invalid" };

  const result = computeQuiz(parsed.answers, year);
  const user = await getCurrentUser();
  if (!user)
    return { result, plan: templatePlan(result.levers), unsaved: "anonymous" };

  const decision = await checkAndConsume(user.id, "healthQuiz");
  if (!decision.allowed) {
    return {
      result,
      plan: templatePlan(result.levers),
      unsaved: "quota",
      quotaError: decision.error,
    };
  }

  // The plan: AI-written when it passes validation, otherwise the code template.
  // Either way the user gets a result, so a failed AI call does not refund the use.
  let plan: PlanDay[] = templatePlan(result.levers);
  let source: "ai" | "template" = "template";
  let model: string | null = null;
  try {
    const lang = await getLang();
    const { system, prompt } = planPrompt(result, lang);
    const ai = await runAi("daily_plan", {
      system,
      prompt,
      jsonSchema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 2048,
    });
    const checked = normalizeAiPlan(ai.json, result.levers);
    if (checked) {
      plan = checked;
      source = "ai";
      model = `${ai.provider}/${ai.model}`.slice(0, 100);
    }
  } catch (err) {
    console.error("[quiz] plan generation failed, using the template:", err);
  }

  const { data, error } = await createAdminClient()
    .from("quiz_results")
    .insert({
      user_id: user.id,
      answers: parsed.answers,
      score: result.score,
      chrono_age: result.chronoAge,
      delta_years: result.deltaYears,
      levers: result.levers,
      plan,
      plan_source: source,
      model,
    })
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };

  redirect(`/quiz-result/${data[0].id}`);
}
