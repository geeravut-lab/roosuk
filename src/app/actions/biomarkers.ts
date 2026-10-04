"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import { runAi } from "@/lib/ai/server";
import { biomarkerKeyForName, normalizeName } from "@/config/biomarkers";
import { AppError } from "@/lib/errors";
import type { ErrorKey } from "@/lib/i18n/dict";
import {
  DRAFT_SCHEMA,
  draftPrompt,
  parseCustomMarkerForm,
  parseDraft,
  takenKeys,
  type DraftSuggestion,
} from "@/lib/lab/custom-markers";
import {
  ensureCatalog,
  invalidateCatalogCache,
} from "@/lib/lab/catalog.server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface MarkerSaveState {
  error?: ErrorKey;
  saved?: string;
}

const KEY = /^[a-z][a-z0-9_]{2,39}$/;

/** Every name used by the OTHER extras (drafts too), so two extras cannot answer to the same printed name. */
async function otherAliasOwners(except: string | null) {
  const { data } = await createAdminClient()
    .from("biomarker_extras")
    .select("key, aliases, en, th")
    .returns<{ key: string; aliases: string[]; en: string; th: string }[]>();
  const owners = new Map<string, string>();
  const keys = new Set<string>();
  for (const row of data ?? []) {
    if (row.key === except) continue;
    keys.add(row.key);
    for (const n of [...row.aliases, row.en, row.th])
      owners.set(normalizeName(n), row.key);
  }
  return { owners, keys };
}

/** Create or edit an extra. It is always saved as a DRAFT: editing an approved one withdraws its approval. */
export async function saveExtraAction(
  _prev: MarkerSaveState,
  formData: FormData,
): Promise<MarkerSaveState> {
  const admin = await requireAdmin();
  await ensureCatalog();
  const editing = String(formData.get("editingKey") ?? "");
  if (editing && !KEY.test(editing)) return { error: "err_invalid_input" };

  const others = await otherAliasOwners(editing || null);
  const parsed = parseCustomMarkerForm(formData, {
    keys: new Set([...takenKeys(editing || undefined), ...others.keys]),
    aliasOwners: others.owners,
  });
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  if (editing && v.key !== editing) return { error: "err_invalid_input" }; // the key never changes

  const row = {
    key: v.key,
    th: v.th,
    en: v.en,
    unit: v.unit,
    normal_lo: v.normalLo,
    normal_hi: v.normalHi,
    watch_lo: v.watchLo,
    watch_hi: v.watchHi,
    aliases: v.aliases,
    conversions: v.conversions,
    source_note: v.sourceNote,
    status: "draft",
    approved_by: null,
    approved_at: null,
    updated_at: new Date().toISOString(),
  };
  const db = createAdminClient();
  if (editing) {
    const { data, error } = await db
      .from("biomarker_extras")
      .update(row)
      .eq("key", editing)
      .select("key");
    if (error || data?.length !== 1) return { error: "err_save_failed" };
  } else {
    const { error } = await db
      .from("biomarker_extras")
      .insert({ ...row, created_by: admin.id });
    if (error?.code === "23505") return { error: "err_marker_key_taken" };
    if (error) return { error: "err_save_failed" };
  }
  invalidateCatalogCache();
  revalidatePath("/admin/biomarkers");
  return { saved: v.key };
}

/** A doctor's sign-off: from now on this range judges real values. Also closes the matching "unknown" entries. */
export async function approveExtraAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (!KEY.test(key)) throw new AppError("err_invalid_input");
  // The sign-off is a statement by a person, so it is asked for every time.
  if (formData.get("doctor") !== "on") throw new AppError("err_marker_doctor");
  const db = createAdminClient();
  const { data, error } = await db
    .from("biomarker_extras")
    .update({
      status: "approved",
      approved_by: admin.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("key", key)
    .select("key, aliases, en, th");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  const names = [...data[0].aliases, data[0].en, data[0].th].map(normalizeName);
  await db
    .from("lab_unknown_markers")
    .update({ status: "resolved", resolved_key: key })
    .in("normalized_name", names)
    .eq("status", "new");
  invalidateCatalogCache();
  revalidatePath("/admin/biomarkers");
  revalidatePath("/admin");
}

export async function withdrawExtraAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (!KEY.test(key)) throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient()
    .from("biomarker_extras")
    .update({
      status: "draft",
      approved_by: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key)
    .select("key");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  invalidateCatalogCache();
  revalidatePath("/admin/biomarkers");
}

export async function deleteExtraAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (!KEY.test(key)) throw new AppError("err_invalid_input");
  const db = createAdminClient();
  const { error } = await db.from("biomarker_extras").delete().eq("key", key);
  if (error) throw new AppError("err_save_failed");
  // names it had closed come back to the queue
  await db
    .from("lab_unknown_markers")
    .update({ status: "new", resolved_key: null })
    .eq("resolved_key", key);
  invalidateCatalogCache();
  revalidatePath("/admin/biomarkers");
  revalidatePath("/admin");
}

export async function setUnknownStatusAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").slice(0, 120);
  const status = formData.get("status");
  if (!name || (status !== "ignored" && status !== "new"))
    throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient()
    .from("lab_unknown_markers")
    .update({ status })
    .eq("normalized_name", name)
    .select("normalized_name");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/admin/biomarkers");
  revalidatePath("/admin");
}

export type SuggestResult =
  | { ok: true; draft: DraftSuggestion }
  | { ok: false; error: "unknown" | "unavailable" | "known_already" };

/**
 * Ask the AI for a DRAFT range to pre-fill the form. It is never saved or used
 * by itself: it only saves typing for the doctor, who checks it, writes the
 * source, and approves. If the model is not sure it says so and nothing is filled.
 */
export async function suggestDraftAction(
  name: string,
  unit: string,
): Promise<SuggestResult> {
  await requireAdmin();
  const n = String(name ?? "")
    .trim()
    .slice(0, 120);
  if (!n) return { ok: false, error: "unknown" };
  await ensureCatalog();
  if (biomarkerKeyForName(n)) return { ok: false, error: "known_already" };
  try {
    const { system, prompt } = draftPrompt(n, String(unit ?? "").trim());
    const res = await runAi("quick", {
      system,
      prompt,
      jsonSchema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 600,
    });
    const draft = parseDraft(res.json);
    return draft ? { ok: true, draft } : { ok: false, error: "unknown" };
  } catch (err) {
    console.error("[biomarkers] draft suggestion failed:", err);
    return { ok: false, error: "unavailable" };
  }
}
