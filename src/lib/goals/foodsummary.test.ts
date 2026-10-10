import { describe, expect, it } from "vitest";
import { defaultMealType } from "./meals";
import { summarizeFood, type SummaryMeal } from "./foodsummary";

const m = (
  meal_date: string,
  kcal: number,
  p: number,
  c: number,
  f: number,
  ...names: string[]
): SummaryMeal => ({
  meal_date,
  kcal,
  protein_g: p,
  carbs_g: c,
  fat_g: f,
  items: names.map((name) => ({ name })),
});

describe("summarizeFood", () => {
  const today = "2026-10-10";
  it("averages over the days that have food logged", () => {
    const s = summarizeFood(
      [
        m("2026-10-09", 500, 20, 60, 15, "ข้าวผัด"),
        m("2026-10-09", 600, 30, 70, 20, "ข้าวผัด", "ไข่ต้ม"),
        m("2026-10-08", 700, 25, 80, 25, "ผัดไทย"),
      ],
      today,
    );
    expect(s.loggedDays).toBe(2);
    expect(s.meals).toBe(3);
    expect(s.avgKcal).toBe(900); // (1100 + 700) / 2
    expect(s.avgProteinG).toBe(38);
    expect(s.topFoods[0]).toEqual({ name: "ข้าวผัด", days: 1 });
    expect(s.reliable).toBe(false);
  });

  it("macro shares of calories add to about 100", () => {
    const s = summarizeFood([m("2026-10-09", 500, 25, 60, 18, "x")], today);
    const t = s.macroPct!;
    expect(Math.abs(t.protein + t.carbs + t.fat - 100)).toBeLessThanOrEqual(2);
  });

  it("ignores meals outside the window and reports no data as null", () => {
    const empty = summarizeFood([m("2026-08-01", 500, 1, 1, 1, "x")], today);
    expect(empty).toMatchObject({
      loggedDays: 0,
      avgKcal: null,
      macroPct: null,
      reliable: false,
    });
  });

  it("is reliable from a week of logging", () => {
    const days = Array.from({ length: 7 }, (_, k) =>
      m(`2026-10-0${k + 1}`, 500, 20, 60, 15, "x"),
    );
    expect(summarizeFood(days, today).reliable).toBe(true);
  });
});

describe("defaultMealType (Bangkok time)", () => {
  const at = (bangkokHour: number, min = 0) =>
    new Date(Date.UTC(2026, 9, 10, bangkokHour - 7, min));
  it("picks the slot by the hour", () => {
    expect(defaultMealType(at(7))).toBe("breakfast");
    expect(defaultMealType(at(10, 29))).toBe("breakfast");
    expect(defaultMealType(at(12))).toBe("lunch");
    expect(defaultMealType(at(15))).toBe("snack");
    expect(defaultMealType(at(19))).toBe("dinner");
    expect(defaultMealType(at(23))).toBe("dinner");
    expect(defaultMealType(at(3))).toBe("breakfast");
  });
});
