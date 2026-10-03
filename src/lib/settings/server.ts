import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFlags, type FlagMap } from "@/lib/flags/flags";

export interface PlatformSettings {
  featureFlags: FlagMap;
  manualUrl: string;
}

const DEFAULTS: PlatformSettings = { featureFlags: {}, manualUrl: "" };

// 30 s is the promise made to the admin page ("takes effect within 1 minute"):
// each server instance keeps its own copy, so a longer TTL would let instances
// disagree for longer and a shorter one adds a DB read to almost every request.
const TTL_MS = 30_000;

let cache: { value: PlatformSettings; at: number } | undefined;

/**
 * Reads platform_settings with a short cache. If the read fails we keep the
 * last known values — or the defaults (everything on) if there are none — so a
 * settings outage never takes working features down with it.
 */
export async function loadPlatformSettings(): Promise<PlatformSettings> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;

  try {
    const { data, error } = await createAdminClient()
      .from("platform_settings")
      .select("feature_flags, manual_url")
      .maybeSingle<{ feature_flags: unknown; manual_url: string | null }>();
    if (error) throw error;
    cache = {
      value: {
        featureFlags: normalizeFlags(data?.feature_flags),
        manualUrl: (data?.manual_url ?? "").trim(),
      },
      at: now,
    };
  } catch (err) {
    console.warn(
      "[settings] could not read platform_settings, keeping previous values:",
      err,
    );
    cache = { value: cache?.value ?? DEFAULTS, at: now };
  }
  return cache.value;
}

/** Clears this instance's copy (other instances converge when their TTL expires). */
export function invalidatePlatformSettingsCache(): void {
  cache = undefined;
}
