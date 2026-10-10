import {
  METERED_FEATURES,
  PLANS,
  PLAN_IDS,
  type PlanId,
  type QuotaOverrides,
} from "@/config/plans";
import type { PlanSpecOverrides } from "./specs";

type Get = (name: string) => FormDataEntryValue | null;

export type PlansFormResult =
  | {
      ok: true;
      columns: {
        trial_days: number;
        price_gold_monthly: number;
        price_gold_yearly: number;
        price_premium_monthly: number;
        price_premium_yearly: number;
        fair_use_cap_trial: number;
        fair_use_cap_premium: number;
        plan_overrides: QuotaOverrides;
        plan_specs: PlanSpecOverrides;
      };
    }
  | { ok: false; field: string };

const MAX = 1_000_000;

const intIn = (v: FormDataEntryValue | null, max = MAX): number | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
};

/** A number, or "unlimited" when its box is ticked. */
const countField = (get: Get, name: string): number | "unlimited" | null =>
  get(`${name}_u`) === "on" ? "unlimited" : intIn(get(name));

/**
 * Reads the admin's plan form. Only DIFFERENCES from the defaults hard-coded in
 * src/config/plans.ts are stored (so changing a default later still reaches everyone
 * who was never customised, and "reset" is just an empty object). Prices, trial days
 * and caps are plain numbers. Returns the first field that is not valid.
 */
export function parsePlansForm(get: Get): PlansFormResult {
  const num = (name: string, max = MAX) => intIn(get(name), max);
  const trial = num("trial_days", 365);
  if (trial === null) return { ok: false, field: "trial_days" };
  const prices = {
    price_gold_monthly: num("price_gold_monthly"),
    price_gold_yearly: num("price_gold_yearly"),
    price_premium_monthly: num("price_premium_monthly"),
    price_premium_yearly: num("price_premium_yearly"),
  };
  for (const [k, v] of Object.entries(prices))
    if (v === null) return { ok: false, field: k };
  const capTrial = num("fair_use_cap_trial");
  if (capTrial === null) return { ok: false, field: "fair_use_cap_trial" };
  const capPremium = num("fair_use_cap_premium");
  if (capPremium === null) return { ok: false, field: "fair_use_cap_premium" };

  const overrides: QuotaOverrides = {};
  const specs: PlanSpecOverrides = {};
  for (const id of PLAN_IDS) {
    const base = PLANS[id];
    for (const f of METERED_FEATURES) {
      const v = countField(get, `q_${id}_${f}`);
      if (v === null) return { ok: false, field: `q_${id}_${f}` };
      if (v !== base.quotas[f].limit) (overrides[id] ??= {})[f] = v;
    }
    const spec: NonNullable<PlanSpecOverrides[PlanId]> = {};
    const tl = countField(get, `tl_${id}`);
    if (tl === null) return { ok: false, field: `tl_${id}` };
    if (tl !== base.timelineHistoryMonths) spec.timelineHistoryMonths = tl;
    const vault = countField(get, `vault_${id}`);
    if (vault === null) return { ok: false, field: `vault_${id}` };
    if (vault !== base.vaultMaxFiles) spec.vaultMaxFiles = vault;
    const family = intIn(get(`family_${id}`), 20);
    if (family === null) return { ok: false, field: `family_${id}` };
    if (family !== base.familyMembers) spec.familyMembers = family;
    const passport = get(`passport_${id}`) === "on";
    if (passport !== base.healthPassport) spec.healthPassport = passport;
    const agent = get(`agent_${id}`) === "on";
    if (agent !== base.healthAgent) spec.healthAgent = agent;
    const wear = get(`wear_${id}`);
    if (wear !== "none" && wear !== "basic" && wear !== "full")
      return { ok: false, field: `wear_${id}` };
    if (wear !== base.wearables) spec.wearables = wear;
    if (Object.keys(spec).length) specs[id] = spec;
  }
  return {
    ok: true,
    columns: {
      trial_days: trial,
      ...(prices as Record<keyof typeof prices, number>),
      fair_use_cap_trial: capTrial,
      fair_use_cap_premium: capPremium,
      plan_overrides: overrides,
      plan_specs: specs,
    },
  };
}
