import { z } from "zod";
import {
  PLANS,
  PLAN_IDS,
  quotaFor,
  type Plan,
  type PlanId,
  type QuotaOverrides,
} from "@/config/plans";

/** The plan details besides the AI quotas that an admin may change (differences from the defaults). */
export interface PlanSpecOverride {
  timelineHistoryMonths?: number | "unlimited";
  vaultMaxFiles?: number | "unlimited";
  healthPassport?: boolean;
  wearables?: Plan["wearables"];
  healthAgent?: boolean;
  familyMembers?: number;
}
export type PlanSpecOverrides = Partial<Record<PlanId, PlanSpecOverride>>;

const count = z.union([
  z.number().int().min(0).max(1_000_000),
  z.literal("unlimited"),
]);

const specSchema = z
  .object({
    timelineHistoryMonths: count.optional(),
    vaultMaxFiles: count.optional(),
    healthPassport: z.boolean().optional(),
    wearables: z.enum(["none", "basic", "full"]).optional(),
    healthAgent: z.boolean().optional(),
    familyMembers: z.number().int().min(0).max(20).optional(),
  })
  .strip()
  .catch({});

/** A stored object read back tolerantly: anything unreadable degrades to "no override". */
export function parsePlanSpecs(raw: unknown): PlanSpecOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PlanSpecOverrides = {};
  for (const id of PLAN_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (v === undefined) continue;
    const parsed = specSchema.parse(v);
    if (Object.keys(parsed).length) out[id] = parsed;
  }
  return out;
}

/**
 * A plan as it applies now: the defaults in src/config/plans.ts, with the admin's quota
 * overrides and detail overrides on top. Everything that reads a plan goes through here.
 */
export function resolvePlanSpec(
  id: PlanId,
  settings: { planOverrides: QuotaOverrides; planSpecs: PlanSpecOverrides },
): Plan {
  const base = PLANS[id];
  const quotas = { ...base.quotas };
  for (const feature of Object.keys(quotas) as (keyof Plan["quotas"])[])
    quotas[feature] = quotaFor(id, feature, settings.planOverrides);
  return { ...base, ...settings.planSpecs[id], id, quotas };
}
