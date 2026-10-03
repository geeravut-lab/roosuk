import {
  PLANS,
  quotaFor,
  type MeteredFeature,
  type PlanId,
  type Quota,
  type QuotaOverrides,
} from "@/config/plans";

/** The billing columns of `profiles` (server-written; users can only read them). */
export interface BillingProfile {
  plan_tier: PlanId;
  plan_expires_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  ai_suspended: boolean;
}

export type PlanSource = "paid" | "trial" | "free";

export interface EffectivePlan {
  /** The tier whose features apply right now. */
  tier: PlanId;
  source: PlanSource;
  /** Whole days left (rounded up) while on a trial, otherwise null. */
  trialDaysLeft: number | null;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  /** The trial was used and has ended. */
  trialEnded: boolean;
  suspended: boolean;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Which plan applies to this user right now. Expiry is checked on every call —
 * a stored `plan_tier` alone is never trusted (docs/04-subscriptions-…).
 * Order: a live paid plan, else a live trial (= Premium), else Free-lite.
 */
export function resolvePlan(
  profile: BillingProfile,
  now: Date = new Date(),
): EffectivePlan {
  const paidUntil = profile.plan_expires_at
    ? new Date(profile.plan_expires_at)
    : null;
  const trialEndsAt = profile.trial_ends_at
    ? new Date(profile.trial_ends_at)
    : null;
  const base = {
    paidUntil,
    trialEndsAt,
    suspended: profile.ai_suspended,
  };

  if (profile.plan_tier !== "free" && paidUntil && paidUntil > now) {
    return {
      ...base,
      tier: profile.plan_tier,
      source: "paid",
      trialDaysLeft: null,
      trialEnded: false,
    };
  }
  if (trialEndsAt && trialEndsAt > now) {
    return {
      ...base,
      tier: "premium",
      source: "trial",
      trialDaysLeft: Math.max(
        1,
        Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS),
      ),
      trialEnded: false,
    };
  }
  return {
    ...base,
    tier: "free",
    source: "free",
    trialDaysLeft: null,
    trialEnded: !!profile.trial_started_at,
  };
}

export interface FairUseCaps {
  trial: number;
  premium: number;
}

/** Monthly fair-use cap that applies to this plan (0 = none). Gold/Free are bound by per-feature quotas instead. */
export function fairUseCapFor(plan: EffectivePlan, caps: FairUseCaps): number {
  if (plan.source === "trial") return caps.trial;
  if (plan.source === "paid" && plan.tier === "premium") return caps.premium;
  return 0;
}

export interface UsageRow {
  feature: string;
  /** First day of the calendar month, YYYY-MM-01. */
  period_start: string;
  used: number;
}

export interface FeatureUsage {
  feature: MeteredFeature;
  used: number;
  quota: Quota;
  /** Uses left in the window, or "unlimited". */
  remaining: number | "unlimited";
  /** 0–100 for a bar; null when unlimited. */
  percent: number | null;
}

/** Usage per feature inside its current quota window — what the plan page's meters show. */
export function summarizeUsage(
  rows: readonly UsageRow[],
  tier: PlanId,
  features: readonly MeteredFeature[],
  monthStart: string,
  windowStartFor: (monthStart: string, periodMonths: number) => string,
  overrides: QuotaOverrides = {},
): FeatureUsage[] {
  return features.map((feature) => {
    const quota = quotaFor(tier, feature, overrides);
    const from = windowStartFor(monthStart, quota.periodMonths);
    const used = rows
      .filter(
        (r) =>
          r.feature === feature &&
          r.period_start >= from &&
          r.period_start <= monthStart,
      )
      .reduce((sum, r) => sum + r.used, 0);
    if (quota.limit === "unlimited")
      return { feature, used, quota, remaining: "unlimited", percent: null };
    return {
      feature,
      used,
      quota,
      remaining: Math.max(0, quota.limit - used),
      percent:
        quota.limit === 0
          ? 100
          : Math.min(100, Math.round((used / quota.limit) * 100)),
    };
  });
}

export function planHasFeature(
  tier: PlanId,
  flag: "healthPassport" | "healthAgent",
): boolean {
  return PLANS[tier][flag];
}
