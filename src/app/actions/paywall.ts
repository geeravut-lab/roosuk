"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import { isPaywallMode } from "@/lib/paywall/paywall";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ErrorKey } from "@/lib/i18n/dict";

export interface PaywallState {
  error?: ErrorKey;
  saved?: boolean;
}

/** Admin-only: run the split, pin everyone to one version, or switch the test off. */
export async function savePaywallModeAction(
  _prev: PaywallState,
  formData: FormData,
): Promise<PaywallState> {
  const admin = await requireAdmin();
  const mode = formData.get("mode");
  if (!isPaywallMode(mode)) return { error: "err_invalid_input" };
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      paywall_ab: mode,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  invalidatePlatformSettingsCache();
  revalidatePath("/admin/paywall");
  revalidatePath("/subscription");
  return { saved: true };
}
