"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { getLatestConsent } from "@/lib/consent/server";
import { OWNED_TABLES } from "@/config/user-data";
import type { ErrorKey } from "@/lib/i18n/dict";
import { getT } from "@/lib/i18n/server";
import { buildExport } from "@/lib/privacy/export.server";
import {
  isDeletePhrase,
  mergeOptionalConsent,
  summariseDeletion,
} from "@/lib/privacy/privacy";
import { removeAllUserFiles } from "@/lib/files/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ExportResult =
  | {
      ok: true;
      filename: string;
      json: string;
      rows: number;
      skipped: string[];
    }
  | { ok: false; error: ErrorKey };

/**
 * "Download my data". Returns the file as a string for the browser to save, so no
 * copy of a person's health data is left on the server (docs/13).
 */
export async function exportMyDataAction(): Promise<ExportResult> {
  const user = await requireUser();
  try {
    const t = await getT();
    const { filename, json, manifest } = await buildExport(user.id, [
      t.exportNotIncluded1,
      t.exportNotIncluded2,
      t.exportNotIncluded3,
      t.exportNotIncluded4,
    ]);
    return {
      ok: true,
      filename,
      json,
      rows: Object.values(manifest.tables).reduce((s, n) => s + n, 0),
      skipped: Object.keys(manifest.skipped),
    };
  } catch (err) {
    console.error("[privacy] export failed:", err);
    return { ok: false, error: "err_unknown" };
  }
}

export interface DeleteState {
  error?: ErrorKey;
}

/**
 * Delete the account. Checked twice (the typed phrase is verified here too — the
 * UI is not a security boundary), the audit row is written BEFORE the user
 * disappears, and if anything fails the account is still intact. Deleting the auth
 * user cascades every erased table; money and audit trails stay, detached from the
 * person (their user_id becomes null).
 */
export async function deleteAccountAction(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const user = await requireUser();
  if (!isDeletePhrase(formData.get("phrase")))
    return { error: "err_confirm_phrase" };

  const db = createAdminClient();

  // Never leave the platform without an admin (nobody could fix a payment or a setting).
  const { data: admins } = await db
    .from("admins")
    .select("user_id")
    .returns<{ user_id: string }[]>();
  const isAdmin = (admins ?? []).some((a) => a.user_id === user.id);
  if (isAdmin && (admins ?? []).length <= 1) return { error: "err_last_admin" };

  // What is about to disappear, for the audit record (counts only, never content).
  const counts: Record<string, number> = {};
  for (const t of OWNED_TABLES) {
    const { count } = await db
      .from(t.table)
      .select("*", { count: "exact", head: true })
      .eq(t.column, user.id);
    counts[t.table] = count ?? 0;
  }
  const { erasedRows, retainedRows } = summariseDeletion(counts);

  const { error: auditError } = await db.from("privacy_audit_log").insert({
    user_id: user.id,
    action: "account_deleted",
    detail: `erased ${erasedRows} rows, retained ${retainedRows} detached rows`,
    meta: { counts },
  });
  if (auditError) return { error: "err_save_failed" };

  // Kept source files live in Storage, not in a table the account's cascade reaches:
  // remove them first, and stop here if that fails rather than leave sealed files behind.
  try {
    await removeAllUserFiles(user.id);
  } catch (err) {
    console.error("[privacy] could not remove kept files:", err);
    return { error: "err_save_failed" };
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[privacy] deleteUser failed:", error.message);
    return { error: "err_save_failed" };
  }

  // Sign out everywhere (the account is gone; the browser still holds a cookie).
  try {
    await (await createClient()).auth.signOut({ scope: "global" });
  } catch {
    /* the session died with the user */
  }
  redirect("/?deleted=1");
}

/** Change the optional consents (photos, marketing): appends a record; required items carry over. */
export async function updateOptionalConsentAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const latest = await getLatestConsent(user.id);
  if (!latest) redirect("/consent");
  const merged = mergeOptionalConsent(latest.items, formData);
  if (!merged.ok) redirect("/consent");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consent_records")
    .insert({
      user_id: user.id,
      policy_version: latest.policy_version,
      items: merged.items,
    })
    .select("id");
  if (error || data?.length !== 1) redirect("/settings?error=err_save_failed");

  await createAdminClient()
    .from("privacy_audit_log")
    .insert({
      user_id: user.id,
      action: "consent_changed",
      detail: "optional consents updated",
      meta: { photos: merged.items.photos, marketing: merged.items.marketing },
    });
  revalidatePath("/settings");
  redirect("/settings?consent=saved");
}
