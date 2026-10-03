import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING } from "@/config/plans";
import {
  canReport,
  cleanPayerRef,
  cleanReviewNote,
  isBillingPeriod,
  isPaidTier,
  priceFor,
} from "./payments";

describe("priceFor", () => {
  it("reads the price for each tier and period", () => {
    expect(priceFor(DEFAULT_PRICING, "gold", "monthly")).toBe(49);
    expect(priceFor(DEFAULT_PRICING, "gold", "yearly")).toBe(490);
    expect(priceFor(DEFAULT_PRICING, "premium", "monthly")).toBe(89);
    expect(priceFor(DEFAULT_PRICING, "premium", "yearly")).toBe(890);
  });
});

describe("guards", () => {
  it("accept only known tiers and periods", () => {
    expect(isPaidTier("gold")).toBe(true);
    expect(isPaidTier("free")).toBe(false);
    expect(isPaidTier("payg")).toBe(false);
    expect(isBillingPeriod("yearly")).toBe(true);
    expect(isBillingPeriod("weekly")).toBe(false);
  });
});

describe("cleanPayerRef", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanPayerRef("  1234   ABC ")).toBe("1234 ABC");
  });
  it("rejects empty, blank, long and non-string values", () => {
    expect(cleanPayerRef("")).toBeNull();
    expect(cleanPayerRef("   ")).toBeNull();
    expect(cleanPayerRef("x".repeat(81))).toBeNull();
    expect(cleanPayerRef(null)).toBeNull();
    expect(cleanPayerRef(5)).toBeNull();
  });
});

describe("cleanReviewNote", () => {
  it("returns null for blank and clips to 500 characters", () => {
    expect(cleanReviewNote("  ")).toBeNull();
    expect(cleanReviewNote("a".repeat(600))).toHaveLength(500);
  });
});

describe("canReport", () => {
  it("lets the payer report from draft or after a rejection only", () => {
    expect(canReport("draft")).toBe(true);
    expect(canReport("rejected")).toBe(true);
    for (const s of ["review", "paid", "cancelled"] as const)
      expect(canReport(s)).toBe(false);
  });
});
