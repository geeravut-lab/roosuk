"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import {
  PROMPT_EXTRA_MAX,
  isEditableTask,
  reviewPromptAddition,
  screenPromptAddition,
  type PromptReason,
} from "@/lib/ai/prompt-extra";
import { invalidatePromptExtrasCache } from "@/lib/ai/prompt-extra.server";
import { builtinPrompt } from "@/lib/ai/prompt-view";
import { runAi } from "@/lib/ai/server";
import { dict } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PromptSaveState {
  /** saved: stored · cleared: addition removed · rejected: code check · risky: AI review · unavailable: reviewer could not answer (nothing saved) · invalid: bad input */
  status?:
    "saved" | "cleared" | "rejected" | "risky" | "unavailable" | "invalid";
  reasons?: PromptReason[];
  /** Short sentences from the AI reviewer (Thai). */
  notes?: string[];
}

/**
 * Save an admin's addition to one task's prompt. Nothing is stored until BOTH the
 * code check and the AI review pass; a failed review (or a reviewer that cannot
 * answer) saves nothing and tells the admin why. Clearing an addition needs no review.
 */
export async function savePromptExtraAction(
  _prev: PromptSaveState,
  formData: FormData,
): Promise<PromptSaveState> {
  const admin = await requireAdmin();
  const task = formData.get("task");
  const raw = formData.get("body");
  if (!isEditableTask(task) || typeof raw !== "string")
    return { status: "invalid" };
  const body = raw.replace(/\r\n/g, "\n").trim();
  const db = createAdminClient();

  if (body === "") {
    const { error } = await db
      .from("ai_prompt_versions")
      .insert({ task, body: "", created_by: admin.id });
    if (error) return { status: "invalid" };
    invalidatePromptExtrasCache();
    revalidatePath("/admin/prompts");
    return { status: "cleared" };
  }
  if (body.length > PROMPT_EXTRA_MAX)
    return { status: "rejected", reasons: ["too_long"] };

  const screened = screenPromptAddition(body);
  if (!screened.ok) return { status: "rejected", reasons: screened.reasons };

  const builtin = builtinPrompt(task);
  const t = dict.th;
  const review = await reviewPromptAddition(runAi, {
    task,
    taskLabel: t[`aiTask_${task}` as const],
    builtinSystem: builtin?.system ?? "",
    guardrails: t[`guardrails_${task}` as const].split("\n"),
    addition: body,
  });
  if (review.kind === "unavailable") return { status: "unavailable" };
  if (review.kind === "risky")
    return { status: "risky", notes: review.reasons };

  const { error } = await db.from("ai_prompt_versions").insert({
    task,
    body,
    created_by: admin.id,
    review: { verdict: "ok", reasons: [], model: review.model },
  });
  if (error) return { status: "invalid" };
  invalidatePromptExtrasCache();
  revalidatePath("/admin/prompts");
  return { status: "saved" };
}
