import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, METERED_FEATURES, PLANS, quotaFor } from "./plans";

describe("subscription plans", () => {
  it("defaults to the owner's prices (Gold 49/490, Premium 89/890)", () => {
    expect(DEFAULT_PRICING).toEqual({
      goldMonthly: 49,
      goldYearly: 490,
      premiumMonthly: 89,
      premiumYearly: 890,
    });
  });

  it("meters Gold per the business model doc", () => {
    expect(quotaFor("gold", "aiChat")).toEqual({ limit: 30, periodMonths: 1 });
    expect(quotaFor("gold", "foodSnap")).toEqual({
      limit: 15,
      periodMonths: 1,
    });
    expect(quotaFor("gold", "labImport")).toEqual({
      limit: 3,
      periodMonths: 1,
    });
    expect(quotaFor("gold", "healthQuiz")).toEqual({
      limit: 1,
      periodMonths: 1,
    });
  });

  it("gives Free-lite the approved quotas, with the quiz once per 3 months", () => {
    expect(quotaFor("free", "aiChat").limit).toBe(5);
    expect(quotaFor("free", "foodSnap").limit).toBe(3);
    expect(quotaFor("free", "labImport").limit).toBe(1);
    expect(quotaFor("free", "healthQuiz")).toEqual({
      limit: 1,
      periodMonths: 3,
    });
    expect(PLANS.free.timelineHistoryMonths).toBe(1);
    expect(PLANS.free.vaultMaxFiles).toBe(5);
  });

  it("leaves Premium unlimited (usage is still counted by the gate)", () => {
    for (const f of METERED_FEATURES)
      expect(quotaFor("premium", f).limit).toBe("unlimited");
  });

  it("keeps Passport and Agent Premium-only, Family at +1 on Premium", () => {
    expect(
      PLANS.gold.healthPassport ||
        PLANS.gold.healthAgent ||
        PLANS.free.healthAgent,
    ).toBe(false);
    expect(PLANS.premium.healthPassport && PLANS.premium.healthAgent).toBe(
      true,
    );
    expect(PLANS.premium.familyMembers).toBe(1);
  });

  it("applies admin overrides to the limit only, keeping the plan's window", () => {
    expect(quotaFor("free", "healthQuiz", { free: { healthQuiz: 2 } })).toEqual(
      { limit: 2, periodMonths: 3 },
    );
    expect(
      quotaFor("gold", "aiChat", { gold: { aiChat: "unlimited" } }).limit,
    ).toBe("unlimited");
    expect(quotaFor("gold", "aiChat", { free: { aiChat: 99 } }).limit).toBe(30);
  });
});
