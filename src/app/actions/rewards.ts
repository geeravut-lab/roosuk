"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import { parseRewardForm } from "@/lib/rewards/rewards";
import { attachReferral } from "@/lib/rewards/server";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ErrorKey } from "@/lib/i18n/dict";

/** A friend's code typed by hand (for someone who did not come through an invite link). */
export async function applyReferralCodeAction(
  formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const result = await attachReferral(user.id, formData.get("code"));
  revalidatePath("/rewards");
  redirect(`/rewards?code=${result}`);
}

export interface RewardSettingsState {
  error?: ErrorKey;
  field?: string;
  saved?: boolean;
}

/** Admin-only: the reward amounts and limits. */
export async function saveRewardSettingsAction(
  _prev: RewardSettingsState,
  formData: FormData,
): Promise<RewardSettingsState> {
  const admin = await requireAdmin();
  const parsed = parseRewardForm((k) => formData.get(k));
  if (!parsed.ok) return { error: "err_reward_value", field: parsed.field };
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      ...parsed.columns,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  invalidatePlatformSettingsCache();
  revalidatePath("/admin/rewards");
  revalidatePath("/rewards");
  revalidatePath("/subscription");
  return { saved: true };
}
