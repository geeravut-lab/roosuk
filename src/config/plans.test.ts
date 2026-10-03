import { describe, expect, it } from "vitest";
import { canUse, PLANS, remainingQuota } from "./plans";

describe("subscription plans", () => {
  it("prices Gold and Premium per the business model doc", () => {
    expect(PLANS.gold.priceThbPerMonth).toBe(49);
    expect(PLANS.premium.priceThbPerMonth).toBe(89);
  });

  it("meters Gold AI usage", () => {
    expect(remainingQuota("gold", "aiChat", 0)).toBe(30);
    expect(remainingQuota("gold", "aiChat", 29)).toBe(1);
    expect(canUse("gold", "aiChat", 29)).toBe(true);
    expect(canUse("gold", "aiChat", 30)).toBe(false);
  });

  it("never reports negative remaining quota", () => {
    expect(remainingQuota("gold", "foodSnap", 99)).toBe(0);
  });

  it("does not meter Premium", () => {
    expect(remainingQuota("premium", "foodSnap", 10_000)).toBe("unlimited");
    expect(canUse("premium", "labImport", 10_000)).toBe(true);
  });

  it("keeps Passport and Agent Premium-only", () => {
    expect(PLANS.gold.healthPassport).toBe(false);
    expect(PLANS.gold.healthAgent).toBe(false);
    expect(PLANS.premium.healthPassport).toBe(true);
    expect(PLANS.premium.healthAgent).toBe(true);
  });
});
