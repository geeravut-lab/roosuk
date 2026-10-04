"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import {
  cleanCompanyCode,
  newCompanyCode,
  parseCompanyForm,
  type CompanyField,
} from "@/lib/corporate/corporate";
import { AppError } from "@/lib/errors";
import { assertFeature } from "@/lib/flags/server";
import { bangkokDate } from "@/lib/health/dates";
import type { ErrorKey } from "@/lib/i18n/dict";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (error?: ErrorKey, extra = "") =>
  redirect(`/company${error ? `?error=${error}` : extra ? `?${extra}` : ""}`);

/** Join a company with its code. Joining needs no plan: the seat is the company's. */
export async function joinCompanyAction(formData: FormData): Promise<void> {
  await assertFeature("corporate");
  const user = await requireUser();
  const code = cleanCompanyCode(formData.get("code"));
  if (!code) back("err_company_invalid");
  const { data, error } = await createAdminClient().rpc("join_company", {
    p_user: user.id,
    p_code: code,
    p_today: bangkokDate(new Date()),
  });
  if (error) {
    console.error("[company] join failed:", error.message);
    back("err_save_failed");
  }
  const r = data as { ok: boolean; reason?: string };
  if (!r.ok) back(`err_company_${r.reason}` as ErrorKey);
  revalidatePath("/company");
  back(undefined, "joined=1");
}

export async function leaveCompanyAction(): Promise<void> {
  await assertFeature("corporate");
  const user = await requireUser();
  const { error } = await createAdminClient()
    .from("company_members")
    .delete()
    .eq("user_id", user.id);
  if (error) back("err_save_failed");
  revalidatePath("/company");
  back(undefined, "left=1");
}

/** The person's own switch: count me in the company's anonymous group figures. The tick IS the explicit consent, and unticking withdraws it. */
export async function setCompanyStatsAction(formData: FormData): Promise<void> {
  await assertFeature("corporate");
  const user = await requireUser();
  const on = formData.get("share") === "on";
  const db = createAdminClient();
  const { data, error } = await db
    .from("company_members")
    .update({ share_stats: on })
    .eq("user_id", user.id)
    .select("user_id");
  if (error || data?.length !== 1) back("err_save_failed");
  await db.from("privacy_audit_log").insert({
    user_id: user.id,
    action: "company_stats_consent",
    detail: on ? "on" : "off",
    meta: {},
  });
  revalidatePath("/company");
  back(undefined, "saved=1");
}

// ── admin ───────────────────────────────────────────────────────────────────
export interface CompanyState {
  error?: ErrorKey;
  field?: CompanyField;
  saved?: boolean;
}

export async function saveCompanyAction(
  _prev: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const today = bangkokDate(new Date());
  // an existing company's end date may already be past (it is being looked at, not created)
  const parsed = parseCompanyForm(
    (k) => formData.get(k),
    UUID.test(id) ? "2000-01-01" : today,
  );
  if (!parsed.ok) return { error: "err_company_field", field: parsed.field };
  const v = parsed.value;
  const row = {
    name: v.name,
    seats: v.seats,
    tier: v.tier,
    valid_until: v.validUntil,
    note: v.note,
    active: v.active,
  };
  const db = createAdminClient();
  if (UUID.test(id)) {
    const { data, error } = await db
      .from("companies")
      .update(row)
      .eq("id", id)
      .select("id");
    if (error || data?.length !== 1) return { error: "err_save_failed" };
  } else {
    for (let i = 0; i < 10; i++) {
      const { data, error } = await db
        .from("companies")
        .insert({ ...row, code: newCompanyCode() })
        .select("id");
      if (!error && data?.length === 1) {
        revalidatePath("/admin/corporate");
        return { saved: true };
      }
      if (error?.code !== "23505") return { error: "err_save_failed" };
    }
    return { error: "err_save_failed" };
  }
  revalidatePath("/admin/corporate");
  return { saved: true };
}

export async function deleteCompanyAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) throw new AppError("err_invalid_input");
  const { error } = await createAdminClient()
    .from("companies")
    .delete()
    .eq("id", id);
  if (error) throw new AppError("err_save_failed");
  revalidatePath("/admin/corporate");
  redirect("/admin/corporate");
}
