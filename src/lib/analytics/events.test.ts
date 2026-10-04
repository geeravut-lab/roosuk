import { describe, expect, it } from "vitest";
import {
  EVENTS,
  buildFunnel,
  cleanDetail,
  isProductEvent,
  parseAnalytics,
  retentionRate,
} from "./events";

describe("event names", () => {
  it("are all valid database shapes and unique", () => {
    expect(new Set(EVENTS).size).toBe(EVENTS.length);
    for (const e of EVENTS) expect(e).toMatch(/^[a-z][a-z0-9_]{2,39}$/);
  });
  it("only known names pass", () => {
    expect(isProductEvent("signup")).toBe(true);
    expect(isProductEvent("signupp")).toBe(false);
    expect(isProductEvent(undefined)).toBe(false);
  });
  it("carry no free text: the tag is a short token or nothing", () => {
    expect(cleanDetail("quiz")).toBe("quiz");
    for (const bad of [
      "Quiz",
      "has space",
      "a".repeat(41),
      "",
      5,
      null,
      "x@y.z",
    ])
      expect(cleanDetail(bad)).toBeNull();
  });
});

describe("funnel", () => {
  const f = {
    quiz: 200,
    signup: 100,
    scan: 60,
    paywall: 30,
    order: 6,
    subscribed: 3,
  };
  it("gives each step its conversion from the one before", () => {
    const rows = buildFunnel(f);
    expect(rows.map((r) => r.step)).toEqual([
      "quiz",
      "signup",
      "scan",
      "paywall",
      "order",
      "subscribed",
    ]);
    expect(rows[0].ofPrevious).toBeNull();
    expect(rows[1].ofPrevious).toBe(50);
    expect(rows[2].ofPrevious).toBe(60);
    expect(rows[4].ofPrevious).toBe(20);
    expect(rows[0].ofFirst).toBe(100);
    expect(rows[5].ofFirst).toBe(2);
  });
  it("copes with an empty window and a step larger than the one before", () => {
    expect(
      buildFunnel({
        quiz: 0,
        signup: 0,
        scan: 0,
        paywall: 0,
        order: 0,
        subscribed: 0,
      }).every((r) => r.ofPrevious === null),
    ).toBe(true);
    const odd = buildFunnel({
      quiz: 10,
      signup: 4,
      scan: 9,
      paywall: 0,
      order: 0,
      subscribed: 0,
    });
    expect(odd[2].ofPrevious).toBe(225);
    expect(odd[2].ofFirst).toBeLessThanOrEqual(100);
  });
  it("retention is a rate or null when nobody is in the cohort", () => {
    expect(retentionRate(1, 4)).toBe(25);
    expect(retentionRate(0, 0)).toBeNull();
  });
});

describe("parseAnalytics", () => {
  it("accepts the database shape and repairs partial data", () => {
    const a = parseAnalytics({
      days: 30,
      dau: "3",
      wau: 5,
      mau: 9,
      daily: [{ day: "2026-10-01", active: 2 }],
      events: [{ event: "ask_sent", total: 4, users: 2 }],
    });
    expect(a).toMatchObject({
      dau: 3,
      funnel: { quiz: 0 },
      retention: { d1_cohort: 0 },
    });
    expect(a!.daily).toHaveLength(1);
  });
  it("rejects what is not an object", () => {
    expect(parseAnalytics(null)).toBeNull();
    expect(parseAnalytics("x")).toBeNull();
  });
});
