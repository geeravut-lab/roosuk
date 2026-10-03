"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import { apiKeyFor, isProviderId } from "@/lib/ai/registry";
import {
  invalidateAiSettingsCache,
  testModel,
  type ModelTestResult,
} from "@/lib/ai/server";
import { TASK_KINDS, PROVIDER_IDS } from "@/lib/ai/types";
import type { ErrorKey } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AiFormState {
  error?: ErrorKey;
  ok?: boolean;
}

const MODEL_ID = /^[A-Za-z0-9._:/-]{1,100}$/;

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

/**
 * Saves the routing: per task a primary/fallback provider and per provider×task
 * a model id. Empty = "use the default". A provider without an API key cannot
 * be chosen as primary or fallback (a model id for it may still be pre-filled).
 */
export async function saveAiSettingsAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const admin = await requireAdmin();

  const routes: Record<string, { primary?: string; fallback?: string }> = {};
  const models: Record<string, Record<string, string>> = {};

  for (const task of TASK_KINDS) {
    const primary = str(formData.get(`primary.${task}`));
    const fallback = str(formData.get(`fallback.${task}`));
    const entry: { primary?: string; fallback?: string } = {};
    if (primary) {
      if (!isProviderId(primary)) return { error: "err_invalid_input" };
      if (!apiKeyFor(primary)) return { error: "err_ai_provider_no_key" };
      entry.primary = primary;
    }
    if (fallback) {
      if (fallback !== "none") {
        if (!isProviderId(fallback)) return { error: "err_invalid_input" };
        if (!apiKeyFor(fallback)) return { error: "err_ai_provider_no_key" };
      }
      entry.fallback = fallback;
    }
    if (Object.keys(entry).length) routes[task] = entry;

    for (const provider of PROVIDER_IDS) {
      const model = str(formData.get(`model.${provider}.${task}`));
      if (!model) continue;
      if (!MODEL_ID.test(model)) return { error: "err_invalid_input" };
      (models[provider] ??= {})[task] = model;
    }
  }

  const { data, error } = await createAdminClient()
    .from("ai_settings")
    .update({
      route_overrides: routes,
      model_overrides: models,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) return { error: "err_save_failed" };

  invalidateAiSettingsCache();
  revalidatePath("/admin/ai");
  return { ok: true };
}

/** Admin-only: ask one provider+model for a one-word answer, so a typo or retired model shows up before saving. */
export async function testModelAction(
  provider: string,
  model: string,
): Promise<ModelTestResult> {
  await requireAdmin();
  const id = model.trim();
  if (!isProviderId(provider) || !MODEL_ID.test(id))
    return { ok: false, ms: 0, error: "invalid" };
  return testModel(provider, id);
}
