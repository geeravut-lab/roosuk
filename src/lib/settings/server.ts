import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFlags, type FlagMap } from "@/lib/flags/flags";
import {
  DEFAULT_BILLING_SETTINGS,
  parseBillingSettings,
  type BillingSettings,
} from "@/lib/billing/settings";

export interface PlatformSettings {
  featureFlags: FlagMap;
  manualUrl: string;
  billing: BillingSettings;
}

const DEFAULTS: PlatformSettings = {
  featureFlags: {},
  manualUrl: "",
  billing: DEFAULT_BILLING_SETTINGS,
};

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
    // select("*") + tolerant parsing: a column added by a migration that has not
    // been applied yet must degrade to its default, not make the whole read fail.
    const { data, error } = await createAdminClient()
      .from("platform_settings")
      .select("*")
      .maybeSingle<Record<string, unknown>>();
    if (error) throw error;
    cache = {
      value: {
        featureFlags: normalizeFlags(data?.feature_flags),
        manualUrl: String(data?.manual_url ?? "").trim(),
        billing: parseBillingSettings(data),
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
