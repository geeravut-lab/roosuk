"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseGrantEmail } from "@/lib/admin/admins";
import { requireAdmin } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { isDeletePhrase } from "@/lib/privacy/privacy";
import { loadTeleSettings } from "@/lib/telepharmacy/server";
import { parseTeleForm, type TeleField } from "@/lib/telepharmacy/telepharmacy";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TeleSettingsState {
  error?: ErrorKey;
  field?: TeleField;
  saved?: boolean;
}

export async function saveTeleSettingsAction(
  _prev: TeleSettingsState,
  formData: FormData,
): Promise<TeleSettingsState> {
  await assertFeature("telepharmacy");
  const admin = await requireAdmin();
  const previous = await loadTeleSettings();
  const parsed = parseTeleForm((k) => formData.get(k), previous);
  if (!parsed.ok) return { error: "err_tele_value", field: parsed.field };
  const { data, error } = await createAdminClient()
    .from("telepharmacy_settings")
    .update({
      ...parsed.columns,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  revalidatePath("/admin/telepharmacy");
  revalidatePath("/telepharmacy");
  return { saved: true };
}

function back(qs: string): never {
  return redirect(`/admin/telepharmacy?${qs}#pharmacists`);
}

/** Make an existing account a pharmacist, by e-mail. The licence is NOT verified by this: only the licence button does that. */
export async function addPharmacistAction(formData: FormData): Promise<void> {
  await assertFeature("telepharmacy");
  const admin = await requireAdmin();
  const email = parseGrantEmail(formData.get("email"));
  if (!email) back("error=err_invalid_input");
  const name = String(formData.get("displayName") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const { data, error } = await createAdminClient().rpc(
    "admin_add_pharmacist",
    {
      p_actor: admin.id,
      p_email: email,
      p_name: name,
    },
  );
  if (error) back("error=err_save_failed");
  if (data === "not_found") back("error=err_admin_not_found");
  if (data === "already") back("error=err_tele_pharmacist_already");
  if (data !== "ok") back("error=err_forbidden");
  revalidatePath("/admin/telepharmacy");
  back("done=added");
}

export async function removePharmacistAction(
  formData: FormData,
): Promise<void> {
  await assertFeature("telepharmacy");
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient().rpc(
    "admin_remove_pharmacist",
    {
      p_actor: admin.id,
      p_user: id,
    },
  );
  if (error) back("error=err_save_failed");
  if (data === "busy") back("error=err_tele_busy");
  if (data !== "ok") back("error=err_forbidden");
  revalidatePath("/admin/telepharmacy");
  back("done=removed");
}

/** The ONLY place a licence becomes verified (or stops being): a person checked it against the source. */
export async function setLicenseAction(formData: FormData): Promise<void> {
  await assertFeature("telepharmacy");
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const verified = formData.get("verified") === "1";
  const { data, error } = await createAdminClient().rpc(
    "admin_set_license_verified",
    {
      p_actor: admin.id,
      p_user: id,
      p_verified: verified,
    },
  );
  if (error) back("error=err_save_failed");
  if (data === "no_license") back("error=err_tele_no_license");
  if (data !== "ok") back("error=err_forbidden");
  revalidatePath("/admin/telepharmacy");
  back(`done=${verified ? "verified" : "unverified"}`);
}

/**
 * Delete finished consults older than the retention period. Never automatic (pharmacy records
 * may be required by law): an admin types the confirmation word and the act is logged.
 */
export async function purgeConsultsAction(formData: FormData): Promise<void> {
  await assertFeature("telepharmacy");
  const admin = await requireAdmin();
  if (!isDeletePhrase(formData.get("confirm"))) back("error=err_tele_confirm");
  const { data, error } = await createAdminClient().rpc(
    "admin_purge_consults",
    {
      p_actor: admin.id,
    },
  );
  if (error || typeof data !== "number" || data < 0)
    back("error=err_save_failed");
  revalidatePath("/admin/telepharmacy");
  back(`done=purged&n=${data}`);
}
