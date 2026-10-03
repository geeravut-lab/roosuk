import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BillingProfile, UsageRow } from "./plan";

/** The signed-in user's plan/trial columns (read with their own client; RLS limits it to their row). */
export const getBillingProfile = cache(
  async (userId: string): Promise<BillingProfile | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "plan_tier, plan_expires_at, trial_started_at, trial_ends_at, ai_suspended",
      )
      .eq("id", userId)
      .maybeSingle<BillingProfile>();
    return data;
  },
);

/** Usage counters from the last 12 months — enough to cover any quota window. */
export async function getUsageRows(
  userId: string,
  monthStart: string,
): Promise<UsageRow[]> {
  const supabase = await createClient();
  const [y, m] = monthStart.split("-").map(Number);
  const from = `${y - 1}-${String(m).padStart(2, "0")}-01`;
  const { data } = await supabase
    .from("ai_usage")
    .select("feature, period_start, used")
    .eq("user_id", userId)
    .gte("period_start", from);
  return (data ?? []) as UsageRow[];
}
