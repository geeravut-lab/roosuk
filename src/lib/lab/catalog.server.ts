import "server-only";
import { setExtraBiomarkers } from "@/config/biomarkers";
import { createAdminClient } from "@/lib/supabase/admin";
import { toBiomarker, type ExtraRow } from "./custom-markers";

// The approved extras change rarely; a minute is the promise made to the admin page.
const TTL_MS = 60_000;
let loadedAt = 0;

/**
 * Make the APPROVED extras part of the catalog for this server instance. Call it
 * before judging, reading or displaying lab values. A failed read keeps whatever
 * was loaded last (or just the code table): worst case a new test shows as "not
 * assessed" for a minute, never a wrong status.
 */
export async function ensureCatalog(): Promise<void> {
  const now = Date.now();
  if (now - loadedAt < TTL_MS) return;
  try {
    const { data, error } = await createAdminClient()
      .from("biomarker_extras")
      .select(
        "key, th, en, unit, normal_lo, normal_hi, watch_lo, watch_hi, aliases, conversions",
      )
      .eq("status", "approved")
      .limit(500)
      .returns<ExtraRow[]>();
    if (error) throw error;
    setExtraBiomarkers((data ?? []).map(toBiomarker));
    loadedAt = now;
  } catch (err) {
    console.warn(
      "[lab] could not read biomarker_extras, keeping the loaded catalog:",
      err,
    );
    loadedAt = now - TTL_MS + 10_000; // try again in 10 s
  }
}

export function invalidateCatalogCache(): void {
  loadedAt = 0;
}
