import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantEnd } from "@/lib/corporate/corporate";
import { bestGrant, type PlanGrant } from "./plan";

/**
 * Plans other people's arrangements give someone, read with the service role (the
 * person's own session cannot see another person's billing): a family seat — the
 * member has Premium while the OWNER'S PAID Premium is live (an owner's free trial
 * does not extend to a family member) — and a company seat. The better one wins.
 */
export async function loadGrant(userId: string): Promise<PlanGrant | null> {
  const [family, company] = await Promise.all([
    familyGrant(userId),
    companyGrant(userId),
  ]);
  return bestGrant(family, company);
}

async function familyGrant(userId: string): Promise<PlanGrant | null> {
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

/** A company seat: the company's plan while the company is active and in date. */
async function companyGrant(userId: string): Promise<PlanGrant | null> {
  const db = createAdminClient();
  const { data: m } = await db
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle<{ company_id: string }>();
  if (!m) return null;
  const { data: c } = await db
    .from("companies")
    .select("tier, valid_until, active")
    .eq("id", m.company_id)
    .maybeSingle<{
      tier: "gold" | "premium";
      valid_until: string;
      active: boolean;
    }>();
  if (!c?.active) return null;
  const until = grantEnd(c.valid_until);
  return new Date(until) > new Date() ? { tier: c.tier, until } : null;
}
