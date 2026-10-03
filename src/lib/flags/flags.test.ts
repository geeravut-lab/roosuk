import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAGS,
  isEnabled,
  isFeatureFlag,
  normalizeFlags,
  withFlag,
} from "./flags";

describe("feature flags", () => {
  it("treat a missing key as ON, so a new flag never switches off shipped work", () => {
    expect(isEnabled(undefined, "voice")).toBe(true);
    expect(isEnabled({}, "voice")).toBe(true);
    expect(isEnabled({ voice: false }, "voice")).toBe(false);
    expect(isEnabled({ voice: false }, "food_scan")).toBe(true);
  });

  it("recognise only known flags", () => {
    expect(isFeatureFlag("food_scan")).toBe(true);
    expect(isFeatureFlag("nope")).toBe(false);
    expect(isFeatureFlag(undefined)).toBe(false);
    expect(FEATURE_FLAGS.length).toBeGreaterThan(0);
  });

  it("normalise DB values: keep only known flags that are explicitly false", () => {
    expect(
      normalizeFlags({
        voice: false,
        food_scan: true,
        unknown: false,
        family: "false",
      }),
    ).toEqual({
      voice: false,
    });
    expect(normalizeFlags(null)).toEqual({});
    expect(normalizeFlags("x")).toEqual({});
  });

  it("store only disabled flags: ON deletes the key, OFF writes false", () => {
    expect(withFlag({}, "voice", false)).toEqual({ voice: false });
    expect(withFlag({ voice: false }, "voice", true)).toEqual({});
    const before = { voice: false } as const;
    withFlag(before, "family", false);
    expect(before).toEqual({ voice: false }); // not mutated
  });
});
