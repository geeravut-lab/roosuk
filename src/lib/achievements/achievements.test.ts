import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  ACHIEVEMENTS,
  descKey,
  isNew,
  nameKey,
  progress,
} from "./achievements";

describe("catalogue", () => {
  it("has exactly the keys the database allows", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261020000100_achievements.sql",
      ),
      "utf8",
    );
    const allowed = [
      ...sql
        .slice(sql.indexOf("check (key in"), sql.indexOf("))"))
        .matchAll(/'([a-z_0-9]+)'/g),
    ].map((m) => m[1]);
    expect([...ACHIEVEMENTS.map((a) => a.key)].sort()).toEqual(
      [...allowed].sort(),
    );
  });
  it("has a Thai and English name and description for every badge", () => {
    for (const lang of ["th", "en"] as const)
      for (const a of ACHIEVEMENTS) {
        expect(dict[lang][nameKey(a.key)]).toBeTruthy();
        expect(dict[lang][descKey(a.key)]).toBeTruthy();
      }
  });
  it("never mentions body, weight, calories or targets", () => {
    const bad =
      /น้ำหนัก|รูปร่าง|ผอม|อ้วน|weight|body|slim|calorie|kcal|target|goal/i;
    for (const a of ACHIEVEMENTS) {
      expect(dict.th[nameKey(a.key)]).not.toMatch(bad);
      expect(dict.th[descKey(a.key)]).not.toMatch(bad);
      expect(dict.en[nameKey(a.key)]).not.toMatch(bad);
      expect(dict.en[descKey(a.key)]).not.toMatch(bad);
    }
  });
});

describe("progress / isNew", () => {
  const stats = { days: 12, bestStreak: 9, meals: 0, labs: 1, labDates: 1 };
  it("caps at the target and is null for yes/no steps", () => {
    expect(progress({ stat: "bestStreak", need: 7 }, stats)).toEqual({
      have: 7,
      need: 7,
    });
    expect(progress({ stat: "days", need: 30 }, stats)).toEqual({
      have: 12,
      need: 30,
    });
    expect(progress({ stat: null, need: 1 }, stats)).toBeNull();
  });
  it("marks today and yesterday as new, not older or future", () => {
    expect(isNew("2026-10-04", "2026-10-04")).toBe(true);
    expect(isNew("2026-10-03", "2026-10-04")).toBe(true);
    expect(isNew("2026-10-02", "2026-10-04")).toBe(false);
    expect(isNew("2026-10-05", "2026-10-04")).toBe(false);
  });
});
