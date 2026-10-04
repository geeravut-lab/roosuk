import { describe, expect, it } from "vitest";
import {
  CONDITION_VALUES,
  EMPTY_PROFILE,
  GOAL_VALUES,
  ageFromBirthYear,
  parseProfileForm,
  profileCompleteness,
  profileForPrompt,
} from "./profile";

const YEAR = 2026;
const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("parseProfileForm", () => {
  it("parses a full profile", () => {
    const r = parseProfileForm(
      form([
        ["birth_year", "1985"],
        ["sex", "female"],
        ["smoking", "never"],
        ["alcohol", "weekly"],
        ["exercise_days", "3"],
        ["conditions", "hypertension"],
        ["conditions", "diabetes"],
        ["goals", "sleep"],
        ["goals", "move"],
      ]),
      YEAR,
    );
    expect(r).toEqual({
      ok: true,
      profile: {
        birth_year: 1985,
        sex: "female",
        smoking: "never",
        alcohol: "weekly",
        exercise_days: 3,
        conditions: ["hypertension", "diabetes"],
        goals: ["sleep", "move"],
      },
    });
  });
  it("treats empty answers as skipped, not as errors", () => {
    const r = parseProfileForm(
      form([
        ["birth_year", ""],
        ["sex", ""],
      ]),
      YEAR,
    );
    expect(r).toEqual({ ok: true, profile: EMPTY_PROFILE });
    expect(parseProfileForm(form([]), YEAR)).toEqual({
      ok: true,
      profile: EMPTY_PROFILE,
    });
  });
  it("accepts 0 days of exercise (a real answer)", () => {
    const r = parseProfileForm(form([["exercise_days", "0"]]), YEAR);
    expect(r.ok && r.profile.exercise_days).toBe(0);
  });
  it("rejects impossible ages, unknown options and out-of-range numbers", () => {
    for (const bad of [
      [["birth_year", "2024"]],
      [["birth_year", "1900"]],
      [["birth_year", "abc"]],
      [["sex", "robot"]],
      [["smoking", "sometimes"]],
      [["alcohol", "always"]],
      [["exercise_days", "9"]],
      [["exercise_days", "-1"]],
      [["conditions", "made_up"]],
      [["goals", "lose_weight"]],
    ] as [string, string][][])
      expect(parseProfileForm(form(bad), YEAR).ok, JSON.stringify(bad)).toBe(
        false,
      );
  });
  it("de-duplicates list answers", () => {
    const r = parseProfileForm(
      form([
        ["goals", "sleep"],
        ["goals", "sleep"],
      ]),
      YEAR,
    );
    expect(r.ok && r.profile.goals).toEqual(["sleep"]);
  });
  it("never offers a weight or body-shape goal or condition", () => {
    for (const v of [...GOAL_VALUES, ...CONDITION_VALUES])
      expect(v).not.toMatch(/weight|obes|bmi|slim|fat_loss|body/i);
  });
});

describe("helpers", () => {
  it("computes age and completeness", () => {
    expect(ageFromBirthYear(1985, 2026)).toBe(41);
    expect(profileCompleteness(EMPTY_PROFILE)).toEqual({ done: 0, total: 6 });
    expect(
      profileCompleteness({
        ...EMPTY_PROFILE,
        sex: "male",
        exercise_days: 0,
        goals: ["sleep"],
      }),
    ).toEqual({ done: 3, total: 6 });
  });
  it("describes a profile for AI without identifiers or an exact age", () => {
    const text = profileForPrompt(
      {
        ...EMPTY_PROFILE,
        birth_year: 1985,
        sex: "female",
        conditions: ["diabetes"],
      },
      YEAR,
    );
    expect(text).toContain("age 40-44");
    expect(text).toContain("diabetes");
    expect(text).not.toContain("1985");
    expect(profileForPrompt(EMPTY_PROFILE, YEAR)).toBe(
      "no profile information",
    );
    expect(
      profileForPrompt({ ...EMPTY_PROFILE, sex: "unspecified" }, YEAR),
    ).toBe("no profile information");
  });
});
