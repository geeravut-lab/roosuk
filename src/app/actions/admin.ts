"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { isFeatureFlag, normalizeFlags, withFlag } from "@/lib/flags/flags";
import { invalidatePlatformSettingsCache } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-only: turn a feature on/off. Stores only the disabled flags. */
export async function setFeatureFlagAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const flag = formData.get("flag");
  const enabled = formData.get("enabled") === "true";
  if (!isFeatureFlag(flag)) throw new AppError("err_invalid_input");

  const db = createAdminClient();
  const { data: row, error: readError } = await db
    .from("platform_settings")
    .select("feature_flags")
    .eq("id", true)
    .maybeSingle<{ feature_flags: unknown }>();
  if (readError || !row) throw new AppError("err_save_failed");

  const next = withFlag(normalizeFlags(row.feature_flags), flag, enabled);
  const { data: updated, error } = await db
    .from("platform_settings")
    .update({
      feature_flags: next,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  // An UPDATE that matches no row is "success" to PostgREST — count the rows.
  if (error || updated?.length !== 1) throw new AppError("err_save_failed");

  invalidatePlatformSettingsCache();
  revalidatePath("/admin/flags");
}
