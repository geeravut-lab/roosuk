import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  CHALLENGE_TEMPLATES,
  TEMPLATE_KEYS,
  daysLeft,
  isMode,
  isTemplate,
  joinPath,
  phaseOf,
  progressPercent,
} from "./challenges";

describe("templates", () => {
  it("match the database's allowed templates and metrics", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261026000100_challenges.sql"),
      "utf8",
    );
    const tpl = [
      ...sql
        .slice(
          sql.indexOf("template in ("),
          sql.indexOf("))", sql.indexOf("template in (")),
        )
        .matchAll(/'([a-z0-9]+)'/g),
    ].map((m) => m[1]);
    expect([...TEMPLATE_KEYS].sort()).toEqual([...tpl].sort());
    const met = [
      ...sql
        .slice(
          sql.indexOf("metric in ("),
          sql.indexOf("))", sql.indexOf("metric in (")),
        )
        .matchAll(/'([a-z_]+)'/g),
    ].map((m) => m[1]);
    for (const t of TEMPLATE_KEYS)
      expect(met).toContain(CHALLENGE_TEMPLATES[t].metric);
  });
  it("always fit their window, and are about showing up", () => {
    for (const t of TEMPLATE_KEYS) {
      const c = CHALLENGE_TEMPLATES[t];
      expect(c.target).toBeLessThanOrEqual(c.days);
      expect(["checkin_days", "meal_days"]).toContain(c.metric);
    }
  });
  it("have names and descriptions in both languages with no body/weight talk", () => {
    const bad =
      /น้ำหนัก|รูปร่าง|ผอม|อ้วน|\bweight\b|\bbody\b|slim|calorie|kcal|diet/i;
    for (const lang of ["th", "en"] as const)
      for (const t of TEMPLATE_KEYS) {
        const name =
          dict[lang][`challenge_${t}_name` as keyof (typeof dict)["th"]];
        const desc =
          dict[lang][`challenge_${t}_desc` as keyof (typeof dict)["th"]];
        expect(name).toBeTruthy();
        expect(desc).toBeTruthy();
        expect(String(name)).not.toMatch(bad);
        expect(String(desc)).not.toMatch(bad);
      }
  });
  it("validators reject prototype keys and junk", () => {
    expect(isTemplate("streak7")).toBe(true);
    for (const bad of ["constructor", "__proto__", "toString", "", 3, null])
      expect(isTemplate(bad)).toBe(false);
    expect(isMode("solo")).toBe(true);
    expect(isMode("friend")).toBe(true);
    expect(isMode("team")).toBe(false);
  });
});

describe("phase / days left / progress", () => {
  it("is done once completed, active through the last day, ended after", () => {
    expect(
      phaseOf({
        completedAt: "2026-10-15T00:00:00Z",
        endsOn: "2026-10-20",
        today: "2026-10-16",
      }),
    ).toBe("done");
    expect(
      phaseOf({ completedAt: null, endsOn: "2026-10-20", today: "2026-10-20" }),
    ).toBe("active");
    expect(
      phaseOf({ completedAt: null, endsOn: "2026-10-20", today: "2026-10-21" }),
    ).toBe("ended");
  });
  it("counts today as a day left, never below zero", () => {
    expect(daysLeft("2026-10-20", "2026-10-20")).toBe(1);
    expect(daysLeft("2026-10-20", "2026-10-14")).toBe(7);
    expect(daysLeft("2026-10-20", "2026-10-25")).toBe(0);
  });
  it("progress is clamped", () => {
    expect(progressPercent(3, 7)).toBe(43);
    expect(progressPercent(9, 7)).toBe(100);
    expect(progressPercent(-1, 7)).toBe(0);
    expect(progressPercent(1, 0)).toBe(0);
  });
  it("the join link carries the code safely", () => {
    expect(joinPath("AB3KX7M")).toBe("/challenges?join=AB3KX7M");
    expect(joinPath("a&b")).toBe("/challenges?join=a%26b");
  });
});
