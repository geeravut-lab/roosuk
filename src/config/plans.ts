/**
 * Subscription tiers — source of truth:
 * docs/Precision Health Subscription Tiers Business Model.pdf (v1.1, Oct 2026).
 *
 * These are the DEFAULTS. Prices, the trial length, fair-use caps and quota
 * overrides are stored in `platform_settings` and win over this file at
 * runtime (src/lib/billing/settings.ts) — change numbers there, not here.
 *
 * Gold and Premium mirror the doc's feature table. Free ("Free-lite", the plan
 * a user falls back to after the 14-day Premium trial) follows the owner-
 * approved quotas in docs/ROOSUK-MASTER-PLAN.md §5.3 (D1–D2).
 */

export type PlanId = "free" | "gold" | "premium";
export const PLAN_IDS: readonly PlanId[] = ["free", "gold", "premium"];

/** Metered AI features — these drive variable cost, so they carry quotas. */
export const METERED_FEATURES = [
  "healthQuiz",
  "aiChat",
  "foodSnap",
  "labImport",
] as const;
export type MeteredFeature = (typeof METERED_FEATURES)[number];

export interface Quota {
  limit: number | "unlimited";
  /** Calendar months per window (1 = monthly, 3 = per quarter). */
  periodMonths: number;
}

export interface Plan {
  id: PlanId;
  quotas: Record<MeteredFeature, Quota>;
  timelineHistoryMonths: number | "unlimited";
  vaultMaxFiles: number | "unlimited";
  healthPassport: boolean;
  healthAgent: boolean;
  familyMembers: number;
}

const unlimited: Quota = { limit: "unlimited", periodMonths: 1 };
const monthly = (limit: number): Quota => ({ limit, periodMonths: 1 });

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    quotas: {
      healthQuiz: { limit: 1, periodMonths: 3 },
      aiChat: monthly(5),
      foodSnap: monthly(3),
      labImport: monthly(1),
    },
    timelineHistoryMonths: 1,
    vaultMaxFiles: 5,
    healthPassport: false,
    healthAgent: false,
    familyMembers: 0,
  },
  gold: {
    id: "gold",
    quotas: {
      healthQuiz: monthly(1),
      aiChat: monthly(30),
      foodSnap: monthly(15),
      labImport: monthly(3),
    },
    timelineHistoryMonths: 3,
    vaultMaxFiles: 20,
    healthPassport: false,
    healthAgent: false,
    familyMembers: 0,
  },
  premium: {
    id: "premium",
    quotas: {
      healthQuiz: unlimited,
      aiChat: unlimited,
      foodSnap: unlimited,
      labImport: unlimited,
    },
    timelineHistoryMonths: "unlimited",
    vaultMaxFiles: "unlimited",
    healthPassport: true,
    healthAgent: true,
    familyMembers: 1,
  },
};

export interface Pricing {
  goldMonthly: number;
  goldYearly: number;
  premiumMonthly: number;
  premiumYearly: number;
}

/** Owner decisions: Gold 49/490, Premium 89/890 (yearly = 10 months for 12). */
export const DEFAULT_PRICING: Pricing = {
  goldMonthly: 49,
  goldYearly: 490,
  premiumMonthly: 89,
  premiumYearly: 890,
};

/** A quota override from settings is a plain limit (the window stays the plan's). */
export type QuotaOverrides = Partial<
  Record<PlanId, Partial<Record<MeteredFeature, number | "unlimited">>>
>;

/** The quota that applies to a plan + feature, after admin overrides. */
export function quotaFor(
  planId: PlanId,
  feature: MeteredFeature,
  overrides: QuotaOverrides = {},
): Quota {
  const base = PLANS[planId].quotas[feature];
  const override = overrides[planId]?.[feature];
  return override === undefined ? base : { ...base, limit: override };
}
