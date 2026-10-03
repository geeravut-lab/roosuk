/**
 * Subscription tiers — source of truth:
 * docs/Precision Health Subscription Tiers Business Model.pdf (v1.1, Oct 2026).
 *
 * Gold and Premium mirror the doc's feature table. Free is not specified in
 * that doc beyond "limited AI chat + manual tracking", so its numbers are
 * placeholders until product decides.
 */

export type PlanId = "free" | "gold" | "premium";

export type Quota = number | "unlimited";

/** Metered AI features — these drive variable cost, so they carry monthly quotas. */
export type MeteredFeature = "healthQuiz" | "aiChat" | "foodSnap" | "labImport";

export interface Plan {
  id: PlanId;
  priceThbPerMonth: number;
  monthlyQuota: Record<MeteredFeature, Quota>;
  timelineHistoryMonths: Quota;
  vaultMaxFiles: Quota;
  healthPassport: boolean;
  healthAgent: boolean;
  familyMembers: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    priceThbPerMonth: 0,
    // Placeholder limits — not defined in the business model doc.
    monthlyQuota: { healthQuiz: 1, aiChat: 10, foodSnap: 3, labImport: 1 },
    timelineHistoryMonths: 1,
    vaultMaxFiles: 5,
    healthPassport: false,
    healthAgent: false,
    familyMembers: 0,
  },
  gold: {
    id: "gold",
    priceThbPerMonth: 49,
    monthlyQuota: { healthQuiz: 1, aiChat: 30, foodSnap: 15, labImport: 3 },
    timelineHistoryMonths: 3,
    vaultMaxFiles: 20,
    healthPassport: false,
    healthAgent: false,
    familyMembers: 0,
  },
  premium: {
    id: "premium",
    priceThbPerMonth: 89,
    monthlyQuota: {
      healthQuiz: "unlimited",
      aiChat: "unlimited",
      foodSnap: "unlimited",
      labImport: "unlimited",
    },
    timelineHistoryMonths: "unlimited",
    vaultMaxFiles: "unlimited",
    healthPassport: true,
    healthAgent: true,
    familyMembers: 1,
  },
};

/** Remaining uses this month, or "unlimited". Never negative. */
export function remainingQuota(
  planId: PlanId,
  feature: MeteredFeature,
  usedThisMonth: number,
): Quota {
  const quota = PLANS[planId].monthlyQuota[feature];
  if (quota === "unlimited") return quota;
  return Math.max(0, quota - usedThisMonth);
}

export function canUse(
  planId: PlanId,
  feature: MeteredFeature,
  usedThisMonth: number,
): boolean {
  const remaining = remainingQuota(planId, feature, usedThisMonth);
  return remaining === "unlimited" || remaining > 0;
}
