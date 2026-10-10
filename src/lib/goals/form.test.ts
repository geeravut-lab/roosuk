import { describe, expect, it } from "vitest";
import { readGoalParams } from "./form";

const reader = (
  f: Record<string, string>,
  many: Record<string, string[]> = {},
) => [(n: string) => f[n] ?? null, (n: string) => many[n] ?? []] as const;

describe("readGoalParams", () => {
  const weight = {
    direction: "lose",
    height_cm: "160",
    weight_kg: "75,5",
    target_kg: "65",
    pace: "standard",
    activity: "light",
    birth_year: "1990",
    sex: "female",
  };

  it("reads a weight goal, accepting a decimal comma", () => {
    const [g, a] = reader(weight);
    expect(readGoalParams("weight", g, a)).toEqual({
      ok: true,
      params: {
        direction: "lose",
        heightCm: 160,
        weightKg: 75.5,
        targetKg: 65,
        pace: "standard",
        activity: "light",
        flags: { pregnant: false, edHistory: false, medical: false },
        sex: "female",
        birthYear: 1990,
      },
    });
  });

  it("maintenance has no target, and the careful-about boxes become flags", () => {
    const [g, a] = reader(
      { ...weight, direction: "maintain" },
      { careful: ["ed", "medical"] },
    );
    const r = readGoalParams("weight", g, a);
    expect(r.ok && r.params).toMatchObject({
      targetKg: null,
      flags: { pregnant: false, edHistory: true, medical: true },
    });
  });

  it("names the field that is wrong", () => {
    for (const [change, field] of [
      [{ height_cm: "30" }, "height_cm"],
      [{ weight_kg: "abc" }, "weight_kg"],
      [{ direction: "fly" }, "direction"],
      [{ activity: "" }, "activity"],
      [{ birth_year: "" }, "birth_year"],
    ] as const) {
      const [g, a] = reader({ ...weight, ...change });
      expect(readGoalParams("weight", g, a)).toEqual({ ok: false, field });
    }
  });

  it("reads sleep, brain and condition goals", () => {
    let [g, a] = reader({
      avg_hours: "5to6",
      problem: "wake_night",
      caffeine: "afternoon",
      wake_time: "06:30",
    });
    expect(readGoalParams("sleep", g, a).ok).toBe(true);
    [g, a] = reader({
      avg_hours: "5to6",
      problem: "wake_night",
      caffeine: "afternoon",
      wake_time: "25:00",
    });
    expect(readGoalParams("sleep", g, a)).toEqual({
      ok: false,
      field: "wake_time",
    });
    [g, a] = reader({ aim: "focus", sit_hours: "gt8", sleep_hours: "6to7" });
    expect(readGoalParams("brain", g, a).ok).toBe(true);
    [g, a] = reader({ condition: "gout", under_care: "yes" });
    expect(readGoalParams("condition", g, a)).toEqual({
      ok: true,
      params: { condition: "gout", underCare: true },
    });
    [g, a] = reader({ condition: "flu", under_care: "no" });
    expect(readGoalParams("condition", g, a)).toEqual({
      ok: false,
      field: "condition",
    });
  });
});
