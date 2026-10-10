import { z } from "zod";
import {
  DEFAULT_PRICING,
  METERED_FEATURES,
  PLAN_IDS,
  type Pricing,
  type QuotaOverrides,
} from "@/config/plans";
import { parsePlanSpecs, type PlanSpecOverrides } from "./specs";

export interface BillingSettings {
  trialDays: number;
  pricing: Pricing;
  /** Monthly fair-use caps on ALL AI calls (0 = none). Provisional defaults — tune from measured cost. */
  fairUseCapTrial: number;
  fairUseCapPremium: number;
  planOverrides: QuotaOverrides;
  /** Admin changes to a plan's history window, vault size, passport, agent, wearables, family seats. */
  planSpecs: PlanSpecOverrides;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  trialDays: 14,
  pricing: DEFAULT_PRICING,
  fairUseCapTrial: 200,
  fairUseCapPremium: 600,
  planOverrides: {},
  planSpecs: {},
};

// Each field falls back to its default on null / missing / out-of-range, so a
// half-migrated or hand-edited row degrades to known-good values instead of
// breaking billing (docs/10-billing-and-quota.md, docs/06-automation-rules.md).
const int = (fallback: number, max = 1_000_000) =>
  z
    .preprocess(
      (v) => (v === null || v === "" ? undefined : v),
      z.coerce.number().int().min(0).max(max),
    )
    .catch(fallback);

const limit = z.union([
  z.number().int().min(0).max(1_000_000),
  z.literal("unlimited"),
]);
const overrides = z
  .partialRecord(
    z.enum(PLAN_IDS as [string, ...string[]]),
    z.partialRecord(
      z.enum(METERED_FEATURES as unknown as [string, ...string[]]),
      limit,
    ),
  )
  .catch({});

export function parseBillingSettings(
  row: Record<string, unknown> | null | undefined,
): BillingSettings {
  const d = DEFAULT_BILLING_SETTINGS;
  const r = row ?? {};
  return {
    trialDays: int(d.trialDays, 365).parse(r.trial_days),
    pricing: {
      goldMonthly: int(d.pricing.goldMonthly).parse(r.price_gold_monthly),
      goldYearly: int(d.pricing.goldYearly).parse(r.price_gold_yearly),
      premiumMonthly: int(d.pricing.premiumMonthly).parse(
        r.price_premium_monthly,
      ),
      premiumYearly: int(d.pricing.premiumYearly).parse(r.price_premium_yearly),
    },
    fairUseCapTrial: int(d.fairUseCapTrial).parse(r.fair_use_cap_trial),
    fairUseCapPremium: int(d.fairUseCapPremium).parse(r.fair_use_cap_premium),
    planOverrides: overrides.parse(r.plan_overrides ?? {}) as QuotaOverrides,
    planSpecs: parsePlanSpecs(r.plan_specs),
  };
}
