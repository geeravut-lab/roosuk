"use server";

import { revalidatePath } from "next/cache";
import { planSpec } from "@/lib/billing/specs.server";
import { requireUser } from "@/lib/auth/server";
import { tierFor } from "@/lib/billing/entitlement.server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { hashToken, newToken } from "@/lib/passport/passport";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestObservations } from "@/lib/wearables/server";
import {
  TOKEN_PREFIX,
  isConsentSource,
  isObsType,
  type BatchResult,
  type WearableTier,
} from "@/lib/wearables/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKENS = 5;

const toErrorKey = (e: unknown): ErrorKey =>
  e instanceof AppError ? e.code : "err_unknown";

/** Feature on, signed in, and a plan that stores wearable data at all. */
async function gate(): Promise<{ userId: string; tier: WearableTier }> {
  await assertFeature("wearables");
  const user = await requireUser();
  const tier = (await planSpec(await tierFor(user.id))).wearables;
  if (tier === "none") throw new AppError("err_wearable_plan");
  return { userId: user.id, tier };
}

async function audit(userId: string, action: string, detail: string) {
  await createAdminClient()
    .from("privacy_audit_log")
    .insert({ user_id: userId, action, detail, meta: {} });
}

/** The person's own, separate consent for one source — ticked on purpose, recorded with its time. */
export async function enableSourceAction(formData: FormData): Promise<void> {
  const { userId } = await gate();
  const source = formData.get("source");
  if (!isConsentSource(source)) throw new AppError("err_invalid_input");
  if (formData.get("ack") !== "on") throw new AppError("err_wearable_ack");
  const { error } = await createAdminClient().from("wearable_sources").upsert(
    {
      user_id: userId,
      source,
      consented_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,source" },
  );
  if (error) throw new AppError("err_save_failed");
  await audit(userId, "wearable_consent_given", source);
  revalidatePath("/wearables");
}

/** Withdraw consent for a source; optionally erase everything it sent. Works on any plan (leaving is always allowed). */
export async function revokeSourceAction(formData: FormData): Promise<void> {
  await assertFeature("wearables");
  const user = await requireUser();
  const source = formData.get("source");
  if (!isConsentSource(source)) throw new AppError("err_invalid_input");
  const db = createAdminClient();
  const { error } = await db
    .from("wearable_sources")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("source", source)
    .is("revoked_at", null);
  if (error) throw new AppError("err_save_failed");
  if (formData.get("erase") === "1") {
    const { error: delError } = await db
      .from("health_observations")
      .delete()
      .eq("user_id", user.id)
      .eq("source", source);
    if (delError) throw new AppError("err_save_failed");
  }
  await audit(
    user.id,
    "wearable_consent_withdrawn",
    `${source}${formData.get("erase") === "1" ? " + erased" : ""}`,
  );
  revalidatePath("/wearables");
}

export interface ImportState {
  error?: ErrorKey;
  result?: BatchResult;
}

/** One chunk of an import prepared in the browser (daily figures, never the raw export). */
export async function importObservationsAction(
  source: string,
  rows: unknown[],
): Promise<ImportState> {
  try {
    const { userId, tier } = await gate();
    if (!isConsentSource(source) || source === "api" || !Array.isArray(rows))
      return { error: "err_invalid_input" };
    const out = await ingestObservations(userId, tier, source, rows);
    if (!out.ok) return { error: out.error };
    revalidatePath("/wearables");
    return { result: out.result };
  } catch (err) {
    console.error("[wearables] import failed:", err);
    return { error: toErrorKey(err) };
  }
}

export interface ManualState {
  error?: ErrorKey;
  saved?: boolean;
}

/** A reading the person types in (a blood-pressure cuff, a glucose meter, a scale). */
export async function addManualAction(
  _prev: ManualState,
  formData: FormData,
): Promise<ManualState> {
  try {
    const { userId, tier } = await gate();
    const type = formData.get("type");
    const date = String(formData.get("date") ?? "");
    const value = Number(String(formData.get("value") ?? "").replace(",", "."));
    if (
      !isObsType(type) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(value)
    )
      return { error: "err_invalid_input" };
    if (date > bangkokDate(new Date())) return { error: "err_invalid_input" };
    const out = await ingestObservations(userId, tier, "manual", [
      {
        type,
        value,
        start: date,
        device: "manual",
        external_id: `${type}:${date}:${Date.now()}`,
      },
    ]);
    if (!out.ok) return { error: out.error };
    if (out.result.accepted !== 1)
      return {
        error: out.result.reasons.plan
          ? "err_wearable_plan_type"
          : "err_wearable_value",
      };
    revalidatePath("/wearables");
    return { saved: true };
  } catch (err) {
    return { error: toErrorKey(err) };
  }
}

export interface TokenState {
  error?: ErrorKey;
  /** shown once; only its hash is kept */
  token?: string;
}

/** A token for a sender that cannot use the browser session (the companion app, a script). */
export async function createIngestTokenAction(
  _prev: TokenState,
  formData: FormData,
): Promise<TokenState> {
  try {
    const { userId } = await gate();
    const label = String(formData.get("label") ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!label) return { error: "err_invalid_input" };
    const db = createAdminClient();
    const { count } = await db
      .from("ingest_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("revoked_at", null);
    if ((count ?? 0) >= MAX_TOKENS) return { error: "err_wearable_tokens_max" };
    const secret = newToken();
    const { error } = await db
      .from("ingest_tokens")
      .insert({ user_id: userId, token_hash: hashToken(secret), label });
    if (error) return { error: "err_save_failed" };
    revalidatePath("/wearables");
    return { token: `${TOKEN_PREFIX}${secret}` };
  } catch (err) {
    return { error: toErrorKey(err) };
  }
}

export async function revokeIngestTokenAction(
  formData: FormData,
): Promise<void> {
  await assertFeature("wearables");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const { error } = await createAdminClient()
    .from("ingest_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error) throw new AppError("err_save_failed");
  revalidatePath("/wearables");
}

/** Erase every wearable reading the person has, from every source. */
export async function deleteAllWearableDataAction(): Promise<void> {
  await assertFeature("wearables");
  const user = await requireUser();
  const { error } = await createAdminClient()
    .from("health_observations")
    .delete()
    .eq("user_id", user.id);
  if (error) throw new AppError("err_save_failed");
  await audit(user.id, "wearable_data_erased", "all sources");
  revalidatePath("/wearables");
}
