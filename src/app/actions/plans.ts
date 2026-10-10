"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_PRICING } from "@/config/plans";
import { requireAdmin } from "@/lib/auth/server";
import { DEFAULT_BILLING_SETTINGS } from "@/lib/billing/settings";
import { parsePlansForm } from "@/lib/billing/plans-form";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ErrorKey } from "@/lib/i18n/dict";

export interface PlansState {
  error?: ErrorKey;
  field?: string;
  saved?: boolean;
  reset?: boolean;
}

async function write(
  adminId: string,
  columns: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      ...columns,
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) return false;
  invalidatePlatformSettingsCache();
  for (const p of ["/admin/plans", "/subscription"]) revalidatePath(p);
  return true;
}

/** Admin-only: prices, trial length, caps, quotas and what each plan includes. */
export async function savePlansAction(
  _prev: PlansState,
  formData: FormData,
): Promise<PlansState> {
  const admin = await requireAdmin();
  const parsed = parsePlansForm((k) => formData.get(k));
  if (!parsed.ok) return { error: "err_plan_value", field: parsed.field };
  if (!(await write(admin.id, parsed.columns)))
    return { error: "err_save_failed" };
  return { saved: true };
}

/** Admin-only: back to the defaults built into the system. */
export async function resetPlansAction(): Promise<PlansState> {
  const admin = await requireAdmin();
  const d = DEFAULT_BILLING_SETTINGS;
  const ok = await write(admin.id, {
    trial_days: d.trialDays,
    price_gold_monthly: DEFAULT_PRICING.goldMonthly,
    price_gold_yearly: DEFAULT_PRICING.goldYearly,
    price_premium_monthly: DEFAULT_PRICING.premiumMonthly,
    price_premium_yearly: DEFAULT_PRICING.premiumYearly,
    fair_use_cap_trial: d.fairUseCapTrial,
    fair_use_cap_premium: d.fairUseCapPremium,
    plan_overrides: {},
    plan_specs: {},
  });
  return ok ? { reset: true } : { error: "err_save_failed" };
}
