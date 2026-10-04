import { describe, expect, it } from "vitest";
import type { CheckinRow } from "@/lib/health/checkin";
import {
  buildMonthlyStats,
  monthBounds,
  normalizeNarrative,
  parseMonth,
  previousMonth,
  recentMonths,
  reportPrompt,
  violatesReportGuardrails,
} from "./monthly";

const TODAY = "2026-10-15";

describe("months", () => {
  it("accepts a real, not-future month and rejects the rest", () => {
    expect(parseMonth("2026-09", TODAY)).toBe("2026-09");
    expect(parseMonth("2026-10", TODAY)).toBe("2026-10");
    expect(parseMonth("2026-11", TODAY)).toBeNull(); // future
    expect(parseMonth("2025-12", TODAY)).toBeNull(); // before the app
    expect(parseMonth("2026-13", TODAY)).toBeNull();
    expect(parseMonth("2026-9", TODAY)).toBeNull();
    expect(parseMonth(["2026-09"], TODAY)).toBeNull();
    expect(parseMonth(undefined, TODAY)).toBeNull();
  });
  it("knows month lengths, including February", () => {
    expect(monthBounds("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
      days: 28,
    });
    expect(monthBounds("2028-02").days).toBe(29);
    expect(monthBounds("2026-12").to).toBe("2026-12-31");
  });
  it("steps back across a year", () => {
    expect(previousMonth("2026-03")).toBe("2026-02");
    expect(previousMonth("2027-01")).toBe("2026-12");
  });
  it("lists recent months newest first and stops at the first month", () => {
    expect(recentMonths("2026-10-15", 3)).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
    expect(recentMonths("2026-02-03", 6)).toEqual(["2026-02", "2026-01"]);
  });
});

const checkin = (date: string, over: Partial<CheckinRow> = {}): CheckinRow => ({
  checkin_date: date,
  sleep_band: 3,
  activity_band: 2,
  energy: 4,
  mood: 4,
  nutrition: 3,
  ...over,
});

describe("buildMonthlyStats", () => {
  const base = {
    month: "2026-09",
    today: TODAY,
    lang: "en" as const,
    badges: [
      { key: "streak_3", earned_on: "2026-09-04" },
      { key: "meal_first", earned_on: "2026-10-01" },
    ],
  };
  it("counts only inside the month, with a streak that does not leak in from last month", () => {
    const s = buildMonthlyStats({
      ...base,
      checkins: [
        checkin("2026-08-30"),
        checkin("2026-08-31"),
        checkin("2026-09-01"),
        checkin("2026-09-02"),
        checkin("2026-09-04"),
        checkin("2026-10-01"),
      ],
      meals: [
        { meal_date: "2026-09-02" },
        { meal_date: "2026-09-02" },
        { meal_date: "2026-10-01" },
      ],
      labs: [],
    });
    expect(s).toMatchObject({
      checkinDays: 3,
      prevCheckinDays: 2,
      bestStreak: 2,
      mealsLogged: 2,
      mealDays: 1,
      labReports: 0,
      daysInMonth: 30,
      daysElapsed: 30,
      badges: ["streak_3"],
    });
    expect(s.avgScore).toBeGreaterThan(0);
  });
  it("an empty month has no average and the open month counts days so far", () => {
    const s = buildMonthlyStats({
      ...base,
      month: "2026-10",
      checkins: [],
      meals: [],
      labs: [],
    });
    expect(s.avgScore).toBeNull();
    expect(s.daysElapsed).toBe(15);
    expect(s.bestStreak).toBe(0);
  });
  it("lists out-of-range lab tests by name only, once each", () => {
    const item = (marker_key: string, status: string, name = marker_key) => ({
      name,
      marker_key,
      value: 150,
      unit: "mg/dL",
      value_std: 150,
      status,
      printed_range: "",
      confidence: 0.9,
      basis: "catalog",
    });
    const s = buildMonthlyStats({
      ...base,
      checkins: [],
      meals: [],
      labs: [
        {
          collected_on: "2026-09-10",
          items: [item("ldl", "watch"), item("hba1c", "normal")],
        },
        { collected_on: "2026-09-20", items: [item("ldl", "watch")] },
        {
          collected_on: "2026-08-20",
          items: [item("fasting_glucose", "abnormal")],
        },
      ],
    });
    expect(s.labReports).toBe(2);
    expect(s.outOfRange).toEqual([
      { name: "LDL cholesterol", status: "watch" },
    ]);
    expect(reportPrompt(s)).toContain("LDL cholesterol (watch)");
    expect(reportPrompt(s)).not.toContain("150"); // no values reach the model
  });
});

describe("narrative guardrails", () => {
  it("accepts a kind recap and drops bad bullets only", () => {
    const n = normalizeNarrative({
      summary:
        "คุณมาเช็กอินสม่ำเสมอในเดือนนี้ เก่งมากค่ะ ลองรักษาจังหวะนี้ต่อไป",
      highlights: ["เช็กอินติดต่อกัน 7 วัน", "ลดน้ำหนักให้ได้ 5 กิโลกรัม"],
      next_steps: ["บันทึกมื้ออาหารสัปดาห์ละ 3 วัน", "หยุดยาความดันได้เลย"],
    });
    expect(n).not.toBeNull();
    expect(n!.highlights).toEqual(["เช็กอินติดต่อกัน 7 วัน"]);
    expect(n!.nextSteps).toEqual(["บันทึกมื้ออาหารสัปดาห์ละ 3 วัน"]);
  });
  it("rejects a summary with a weight goal, a dose, a diagnosis or the wrong shape", () => {
    expect(
      normalizeNarrative({
        summary: "เดือนหน้าลองลดน้ำหนักให้ได้นะ",
        highlights: [],
        next_steps: [],
      }),
    ).toBeNull();
    expect(
      normalizeNarrative({
        summary: "Take 500 mg of it every day, you will feel great.",
        highlights: [],
        next_steps: [],
      }),
    ).toBeNull();
    expect(
      normalizeNarrative({
        summary: "You have diabetes, so be careful this month.",
        highlights: [],
        next_steps: [],
      }),
    ).toBeNull();
    expect(
      normalizeNarrative({ summary: "short", highlights: [], next_steps: [] }),
    ).toBeNull();
    expect(normalizeNarrative("nope")).toBeNull();
    expect(
      normalizeNarrative({
        summary: "A fine and friendly summary here.",
        highlights: "x",
      }),
    ).toMatchObject({
      highlights: [],
      nextSteps: [],
    });
  });
  it("flags body/weight talk in both languages", () => {
    for (const t of [
      "ต้องลดน้ำหนัก",
      "you should lose weight",
      "calorie target 1500",
      "ผอมลงเยอะ",
    ])
      expect(violatesReportGuardrails(t), t).toBe(true);
    expect(violatesReportGuardrails("เช็กอินครบ 20 วัน เยี่ยมมาก")).toBe(false);
  });
});
