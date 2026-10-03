import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import { quotaText } from "./format";

describe("quotaText", () => {
  it("formats monthly, multi-month and unlimited quotas in both languages", () => {
    expect(quotaText(dict.th, { limit: 30, periodMonths: 1 })).toBe(
      "30 ต่อเดือน",
    );
    expect(quotaText(dict.th, { limit: 1, periodMonths: 3 })).toBe(
      "1 ต่อ 3 เดือน",
    );
    expect(quotaText(dict.th, { limit: "unlimited", periodMonths: 1 })).toBe(
      "ไม่จำกัด",
    );
    expect(quotaText(dict.en, { limit: 5, periodMonths: 1 })).toBe(
      "5 per month",
    );
    expect(quotaText(dict.en, { limit: 1, periodMonths: 3 })).toBe(
      "1 per 3 months",
    );
  });
});
