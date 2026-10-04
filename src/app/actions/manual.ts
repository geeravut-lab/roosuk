"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import type { ErrorKey } from "@/lib/i18n/dict";
import { parseManualUrl } from "@/lib/settings/manual-url";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ManualState {
  error?: ErrorKey;
  saved?: "set" | "cleared";
}

/** Admin-only: where the "User guide" menu entry opens. Empty switches the entry off (greyed out). */
export async function saveManualUrlAction(
  _prev: ManualState,
  formData: FormData,
): Promise<ManualState> {
  const admin = await requireAdmin();
  const url = parseManualUrl(formData.get("manualUrl"));
  if (url === null) return { error: "err_manual_url" };
  const { data, error } = await createAdminClient()
    .from("platform_settings")
    .update({
      manual_url: url,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || data?.length !== 1) return { error: "err_save_failed" };
  invalidatePlatformSettingsCache();
  revalidatePath("/", "layout");
  return { saved: url ? "set" : "cleared" };
}
