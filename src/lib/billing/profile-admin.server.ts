import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGrant } from "./grants.server";
import { withGrant, type BillingProfile } from "./plan";

/** The billing columns read with the service role, for code that runs without the person's session (a webhook, the ingestion API, the quota check). */
export async function loadBillingProfileAdmin(
  userId: string,
): Promise<BillingProfile | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select(
      "plan_tier, plan_expires_at, trial_started_at, trial_ends_at, ai_suspended",
    )
    .eq("id", userId)
    .maybeSingle<BillingProfile>();
  return data ? withGrant(data, await loadGrant(userId)) : data;
}
