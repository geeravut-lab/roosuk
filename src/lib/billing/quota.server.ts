import "server-only";
import type { MeteredFeature } from "@/config/plans";
import { loadPlatformSettings } from "@/lib/settings/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingProfile } from "./plan";
import { consumeQuota, type QuotaDecision, type QuotaDeps } from "./quota";

const deps: QuotaDeps = {
  async loadProfile(userId) {
    const { data } = await createAdminClient()
      .from("profiles")
      .select(
        "plan_tier, plan_expires_at, trial_started_at, trial_ends_at, ai_suspended",
      )
      .eq("id", userId)
      .maybeSingle<BillingProfile>();
    return data;
  },
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
