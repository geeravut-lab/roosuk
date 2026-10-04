"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Marks the user's own notifications read (RLS limits the update to their rows). */
export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("app_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  revalidatePath("/", "layout");
  redirect("/notifications");
}

/**
 * The user's own LINE switches. Not an upsert: users have no UPDATE right on the
 * key column, which an upsert would write — update first, insert if there is no row.
 */
export async function savePrefsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const prefs = {
    line_transactional: formData.get("line_transactional") === "on",
    line_reminders: formData.get("line_reminders") === "on",
  };
  const supabase = await createClient();
  const update = () =>
    supabase
      .from("notification_prefs")
      .update(prefs)
      .eq("user_id", user.id)
      .select("user_id");
  let { data, error } = await update();
  if (!error && data?.length === 0) {
    const inserted = await supabase
      .from("notification_prefs")
      .insert({ user_id: user.id, ...prefs })
      .select("user_id");
    if (inserted.error?.code === "23505") ({ data, error } = await update());
    else ({ data, error } = inserted);
  }
  if (error || data?.length !== 1) redirect("/settings?error=err_save_failed");
  revalidatePath("/settings");
  redirect("/settings?notif=saved");
}

// ── admin ──────────────────────────────────────────────────────────────────
const KEY = /^[a-z_]{1,60}$/;
const PARAM = /^[a-z_]{1,40}$/;

/** Switch a rule on/off and set its numbers. Only the keys the rule already has can be edited. */
export async function saveRuleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (!KEY.test(key)) throw new AppError("err_invalid_input");

  const db = createAdminClient();
  const { data: rule } = await db
    .from("automation_rules")
    .select("params")
    .eq("key", key)
    .maybeSingle<{ params: Record<string, unknown> }>();
  if (!rule) throw new AppError("err_invalid_input");

  const params: Record<string, number> = {};
  for (const name of Object.keys(rule.params)) {
    if (!PARAM.test(name)) continue;
    const n = Number(formData.get(`param.${name}`));
    if (!Number.isFinite(n) || n < 0 || n > 10_000)
      throw new AppError("err_invalid_input");
    params[name] = Math.round(n);
  }

  const { data, error } = await db
    .from("automation_rules")
    .update({
      enabled: formData.get("enabled") === "on",
      params,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("key", key)
    .select("key");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/admin/rules");
}

/** The LINE monthly cap, the reserve, and an explicit "resume" after an automatic halt. */
export async function saveLineSettingsAction(
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin();
  const cap = Number(formData.get("cap"));
  const reserve = Number(formData.get("reserve"));
  if (
    !Number.isInteger(cap) ||
    cap < 0 ||
    cap > 1_000_000 ||
    !Number.isInteger(reserve) ||
    reserve < 0 ||
    reserve > cap
  )
    throw new AppError("err_invalid_input");

  const { data, error } = await createAdminClient()
    .from("notification_settings")
    .update({
      line_monthly_cap: cap,
      line_reserve: reserve,
      ...(formData.get("resume") === "on"
        ? { halted_until: null, halted_reason: null }
        : {}),
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error || data?.length !== 1) throw new AppError("err_save_failed");
  revalidatePath("/admin/rules");
}
