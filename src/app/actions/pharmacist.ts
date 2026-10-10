"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { bangkokDate } from "@/lib/health/dates";
import {
  claimConsult,
  endConsult,
  loadPharmacist,
  saveRecord,
} from "@/lib/telepharmacy/server";
import { parseRecordForm } from "@/lib/telepharmacy/telepharmacy";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every pharmacist action starts here: the feature is on and the person is a pharmacist who may serve. */
async function pharmacistOnly() {
  await assertFeature("telepharmacy");
  const user = await requireUser();
  const p = await loadPharmacist(user.id);
  if (!p) throw new AppError("err_forbidden");
  return { user, p };
}

/** Take a waiting or booked call. One pharmacist wins; the others hear "already taken". */
export async function claimConsultAction(formData: FormData): Promise<void> {
  const { user } = await pharmacistOnly();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const r = await claimConsult(user.id, id);
  revalidatePath("/pharmacist");
  if (!r.ok) redirect(`/pharmacist?error=${r.error}`);
  redirect(`/pharmacist/consult/${id}`);
}

export async function endConsultAction(formData: FormData): Promise<void> {
  const { user } = await pharmacistOnly();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const error = await endConsult(user.id, id);
  revalidatePath("/pharmacist");
  redirect(
    error
      ? `/pharmacist/consult/${id}?error=${error}`
      : `/pharmacist/consult/${id}`,
  );
}

export interface RecordState {
  error?: ErrorKey;
  field?: string;
  saved?: "draft" | "final";
}

/** Save the record as a draft or finalise it. `intent` says which. */
export async function saveRecordAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const { user } = await pharmacistOnly();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "err_invalid_input" };
  const finalize = formData.get("intent") === "final";
  const parsed = parseRecordForm((k) => formData.get(k), bangkokDate(new Date()));
  if (!parsed.ok) return { error: "err_tele_record_field", field: parsed.field };
  const error = await saveRecord({
    pharmacistId: user.id,
    consultId: id,
    input: parsed.value,
    finalize,
  });
  if (error) return { error };
  revalidatePath(`/pharmacist/consult/${id}`);
  return { saved: finalize ? "final" : "draft" };
}

/** The follow-up outcome the pharmacist notes after the person answers — the only part of a final record that can still change. */
export async function saveFollowUpOutcomeAction(formData: FormData): Promise<void> {
  const { user } = await pharmacistOnly();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const outcome = String(formData.get("outcome") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  if (!outcome) redirect(`/pharmacist/consult/${id}?error=err_invalid_input`);
  const { data, error } = await createAdminClient()
    .from("consult_records")
    .update({
      follow_up_outcome: outcome,
      follow_up_done_at: new Date().toISOString(),
    })
    .eq("consult_id", id)
    .eq("pharmacist_id", user.id)
    .not("finalized_at", "is", null)
    .select("id");
  if (error || data?.length !== 1)
    redirect(`/pharmacist/consult/${id}?error=err_save_failed`);
  revalidatePath(`/pharmacist/consult/${id}`);
  redirect(`/pharmacist/consult/${id}`);
}

export interface ProfileState {
  error?: ErrorKey;
  saved?: boolean;
}

/** The pharmacist's own name and licence number. Changing the number takes the admin's verification away (database trigger). */
export async function savePharmacistProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const { user } = await pharmacistOnly();
  const name = String(formData.get("displayName") ?? "").replace(/\s+/g, " ").trim();
  const license = String(formData.get("licenseNo") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 80) return { error: "err_invalid_input" };
  if (license && (license.length < 3 || license.length > 40))
    return { error: "err_invalid_input" };
  const { data, error } = await createAdminClient()
    .from("pharmacists")
    .update({ display_name: name, license_no: license || null })
    .eq("user_id", user.id)
    .select("user_id");
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  revalidatePath("/pharmacist");
  return { saved: true };
}
