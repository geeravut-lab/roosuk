import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanGrant } from "./plan";

/**
 * Plans other people's arrangements give someone, read with the service role (the
 * person's own session cannot see another person's billing). Today: a family seat —
 * the member has Premium while the OWNER'S PAID Premium is live (an owner's free
 * trial does not extend to a family member).
 */
export async function loadGrant(userId: string): Promise<PlanGrant | null> {
  const db = createAdminClient();
  const { data: seat } = await db
    .from("family_members")
    .select("owner_id")
    .eq("member_id", userId)
    .maybeSingle<{ owner_id: string }>();
  if (!seat) return null;
  const { data: owner } = await db
    .from("profiles")
    .select("plan_tier, plan_expires_at")
    .eq("id", seat.owner_id)
    .maybeSingle<{ plan_tier: string; plan_expires_at: string | null }>();
  if (
    owner?.plan_tier === "premium" &&
    owner.plan_expires_at &&
    new Date(owner.plan_expires_at) > new Date()
  )
    return { tier: "premium", until: owner.plan_expires_at };
  return null;
}
