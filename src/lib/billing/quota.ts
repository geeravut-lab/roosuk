import { z } from "zod";
import { quotaFor, type MeteredFeature } from "@/config/plans";
import { AppError } from "@/lib/errors";
import type { ErrorKey } from "@/lib/i18n/dict";
import { bangkokMonthStart, windowStart } from "./period";
import {
  fairUseCapFor,
  resolvePlan,
  type BillingProfile,
  type EffectivePlan,
} from "./plan";
import type { BillingSettings } from "./settings";

export interface ConsumeArgs {
  user: string;
  feature: MeteredFeature;
  month: string;
  windowStart: string;
  /** null = unlimited (still counted). */
  limit: number | null;
  /** 0 = no fair-use cap. */
  monthCap: number;
}

export interface QuotaDeps {
  loadProfile(userId: string): Promise<BillingProfile | null>;
  loadSettings(): Promise<BillingSettings>;
  /** Calls the `consume_usage` SQL function (service role). */
  consume(
    args: ConsumeArgs,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export type QuotaDecision =
  | {
      allowed: true;
      plan: EffectivePlan;
      used: number;
      limit: number | "unlimited";
    }
  | {
      allowed: false;
      plan: EffectivePlan;
      reason: "quota_exhausted" | "fair_use" | "suspended";
      error: ErrorKey;
    };

const consumeResult = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  used: z.number(),
});

const DENIAL_ERROR = {
  quota_exhausted: "err_quota_exhausted",
  fair_use: "err_fair_use",
  suspended: "err_ai_suspended",
} as const satisfies Record<string, ErrorKey>;

/**
 * THE gate: every AI call must pass through here first (docs/10-billing-and-quota.md).
 * It resolves the user's current plan, applies the quota + fair-use cap, and
 * counts the use atomically in the database. "Unlimited" is counted too.
 * Fails CLOSED — if the counter cannot be reached the call is refused, because
 * an unmetered AI call is exactly what this gate exists to prevent.
 */
export async function consumeQuota(
  userId: string,
  feature: MeteredFeature,
  deps: QuotaDeps,
  now: Date = new Date(),
): Promise<QuotaDecision> {
  const [profile, settings] = await Promise.all([
    deps.loadProfile(userId),
    deps.loadSettings(),
  ]);
  if (!profile) throw new AppError("err_not_signed_in");

  const plan = resolvePlan(profile, now);
  if (plan.suspended) {
    // Unpaid usage debt outranks any plan's entitlements.
    return {
      allowed: false,
      plan,
      reason: "suspended",
      error: DENIAL_ERROR.suspended,
    };
  }

  const quota = quotaFor(plan.tier, feature, settings.planOverrides);
  const month = bangkokMonthStart(now);
  const { data, error } = await deps.consume({
    user: userId,
    feature,
    month,
    windowStart: windowStart(month, quota.periodMonths),
    limit: quota.limit === "unlimited" ? null : quota.limit,
    monthCap: fairUseCapFor(plan, {
      trial: settings.fairUseCapTrial,
      premium: settings.fairUseCapPremium,
    }),
  });

  const parsed = consumeResult.safeParse(data);
  if (error || !parsed.success) {
    console.error(
      "[quota] consume_usage failed:",
      error?.message ?? parsed.error?.message,
    );
    throw new AppError("err_quota_unavailable");
  }

  if (parsed.data.allowed)
    return { allowed: true, plan, used: parsed.data.used, limit: quota.limit };
  const reason =
    parsed.data.reason === "fair_use" ? "fair_use" : "quota_exhausted";
  return { allowed: false, plan, reason, error: DENIAL_ERROR[reason] };
}
