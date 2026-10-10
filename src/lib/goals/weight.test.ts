import { describe, expect, it } from "vitest";
import {
  assessWeightGoal,
  bmi,
  bmiBand,
  bmr,
  tdee,
  weightForBmi,
  weightTargets,
  weightTrend,
  type WeightIntake,
} from "./weight";

const base: WeightIntake = {
  direction: "lose",
  sex: "female",
  age: 35,
  heightCm: 160,
  weightKg: 75,
  targetKg: 65,
  pace: "standard",
  activity: "light",
  flags: { pregnant: false, edHistory: false, medical: false },
};
const w = (
  p: Partial<WeightIntake>,
  f: Partial<WeightIntake["flags"]> = {},
): WeightIntake => ({
  ...base,
  ...p,
  flags: { ...base.flags, ...f },
});

describe("body maths", () => {
  it("BMI and Asian bands", () => {
    expect(bmi(75, 160)).toBe(29.3);
    expect(bmiBand(18.4)).toBe("underweight");
    expect(bmiBand(18.5)).toBe("normal");
    expect(bmiBand(22.9)).toBe("normal");
    expect(bmiBand(23)).toBe("overweight");
    expect(bmiBand(25)).toBe("obese");
    expect(weightForBmi(20, 160)).toBe(51.2);
  });

  it("Mifflin-St Jeor (female, male, unspecified midpoint)", () => {
    // 10*75 + 6.25*160 - 5*35 = 1575
    expect(bmr(base)).toBe(1575 - 161);
    expect(bmr(w({ sex: "male" }))).toBe(1575 + 5);
    expect(bmr(w({ sex: null }))).toBe(1575 - 78);
    expect(tdee(base)).toBe(Math.round(1414 * 1.375));
  });
});

describe("assessWeightGoal: who may use it", () => {
  it("an ordinary adult may", () => {
    expect(assessWeightGoal(base)).toMatchObject({
      status: "ok",
      showCalories: true,
      pace: "standard",
    });
  });

  it.each([
    ["under 18", w({ age: 17 }), {}, "minor"],
    ["pregnant", base, { pregnant: true }, "pregnant"],
    ["eating-disorder history", base, { edHistory: true }, "ed_history"],
  ] as const)(
    "blocks %s and shows no calorie number",
    (_n, intake, flags, note) => {
      const a = assessWeightGoal({
        ...intake,
        flags: { ...intake.flags, ...flags },
      });
      expect(a).toMatchObject({ status: "blocked", showCalories: false });
      expect(a.notes).toContain(note);
      expect(
        weightTargets({ ...intake, flags: { ...intake.flags, ...flags } }),
      ).toBeNull();
    },
  );

  it("blocks losing weight when already underweight, and gaining when obese", () => {
    expect(assessWeightGoal(w({ weightKg: 45, targetKg: 42 })).notes).toContain(
      "underweight",
    );
    expect(assessWeightGoal(w({ weightKg: 45, targetKg: 42 })).status).toBe(
      "blocked",
    );
    expect(
      assessWeightGoal(w({ direction: "gain", targetKg: 80 })).status,
    ).toBe("blocked");
  });

  it("a medical condition or age 65+ forces the gentle pace and a caution", () => {
    const a = assessWeightGoal(w({}, { medical: true }));
    expect(a).toMatchObject({ status: "caution", pace: "gentle" });
    expect(a.notes).toContain("medical_caution");
    const s = assessWeightGoal(w({ age: 66 }));
    expect(s).toMatchObject({ status: "caution", pace: "gentle" });
  });

  it("already in the normal band: only a small, gentle loss", () => {
    const a = assessWeightGoal(w({ weightKg: 55, targetKg: 52 }));
    expect(a).toMatchObject({ status: "caution", pace: "gentle" });
    expect(a.notes).toContain("already_normal");
  });

  it("targets that are missing, the wrong way, too low or too high need fixing", () => {
    expect(assessWeightGoal(w({ targetKg: null })).notes).toContain(
      "target_missing",
    );
    expect(assessWeightGoal(w({ targetKg: 80 })).notes).toContain(
      "target_direction",
    );
    const low = assessWeightGoal(w({ targetKg: 48 }));
    expect(low).toMatchObject({
      status: "fix",
      targetRange: { min: 51.2, max: 75 },
    });
    const high = assessWeightGoal(
      w({ direction: "gain", weightKg: 50, targetKg: 70 }),
    );
    expect(high.status).toBe("fix");
    expect(high.targetRange).toEqual({ min: 50, max: 63.7 });
  });

  it("rejects nonsense numbers", () => {
    expect(assessWeightGoal(w({ heightCm: 50 })).notes).toContain(
      "invalid_body",
    );
    expect(assessWeightGoal(w({ weightKg: 500 })).status).toBe("blocked");
  });
});

describe("weightTargets", () => {
  it("a deficit of about 550 kcal at the standard pace, never above 25% of need", () => {
    const t = weightTargets(base)!;
    expect(t.tdee).toBe(1944);
    expect(t.dailyBalance).toBe(-486); // capped at 25% of 1944
    expect(t.kcal).toBe(1460);
    expect(t.kgPerWeek).toBeCloseTo(-0.44, 2);
    expect(t.weeks).toBe(Math.ceil(10 / 0.44));
    expect(t.proteinG).toBe(98);
    expect(t.waterMl).toBe(2500);
    expect(t.activeMinutes).toBe(30);
  });

  it("never goes below the floor and says so", () => {
    const t = weightTargets(
      w({
        weightKg: 50,
        heightCm: 150,
        age: 50,
        targetKg: 46,
        sex: "female",
        activity: "sedentary",
      }),
    )!;
    expect(t.kcal).toBeGreaterThanOrEqual(1200);
    expect(t.floorApplied).toBe(t.kcal === 1200);
  });

  it("the macros add up to the calories (within rounding)", () => {
    const t = weightTargets(base)!;
    const sum = (t.proteinG ?? 0) * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(sum - t.kcal)).toBeLessThan(25);
  });

  it("maintenance is the daily need; a gain adds at most 500", () => {
    const m = weightTargets(w({ direction: "maintain", targetKg: null }))!;
    expect(m.kcal).toBe(Math.round(tdee(base) / 10) * 10);
    expect(m.weeks).toBeNull();
    const g = weightTargets(
      w({
        direction: "gain",
        weightKg: 50,
        heightCm: 165,
        targetKg: 55,
        pace: "standard",
      }),
    )!;
    expect(g.dailyBalance).toBeLessThanOrEqual(500);
    expect(g.dailyBalance).toBeGreaterThan(0);
  });

  it("a medical flag removes the protein and water numbers", () => {
    const t = weightTargets(w({}, { medical: true }))!;
    expect(t.proteinG).toBeNull();
    expect(t.waterMl).toBeNull();
    expect(t.kgPerWeek).toBeGreaterThan(-0.3); // gentle
  });
});

describe("weightTrend", () => {
  it("fits a slope in kg per week", () => {
    const pts = [0, 7, 14, 21].map((d, k) => ({
      date: `2026-10-${String(1 + d).padStart(2, "0")}`,
      kg: 70 - 0.5 * k,
    }));
    expect(weightTrend(pts)).toEqual({
      kgPerWeek: -0.5,
      first: 70,
      last: 68.5,
    });
  });
  it("needs 3 points over at least a week", () => {
    expect(weightTrend([{ date: "2026-10-01", kg: 70 }])).toBeNull();
    expect(
      weightTrend([
        { date: "2026-10-01", kg: 70 },
        { date: "2026-10-02", kg: 70 },
        { date: "2026-10-03", kg: 70 },
      ]),
    ).toBeNull();
  });
});
