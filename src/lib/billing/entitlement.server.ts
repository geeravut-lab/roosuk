import "server-only";
import type { PlanId } from "@/config/plans";
import { resolvePlan } from "./plan";
import { loadBillingProfileAdmin } from "./profile-admin.server";
import { getBillingProfile } from "./profile.server";

/** The plan tier that applies to this person right now (paid, family/company grant, trial, else free). */
export async function tierFor(userId: string): Promise<PlanId> {
  const billing = await getBillingProfile(userId);
  return billing ? resolvePlan(billing, new Date()).tier : "free";
}

/** Same, for code with no browser session (the ingestion API). */
export async function tierForAdmin(userId: string): Promise<PlanId> {
  const billing = await loadBillingProfileAdmin(userId);
  return billing ? resolvePlan(billing, new Date()).tier : "free";
}
