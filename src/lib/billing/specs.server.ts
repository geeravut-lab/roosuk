import "server-only";
import type { Plan, PlanId } from "@/config/plans";
import { loadPlatformSettings } from "@/lib/settings/server";
import { resolvePlanSpec } from "./specs";

/** The plan's details as they apply now (defaults + admin changes). */
export async function planSpec(id: PlanId): Promise<Plan> {
  return resolvePlanSpec(id, (await loadPlatformSettings()).billing);
}
