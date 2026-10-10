import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING,
  METERED_FEATURES,
  PLANS,
  PLAN_IDS,
} from "@/config/plans";
import { parsePlansForm } from "./plans-form";
import { DEFAULT_BILLING_SETTINGS, parseBillingSettings } from "./settings";
import { parsePlanSpecs, resolvePlanSpec } from "./specs";

/** A form filled with the built-in defaults, optionally changed. */
function form(changes: Record<string, string | null> = {}) {
  const f: Record<string, string> = {
    trial_days: "14",
    price_gold_monthly: String(DEFAULT_PRICING.goldMonthly),
    price_gold_yearly: String(DEFAULT_PRICING.goldYearly),
    price_premium_monthly: String(DEFAULT_PRICING.premiumMonthly),
    price_premium_yearly: String(DEFAULT_PRICING.premiumYearly),
    fair_use_cap_trial: "200",
    fair_use_cap_premium: "600",
  };
  for (const id of PLAN_IDS) {
    const p = PLANS[id];
    for (const feat of METERED_FEATURES) {
      const l = p.quotas[feat].limit;
      if (l === "unlimited") f[`q_${id}_${feat}_u`] = "on";
      else f[`q_${id}_${feat}`] = String(l);
    }
    for (const [k, v] of [
      ["tl", p.timelineHistoryMonths],
      ["vault", p.vaultMaxFiles],
    ] as const) {
      if (v === "unlimited") f[`${k}_${id}_u`] = "on";
      else f[`${k}_${id}`] = String(v);
    }
    f[`family_${id}`] = String(p.familyMembers);
    f[`wear_${id}`] = p.wearables;
    if (p.healthPassport) f[`passport_${id}`] = "on";
    if (p.healthAgent) f[`agent_${id}`] = "on";
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete f[k];
    else f[k] = v;
  }
  return (name: string) => f[name] ?? null;
}

describe("parsePlansForm", () => {
  it("the built-in defaults store no overrides at all", () => {
    const r = parsePlansForm(form());
    expect(r).toMatchObject({
      ok: true,
      columns: { plan_overrides: {}, plan_specs: {}, trial_days: 14 },
    });
  });

  it("stores only what differs from the defaults", () => {
    const r = parsePlansForm(
      form({
        price_gold_monthly: "59",
        q_gold_aiChat: "50",
        q_free_foodSnap: "10",
        vault_gold: "40",
        agent_gold: "on",
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns.price_gold_monthly).toBe(59);
    expect(r.columns.plan_overrides).toEqual({
      gold: { aiChat: 50 },
      free: { foodSnap: 10 },
    });
    expect(r.columns.plan_specs).toEqual({
      gold: { vaultMaxFiles: 40, healthAgent: true },
    });
  });

  it("an unlimited box wins over the number and can be undone", () => {
    const r = parsePlansForm(
      form({ q_gold_aiChat_u: "on", q_gold_aiChat: "5" }),
    );
    expect(r.ok && r.columns.plan_overrides).toEqual({
      gold: { aiChat: "unlimited" },
    });
    const back = parsePlansForm(
      form({ q_premium_aiChat_u: null, q_premium_aiChat: "100" }),
    );
    expect(back.ok && back.columns.plan_overrides).toEqual({
      premium: { aiChat: 100 },
    });
  });

  it("names the first bad field", () => {
    expect(parsePlansForm(form({ price_gold_yearly: "-5" }))).toEqual({
      ok: false,
      field: "price_gold_yearly",
    });
    expect(parsePlansForm(form({ trial_days: "400" }))).toEqual({
      ok: false,
      field: "trial_days",
    });
    expect(parsePlansForm(form({ q_free_voice: "abc" }))).toEqual({
      ok: false,
      field: "q_free_voice",
    });
    expect(parsePlansForm(form({ wear_gold: "everything" }))).toEqual({
      ok: false,
      field: "wear_gold",
    });
    expect(parsePlansForm(form({ family_premium: "99" }))).toEqual({
      ok: false,
      field: "family_premium",
    });
    expect(
      parsePlansForm(form({ vault_gold: "", vault_gold_u: null })),
    ).toEqual({
      ok: false,
      field: "vault_gold",
    });
  });
});

describe("resolvePlanSpec", () => {
  it("equals the built-in plan when nothing is overridden", () => {
    for (const id of PLAN_IDS)
      expect(resolvePlanSpec(id, DEFAULT_BILLING_SETTINGS)).toEqual(PLANS[id]);
  });

  it("applies quota and detail overrides without touching other plans", () => {
    const billing = parseBillingSettings({
      plan_overrides: { gold: { aiChat: 99 } },
      plan_specs: { gold: { vaultMaxFiles: "unlimited", wearables: "full" } },
    });
    const gold = resolvePlanSpec("gold", billing);
    expect(gold.quotas.aiChat.limit).toBe(99);
    expect(gold.quotas.aiChat.periodMonths).toBe(1);
    expect(gold.vaultMaxFiles).toBe("unlimited");
    expect(gold.wearables).toBe("full");
    expect(gold.timelineHistoryMonths).toBe(3);
    expect(resolvePlanSpec("free", billing)).toEqual(PLANS.free);
  });

  it("a damaged stored value degrades to the defaults", () => {
    expect(parsePlanSpecs("nonsense")).toEqual({});
    expect(
      parsePlanSpecs({ gold: { vaultMaxFiles: -1, wearables: "x" } }),
    ).toEqual({});
    expect(
      parsePlanSpecs({ gold: { vaultMaxFiles: 7, healthAgent: "yes" } }),
    ).toEqual({});
  });
});
