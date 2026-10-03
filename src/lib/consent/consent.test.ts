import { describe, expect, it } from "vitest";
import {
  CONSENT_ITEMS,
  POLICY_VERSION,
  REQUIRED_CONSENT_KEYS,
} from "@/config/legal";
import { dict } from "@/lib/i18n/dict";
import { isConsentCurrent, parseConsentForm } from "./consent";

function form(checked: string[]): FormData {
  const f = new FormData();
  for (const key of checked) f.set(`consent_${key}`, "on");
  return f;
}

const allRequired = [...REQUIRED_CONSENT_KEYS];

describe("parseConsentForm", () => {
  it("accepts when every required item is ticked and records optional ones as false", () => {
    const out = parseConsentForm(form(allRequired));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.items.terms_privacy).toBe(true);
      expect(out.items.marketing).toBe(false);
      expect(Object.keys(out.items).sort()).toEqual(
        CONSENT_ITEMS.map((i) => i.key).sort(),
      );
    }
  });

  it("rejects when any required item is missing", () => {
    for (const missing of allRequired) {
      expect(
        parseConsentForm(form(allRequired.filter((k) => k !== missing))).ok,
        missing,
      ).toBe(false);
    }
    expect(parseConsentForm(form([])).ok).toBe(false);
  });

  it("records optional items that were ticked", () => {
    const out = parseConsentForm(form([...allRequired, "marketing", "photos"]));
    expect(out.ok && out.items.marketing && out.items.photos).toBe(true);
  });
});

describe("isConsentCurrent", () => {
  const allTrue = Object.fromEntries(allRequired.map((k) => [k, true]));

  it("needs the current policy version and all required items", () => {
    expect(
      isConsentCurrent({ policy_version: POLICY_VERSION, items: allTrue }),
    ).toBe(true);
    expect(
      isConsentCurrent({ policy_version: "1999-01-01", items: allTrue }),
    ).toBe(false);
    expect(
      isConsentCurrent({
        policy_version: POLICY_VERSION,
        items: { ...allTrue, terms_privacy: false },
      }),
    ).toBe(false);
    expect(
      isConsentCurrent({ policy_version: POLICY_VERSION, items: {} }),
    ).toBe(false);
    expect(isConsentCurrent(null)).toBe(false);
  });
});

describe("consent copy", () => {
  it("has a label in both languages for every item", () => {
    for (const { key } of CONSENT_ITEMS) {
      const k = `consent_${key}` as keyof typeof dict.th;
      expect(dict.th[k], k).toBeTruthy();
      expect(dict.en[k], k).toBeTruthy();
    }
  });
});
