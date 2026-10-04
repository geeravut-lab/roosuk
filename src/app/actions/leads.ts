"use server";

import { revalidatePath } from "next/cache";
import { trackEvent } from "@/lib/analytics/server";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { cleanAdminNote, isLeadStatus, parseLeadForm } from "@/lib/leads/leads";
import { leadNewNotice } from "@/lib/notify/messages";
import { notifyAdmins } from "@/lib/notify/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LeadState {
  error?: ErrorKey;
  ok?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "สนใจตรวจสุขภาพ": records a callback request. It carries what the person typed
 * and their agreement to be contacted — never any health data. One open request
 * per person (a unique index), so a double click or a second try is refused.
 */
export async function submitLeadAction(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  try {
    const user = await requireUser();
    await assertFeature("checkup_lead");

    const parsed = parseLeadForm(formData);
    if (!parsed.ok) return { error: parsed.error };

    const { data, error } = await createAdminClient()
      .from("checkup_leads")
      .insert({ user_id: user.id, ...parsed.lead })
      .select("id");
    if (error?.code === "23505") return { error: "err_lead_exists" };
    if (error || data?.length !== 1) return { error: "err_save_failed" };

    await trackEvent("lead_created", user.id);
    // Tell the team (never fails the request: see notifyUser). Their language, their words.
    await notifyAdmins((t) =>
      leadNewNotice(
        t,
        data[0].id,
        t[`leadInterest_${parsed.lead.interest}` as const],
        parsed.lead.contact_method === "phone"
          ? t.leadContact_phone
          : t.leadContact_line,
      ),
    );
    revalidatePath("/checkup-interest");
    revalidatePath("/admin/leads");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { error: err instanceof AppError ? err.code : "err_unknown" };
  }
}

/** Withdraw an open request (the person changed their mind). */
export async function withdrawLeadAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("leadId");
  if (typeof id !== "string" || !UUID.test(id))
    throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient()
    .from("checkup_leads")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "new")
    .select("id");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/checkup-interest");
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

/** Admin: move a request along and keep a note. */
export async function updateLeadAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("leadId");
  const status = formData.get("status");
  if (typeof id !== "string" || !UUID.test(id) || !isLeadStatus(status))
    throw new AppError("err_invalid_input");
  const { data, error } = await createAdminClient()
    .from("checkup_leads")
    .update({
      status,
      admin_note: cleanAdminNote(formData.get("adminNote")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  // A move back to "new" can collide with another open request of the same person.
  if (error?.code === "23505") throw new AppError("err_lead_exists");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}
