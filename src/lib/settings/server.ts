import "server-only";
import { DEFAULT_BRAND, parseBrand, type Brand } from "@/lib/brand/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFlags, type FlagMap } from "@/lib/flags/flags";
import { isValidPromptpayId } from "@/lib/billing/promptpay";
import { isPaywallMode, type PaywallMode } from "@/lib/paywall/paywall";
import {
  DEFAULT_REWARD_SETTINGS,
  parseRewardSettings,
  type RewardSettings,
} from "@/lib/rewards/rewards";
import { DEFAULT_SHOP_SETTINGS, type ShopSettings } from "@/lib/shop/shop";
import {
  DEFAULT_BILLING_SETTINGS,
  parseBillingSettings,
  type BillingSettings,
} from "@/lib/billing/settings";

export interface PlatformSettings {
  featureFlags: FlagMap;
  manualUrl: string;
  /** PromptPay account the subscription QR pays into; null = payments not set up. */
  promptpayId: string | null;
  billing: BillingSettings;
  rewards: RewardSettings;
  /** paywall A/B: off, split, or pinned to one version */
  paywallMode: PaywallMode;
  /** shipping fee and the free-shipping line of the marketplace */
  shop: ShopSettings;
  /** app name (Thai/English), logo and tab icon set by the admin */
  brand: Brand;
}

const DEFAULTS: PlatformSettings = {
  featureFlags: {},
  manualUrl: "",
  promptpayId: null,
  billing: DEFAULT_BILLING_SETTINGS,
  rewards: DEFAULT_REWARD_SETTINGS,
  paywallMode: "ab",
  shop: DEFAULT_SHOP_SETTINGS,
  brand: DEFAULT_BRAND,
};

const nonNegInt = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
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
        promptpayId: isValidPromptpayId(String(data?.promptpay_id ?? ""))
          ? String(data?.promptpay_id)
          : null,
        billing: parseBillingSettings(data),
        rewards: parseRewardSettings(data),
        paywallMode: isPaywallMode(data?.paywall_ab) ? data.paywall_ab : "ab",
        brand: parseBrand(data?.brand),
        shop: {
          shippingThb: nonNegInt(
            data?.shop_shipping_thb,
            DEFAULT_SHOP_SETTINGS.shippingThb,
          ),
          freeShippingFromThb: nonNegInt(
            data?.shop_free_shipping_from_thb,
            DEFAULT_SHOP_SETTINGS.freeShippingFromThb,
          ),
        },
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
