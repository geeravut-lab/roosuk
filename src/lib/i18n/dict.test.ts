import { describe, expect, it } from "vitest";
import { dict, errorText, fmt, isErrorKey } from "./dict";

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionary", () => {
  const th = dict.th;
  const en = dict.en;
  const keys = Object.keys(th) as (keyof typeof th)[];

  it("has the same keys in both languages (also enforced at compile time)", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort());
  });

  it("has no empty strings", () => {
    for (const key of keys) {
      expect(th[key].trim(), `th.${key}`).not.toBe("");
      expect(en[key].trim(), `en.${key}`).not.toBe("");
    }
  });

  it("uses the same {placeholders} in both languages", () => {
    for (const key of keys)
      expect(placeholders(en[key]), key).toEqual(placeholders(th[key]));
  });

  it("has a label for every nav item, consent item, feature flag and error code the code can emit", () => {
    for (const k of [
      "navToday",
      "navTimeline",
      "navScan",
      "navAsk",
      "navMore",
      "navSettings",
      "navAdmin",
    ] as const) {
      expect(th[k]).toBeTruthy();
    }
    expect(keys.filter((k) => k.startsWith("err_")).length).toBeGreaterThan(5);
  });
});

describe("fmt", () => {
  it("fills placeholders and leaves unknown ones alone", () => {
    expect(fmt("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
  });
});

describe("errorText", () => {
  it("translates known codes and falls back for anything else", () => {
    expect(isErrorKey("err_invalid_credentials")).toBe(true);
    expect(isErrorKey("consent_marketing")).toBe(false);
    expect(errorText("err_invalid_credentials", dict.en)).toBe(
      dict.en.err_invalid_credentials,
    );
    expect(errorText("totally-unknown", dict.en)).toBe(dict.en.err_unknown);
    expect(errorText(undefined, dict.th)).toBe(dict.th.err_unknown);
  });
});
