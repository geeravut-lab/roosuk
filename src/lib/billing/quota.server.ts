import "server-only";
import type { MeteredFeature } from "@/config/plans";
import { loadPlatformSettings } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBillingProfileAdmin } from "./profile-admin.server";
import { bangkokMonthStart } from "./period";
import { consumeQuota, type QuotaDecision, type QuotaDeps } from "./quota";

const deps: QuotaDeps = {
  loadProfile: loadBillingProfileAdmin,
  async loadSettings() {
    return (await loadPlatformSettings()).billing;
  },
  async consume(a) {
    return createAdminClient().rpc("consume_usage", {
      p_user: a.user,
      p_feature: a.feature,
      p_month: a.month,
      p_window_start: a.windowStart,
      p_limit: a.limit,
      p_month_cap: a.monthCap,
    });
  },
};

/** Check the plan's quota for `feature` and count one use. Call before every AI request. */
export function checkAndConsume(
  userId: string,
  feature: MeteredFeature,
): Promise<QuotaDecision> {
  return consumeQuota(userId, feature, deps);
}

/**
 * Give back one use of `feature` for the current month — for when the AI call
 * failed on our side or delivered nothing. Best-effort: a failure here is
 * logged, never thrown (the user's answer matters more than the counter).
 */
export async function refundUsage(
  userId: string,
  feature: MeteredFeature,
): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("refund_usage", {
      p_user: userId,
      p_feature: feature,
      p_month: bangkokMonthStart(new Date()),
    });
    if (error) console.error("[quota] refund_usage failed:", error.message);
  } catch (err) {
    console.error("[quota] refund_usage failed:", err);
  }
}
