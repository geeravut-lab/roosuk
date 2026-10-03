import { describe, expect, it } from "vitest";
import { DEFAULT_BILLING_SETTINGS, parseBillingSettings } from "./settings";

describe("parseBillingSettings", () => {
  it("returns the defaults for a missing row (e.g. migration not applied yet)", () => {
    expect(parseBillingSettings(null)).toEqual(DEFAULT_BILLING_SETTINGS);
    expect(parseBillingSettings({ feature_flags: {} })).toEqual(
      DEFAULT_BILLING_SETTINGS,
    );
  });

  it("reads the row, accepting numeric strings from the database", () => {
    const s = parseBillingSettings({
      trial_days: 7,
      price_gold_monthly: "59",
      price_gold_yearly: 590,
      price_premium_monthly: 99,
      price_premium_yearly: 990,
      fair_use_cap_trial: 50,
      fair_use_cap_premium: 0,
      plan_overrides: { free: { aiChat: 8 }, gold: { aiChat: "unlimited" } },
    });
    expect(s).toEqual({
      trialDays: 7,
      pricing: {
        goldMonthly: 59,
        goldYearly: 590,
        premiumMonthly: 99,
        premiumYearly: 990,
      },
      fairUseCapTrial: 50,
      fairUseCapPremium: 0,
      planOverrides: { free: { aiChat: 8 }, gold: { aiChat: "unlimited" } },
    });
  });

  it("falls back per field for nulls, negatives, junk and absurd values", () => {
    const s = parseBillingSettings({
      trial_days: null,
      price_gold_monthly: -3,
      price_gold_yearly: "abc",
      fair_use_cap_trial: 5.5,
      trial_days_x: 1,
      fair_use_cap_premium: 10_000_000,
    });
    expect(s.trialDays).toBe(14);
    expect(s.pricing.goldMonthly).toBe(49);
    expect(s.pricing.goldYearly).toBe(490);
    expect(s.fairUseCapTrial).toBe(200);
    expect(s.fairUseCapPremium).toBe(600);
  });

  it("ignores malformed quota overrides instead of throwing", () => {
    expect(parseBillingSettings({ plan_overrides: [] }).planOverrides).toEqual(
      {},
    );
    expect(
      parseBillingSettings({ plan_overrides: { free: { aiChat: -1 } } })
        .planOverrides,
    ).toEqual({});
    expect(
      parseBillingSettings({ plan_overrides: { nope: { aiChat: 1 } } })
        .planOverrides,
    ).toEqual({});
  });

  it("allows a trial length of 0 (trial switched off)", () => {
    expect(parseBillingSettings({ trial_days: 0 }).trialDays).toBe(0);
  });
});
