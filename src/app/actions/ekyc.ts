"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import {
  MAX_EKYC_IMAGE_BYTES,
  parseEkycForm,
  type FailReason,
} from "@/lib/ekyc/ekyc";
import { ekycDecisionNotice } from "@/lib/ekyc/notices";
import { verifyIdentity } from "@/lib/ekyc/service";
import {
  createKycStore,
  getEkycProvider,
  loadEkycSettings,
} from "@/lib/ekyc/server";
import { assertFeature } from "@/lib/flags/server";
import { parseGrantEmail } from "@/lib/admin/admins";
import type { ErrorKey } from "@/lib/i18n/dict";
import { dictFor, notifyUser } from "@/lib/notify/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EkycState {
  error?: ErrorKey;
  /** passed: verified now · review: sent to the team */
  result?: "passed" | "review";
  reasons?: FailReason[];
}

/** Read an uploaded picture, refusing an oversized one BEFORE it is read into memory. */
async function readImage(
  v: FormDataEntryValue | null,
): Promise<Uint8Array | null> {
  if (!(v instanceof File) || v.size === 0) return null;
  if (v.size > MAX_EKYC_IMAGE_BYTES)
    return new Uint8Array(MAX_EKYC_IMAGE_BYTES + 1);
  return new Uint8Array(await v.arrayBuffer());
}

/**
 * A person sends a live selfie and a document photo. Everything that matters is
 * decided on the server: the switches, the limits, the provider call, pass or fail.
 * The pictures live in this function's memory and nowhere else.
 */
export async function submitEkycAction(
  _prev: EkycState,
  formData: FormData,
): Promise<EkycState> {
  await assertFeature("ekyc");
  const user = await requireUser();
  const [settings, selfie, document] = await Promise.all([
    loadEkycSettings(),
    readImage(formData.get("selfie")),
    readImage(formData.get("document")),
  ]);
  const out = await verifyIdentity(
    {
      userId: user.id,
      settings,
      provider: getEkycProvider(),
      docType: formData.get("docType"),
      consent: formData.get("consent") === "on",
      selfie,
      document,
    },
    createKycStore(),
  );
  if (out.kind === "error") return { error: out.error };
  revalidatePath("/verify");
  return out.kind === "passed"
    ? { result: "passed" }
    : { result: "review", reasons: out.reasons };
}

// ── admin ───────────────────────────────────────────────────────────────────
export interface EkycSettingsState {
  error?: ErrorKey;
  field?: string;
  saved?: boolean;
}

export async function saveEkycSettingsAction(
  _prev: EkycSettingsState,
  formData: FormData,
): Promise<EkycSettingsState> {
  const admin = await requireAdmin();
  const parsed = parseEkycForm((k) => formData.get(k));
  if (!parsed.ok) return { error: "err_kyc_value", field: parsed.field };
  const { data, error } = await createAdminClient()
    .from("ekyc_settings")
    .update({
      ...parsed.columns,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  revalidatePath("/admin/ekyc");
  revalidatePath("/verify");
  return { saved: true };
}

function back(qs: string): never {
  return redirect(`/admin/ekyc?${qs}`);
}

async function review(formData: FormData, approve: boolean): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) back("error=err_invalid_input");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 500);
  const db = createAdminClient();
  const { data: row } = await db
    .from("ekyc_verifications")
    .select("user_id")
    .eq("id", id)
    .maybeSingle<{ user_id: string }>();
  const { data, error } = await db.rpc("ekyc_admin_review", {
    p_actor: admin.id,
    p_id: id,
    p_approve: approve,
    p_note: note,
  });
  if (error) back("error=err_save_failed");
  if (data === "forbidden") back("error=err_forbidden");
  if (data !== "ok") back("error=err_kyc_review_state");
  if (row) {
    const { t } = await dictFor(row.user_id);
    await notifyUser(row.user_id, ekycDecisionNotice(t, approve));
  }
  revalidatePath("/admin/ekyc");
  back(`done=${approve ? "approved" : "rejected"}`);
}

export async function approveEkycAction(formData: FormData): Promise<void> {
  await review(formData, true);
}
export async function rejectEkycAction(formData: FormData): Promise<void> {
  await review(formData, false);
}

/** Revoke a verification, or reset the attempts of ONE person, found by the e-mail of an existing account. */
async function manage(formData: FormData, intent: "revoke" | "reset") {
  const admin = await requireAdmin();
  const email = parseGrantEmail(formData.get("email"));
  if (!email) back("error=err_invalid_input");
  const db = createAdminClient();
  const { data: uid } = await db.rpc("user_id_by_email", { p_email: email });
  if (typeof uid !== "string") back("error=err_ekyc_no_such_user");
  const { data, error } =
    intent === "revoke"
      ? await db.rpc("ekyc_admin_revoke", {
          p_actor: admin.id,
          p_user: uid,
          p_note: "revoked by an admin",
        })
      : await db.rpc("ekyc_admin_reset", { p_actor: admin.id, p_user: uid });
  if (error) back("error=err_save_failed");
  if (data === "not_verified") back("error=err_ekyc_not_verified");
  if (data !== "ok") back("error=err_forbidden");
  revalidatePath("/admin/ekyc");
  back(`done=${intent === "revoke" ? "revoked" : "reset"}`);
}

export async function revokeEkycAction(formData: FormData): Promise<void> {
  await manage(formData, "revoke");
}
export async function resetEkycAction(formData: FormData): Promise<void> {
  await manage(formData, "reset");
}
