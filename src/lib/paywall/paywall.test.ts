import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PAYWALL_MODES,
  isPaywallMode,
  rate,
  savingFor,
  tally,
  variantFor,
  variantTag,
  yearlySavingPercent,
} from "./paywall";

describe("variantFor", () => {
  it("is stable for a person and pinned by the mode", () => {
    const id = randomUUID();
    expect(variantFor(id, "ab")).toBe(variantFor(id, "ab"));
    expect(variantFor(id, "a")).toBe("a");
    expect(variantFor(id, "b")).toBe("b");
    expect(variantFor(id, "off")).toBe("a");
  });
  it("splits people roughly in half", () => {
    const n = 2000;
    const b = Array.from({ length: n }, () =>
      variantFor(randomUUID(), "ab"),
    ).filter((v) => v === "b").length;
    expect(b).toBeGreaterThan(n * 0.42);
    expect(b).toBeLessThan(n * 0.58);
  });
  it("the tag is analytics-safe", () => {
    expect(variantTag("a")).toBe("pw_a");
    expect(variantTag("b")).toMatch(/^[a-z0-9_]{1,40}$/);
  });
  it("knows the modes", () => {
    for (const m of PAYWALL_MODES) expect(isPaywallMode(m)).toBe(true);
    for (const bad of ["AB", "c", "", null, 1, "__proto__"])
      expect(isPaywallMode(bad)).toBe(false);
  });
});

describe("savings", () => {
  it("is the real percentage against twelve months, never negative or 100", () => {
    expect(yearlySavingPercent(49, 490)).toBe(17);
    expect(yearlySavingPercent(89, 890)).toBe(17);
    expect(yearlySavingPercent(50, 600)).toBe(0);
    expect(yearlySavingPercent(50, 700)).toBe(0);
    expect(yearlySavingPercent(0, 100)).toBe(0);
    expect(yearlySavingPercent(50, 0)).toBe(0);
    expect(
      savingFor(
        {
          goldMonthly: 49,
          goldYearly: 490,
          premiumMonthly: 89,
          premiumYearly: 890,
        },
        "gold",
      ),
    ).toBe(17);
  });
});

describe("tally / rate", () => {
  it("counts distinct people per step and version, ignoring untagged rows and anonymous ones", () => {
    const rows = [
      { user_id: "u1", event: "paywall_viewed", detail: "pw_a" },
      { user_id: "u1", event: "paywall_viewed", detail: "pw_a" }, // the same person again
      { user_id: "u2", event: "paywall_viewed", detail: "pw_b" },
      { user_id: "u3", event: "paywall_viewed", detail: "pw_b" },
      { user_id: "u3", event: "order_created", detail: "pw_b" },
      { user_id: "u3", event: "subscribed", detail: "pw_b" },
      { user_id: "u4", event: "paywall_viewed", detail: null }, // before the test began
      { user_id: null, event: "paywall_viewed", detail: "pw_a" },
      { user_id: "u5", event: "ask_sent", detail: "pw_a" },
    ];
    expect(tally(rows)).toEqual({
      a: { viewed: 1, ordered: 0, reported: 0, subscribed: 0 },
      b: { viewed: 2, ordered: 1, reported: 0, subscribed: 1 },
    });
  });
  it("rate avoids dividing by nothing", () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(0, 5)).toBe(0);
    expect(rate(1, 0)).toBeNull();
  });
});
