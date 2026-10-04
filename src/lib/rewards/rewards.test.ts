import { describe, expect, it } from "vitest";
import {
  DEFAULT_REWARD_SETTINGS,
  REWARD_FIELDS,
  creditDiscount,
  normalizeReferralCode,
  parseRewardForm,
  parseRewardSettings,
} from "./rewards";

describe("parseRewardSettings", () => {
  it("reads the columns", () => {
    expect(
      parseRewardSettings({
        reward_referral_thb: 12,
        reward_referee_thb: 3,
        reward_challenge_thb: 20,
        redeem_max_subscription_thb: 15,
        redeem_max_other_thb: 30,
        referral_min_checkin_days: 5,
        referral_max_rewards: 7,
        challenge_max_rewards_per_month: 2,
      }),
    ).toEqual({
      referralThb: 12,
      refereeThb: 3,
      challengeThb: 20,
      redeemMaxSubscriptionThb: 15,
      redeemMaxOtherThb: 30,
      referralMinCheckinDays: 5,
      referralMaxRewards: 7,
      challengeMaxRewardsPerMonth: 2,
    });
  });
  it("falls back to the defaults for a missing row, null, junk or out-of-range values", () => {
    expect(parseRewardSettings(null)).toEqual(DEFAULT_REWARD_SETTINGS);
    expect(parseRewardSettings({})).toEqual(DEFAULT_REWARD_SETTINGS);
    expect(
      parseRewardSettings({
        reward_referral_thb: "abc",
        reward_challenge_thb: -5,
        referral_min_checkin_days: 0,
        redeem_max_other_thb: null,
      }),
    ).toEqual(DEFAULT_REWARD_SETTINGS);
  });
});

describe("parseRewardForm", () => {
  const good = Object.fromEntries(
    REWARD_FIELDS.map((f) => [f.field, String(f.min === 0 ? 5 : f.min)]),
  );
  it("accepts whole numbers inside each range", () => {
    const r = parseRewardForm((k) => good[k]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.columns.reward_referral_thb).toBe(5);
  });
  it("names the first bad field: empty, fraction, negative, too big, not a number", () => {
    for (const bad of ["", "1.5", "-1", "100000000", "abc"])
      expect(
        parseRewardForm((k) => (k === "challengeThb" ? bad : good[k])),
      ).toEqual({ ok: false, field: "challengeThb" });
    expect(
      parseRewardForm((k) => (k === "referralMinCheckinDays" ? "0" : good[k])),
    ).toEqual({ ok: false, field: "referralMinCheckinDays" });
    expect(parseRewardForm(() => undefined)).toMatchObject({ ok: false });
  });
});

describe("creditDiscount", () => {
  it("is the smallest of balance, per-use maximum and price − 1", () => {
    expect(creditDiscount({ price: 49, balance: 25, maxPerUse: 10 })).toBe(10);
    expect(creditDiscount({ price: 49, balance: 4, maxPerUse: 10 })).toBe(4);
    expect(creditDiscount({ price: 5, balance: 25, maxPerUse: 10 })).toBe(4);
  });
  it("is zero when there is nothing to use, and never negative or fractional", () => {
    expect(creditDiscount({ price: 49, balance: 0, maxPerUse: 10 })).toBe(0);
    expect(creditDiscount({ price: 49, balance: 20, maxPerUse: 0 })).toBe(0);
    expect(creditDiscount({ price: 1, balance: 20, maxPerUse: 10 })).toBe(0);
    expect(creditDiscount({ price: 49, balance: -3, maxPerUse: 10 })).toBe(0);
    expect(creditDiscount({ price: 49, balance: 7.9, maxPerUse: 10.9 })).toBe(
      7,
    );
    expect(
      creditDiscount({ price: Number.NaN, balance: 5, maxPerUse: 5 }),
    ).toBe(0);
  });
});

describe("normalizeReferralCode", () => {
  it("tidies a typed code and rejects what cannot be one", () => {
    expect(normalizeReferralCode(" ab3-kx7 m ")).toBe("AB3KX7M");
    expect(normalizeReferralCode("AB3KX7M")).toBe("AB3KX7M");
    for (const bad of [
      "",
      "SHORT",
      "AB3KX7MM",
      "AB3KX70",
      "AB3KX1M",
      "AB3KXOM",
      "ab3<script>",
      5,
      null,
      undefined,
    ])
      expect(normalizeReferralCode(bad), String(bad)).toBeNull();
  });
});
