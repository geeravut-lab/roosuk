import { describe, expect, it } from "vitest";
import type { GoalKind, GoalParams } from "./kinds";
import {
  ageBand,
  computeTargets,
  normalizeProgram,
  parseStoredProgram,
  programPrompt,
  violatesProgramGuardrails,
  type ProgramContext,
} from "./program";
import { templateProgram } from "./templates";
import { CONDITION_GOALS } from "./kinds";

const weightParams: GoalParams = {
  direction: "lose",
  heightCm: 160,
  weightKg: 75,
  targetKg: 65,
  pace: "standard",
  activity: "light",
  flags: { pregnant: false, edHistory: false, medical: false },
  sex: "female",
  birthYear: 1990,
};

function ctx(
  kind: GoalKind,
  params: GoalParams,
  lang: "th" | "en" = "th",
): ProgramContext {
  return {
    kind,
    lang,
    params,
    targets: computeTargets(kind, params, { age: 36, sex: "female" }),
    profile: { ageBand: ageBand(36), sex: "female", conditions: ["gout"] },
    food: null,
    checkins: null,
    watchTags: [],
    weight: null,
  };
}

const goodAi = {
  summary: "แผนเล็กๆ ที่ทำได้ทุกวัน เน้นกินให้พอดีและขยับตัว",
  tasks: [
    { text: "บันทึกอาหารอย่างน้อย 2 มื้อ", kind: "habit" },
    { text: "เดินเร็ว 30 นาที", kind: "move" },
    { text: "กินโปรตีนทุกมื้อ", kind: "meal" },
    { text: "นอนให้พอ", kind: "sleep" },
  ],
  meal_ideas: [{ slot: "breakfast", ideas: ["ไข่ต้มกับผลไม้", "โจ๊กใส่ไข่"] }],
  week: [
    { day: 1, focus: "เดินเร็ว" },
    { day: 2, focus: "ยืดเหยียด" },
  ],
  tips: ["ค่อยๆ เปลี่ยนทีละอย่าง"],
  watch_outs: ["ถ้ามีอาการผิดปกติให้พบแพทย์"],
};

describe("computeTargets", () => {
  it("weight goals go through the safety rules", () => {
    const t = computeTargets("weight", weightParams, {
      age: 36,
      sex: "female",
    });
    expect(t.showCalories).toBe(true);
    expect(t.kcal).toBeGreaterThanOrEqual(1200);
    const minor = computeTargets("weight", weightParams, {
      age: 16,
      sex: "female",
    });
    expect(minor).toEqual({ showCalories: false });
  });

  it("sleep goals derive a bedtime and a caffeine cut-off from the wake time", () => {
    const t = computeTargets(
      "sleep",
      {
        avgHours: "5to6",
        problem: "fall_asleep",
        caffeine: "afternoon",
        wakeTime: "06:30",
      },
      { age: 40, sex: null },
    );
    expect(t.sleep).toEqual({
      hours: 7,
      bedtime: "23:30",
      wake: "06:30",
      caffeineCutoff: "15:30",
    });
  });
});

describe("normalizeProgram", () => {
  it("accepts a good answer, numbering the tasks", () => {
    const p = normalizeProgram(goodAi)!;
    expect(p.tasks.map((t) => t.key)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(p.mealIdeas).toEqual([
      { slot: "breakfast", ideas: ["ไข่ต้มกับผลไม้", "โจ๊กใส่ไข่"] },
    ]);
    expect(p.week).toHaveLength(2);
  });

  it("drops single bad lines but keeps the program", () => {
    const p = normalizeProgram({
      ...goodAi,
      tasks: [
        ...goodAi.tasks,
        { text: "ข้ามมื้อเย็นเพื่อลดเร็วขึ้น", kind: "meal" },
      ],
      tips: ["กินวิตามิน 2 เม็ดทุกเช้า", "ดื่มน้ำให้พอ"],
    })!;
    expect(p.tasks.map((t) => t.text)).not.toContain(
      "ข้ามมื้อเย็นเพื่อลดเร็วขึ้น",
    );
    expect(p.tips).toEqual(["ดื่มน้ำให้พอ"]);
  });

  it("rejects a program whose summary breaks a rule, or with fewer than 3 usable tasks", () => {
    expect(
      normalizeProgram({
        ...goodAi,
        summary: "คุณเป็นเบาหวานแล้ว ควรอดอาหารสองวัน",
      }),
    ).toBeNull();
    expect(
      normalizeProgram({ ...goodAi, tasks: goodAi.tasks.slice(0, 2) }),
    ).toBeNull();
    expect(normalizeProgram("nonsense")).toBeNull();
    expect(normalizeProgram({})).toBeNull();
  });

  it("unknown task kinds become habits", () => {
    const p = normalizeProgram({
      ...goodAi,
      tasks: goodAi.tasks.map((t) => ({ ...t, kind: "x" })),
    })!;
    expect(new Set(p.tasks.map((t) => t.kind))).toEqual(new Set(["habit"]));
  });
});

describe("violatesProgramGuardrails", () => {
  it.each([
    "ลดให้ได้ 5 กก. ภายใน 7 วัน",
    "lose 5 kg in a week",
    "อดอาหารหนึ่งวัน",
    "ล้างพิษร่างกายด้วยน้ำผัก",
    "ทานอาหารเสริมวิตามินซี",
    "กินให้ได้ 1500 แคลอรี่",
    "stay under 1500 kcal",
    "หยุดกินยาเบาหวานได้เลย",
    "คุณเป็นเบาหวาน",
    "หายขาดแน่นอน",
  ])("blocks %s", (text) => expect(violatesProgramGuardrails(text)).toBe(true));

  it.each([
    "เดินเร็ว 30 นาที",
    "เลือกน้ำเปล่าแทนเครื่องดื่มหวาน",
    "ไม่ควรหยุดยาเองโดยไม่ถามแพทย์",
    "Walk for 30 minutes and drink water",
  ])("lets %s through", (text) =>
    expect(violatesProgramGuardrails(text)).toBe(false),
  );
});

describe("template programs", () => {
  const all: [GoalKind, GoalParams][] = [
    ["weight", weightParams],
    [
      "weight",
      {
        ...weightParams,
        direction: "gain",
        weightKg: 50,
        heightCm: 165,
        targetKg: 55,
      },
    ],
    ["weight", { ...weightParams, direction: "maintain", targetKg: null }],
    [
      "sleep",
      {
        avgHours: "5to6",
        problem: "wake_night",
        caffeine: "evening",
        wakeTime: "06:30",
      },
    ],
    [
      "sleep",
      {
        avgHours: "7to8",
        problem: "sleepy_day",
        caffeine: "none",
        wakeTime: "07:00",
      },
    ],
    ["brain", { aim: "focus", sitHours: "gt8", sleepHours: "6to7" }],
    ["brain", { aim: "memory", sitHours: "lt4", sleepHours: "7to8" }],
    ...CONDITION_GOALS.map((condition): [GoalKind, GoalParams] => [
      "condition",
      { condition, underCare: true },
    ]),
  ];

  it.each(all.map((x, i) => [i, x[0]] as const))(
    "every template (#%i %s) is valid and passes its own guard, in both languages",
    (i) => {
      const [kind, params] = all[i];
      for (const lang of ["th", "en"] as const) {
        const p = templateProgram(ctx(kind, params, lang));
        expect(p.tasks.length).toBeGreaterThanOrEqual(3);
        expect(p.tasks.length).toBeLessThanOrEqual(6);
        expect(new Set(p.tasks.map((t) => t.key)).size).toBe(p.tasks.length);
        expect(p.week).toHaveLength(7);
        expect(p.watchOuts.length).toBeGreaterThan(0);
        const text = JSON.stringify(p);
        expect(violatesProgramGuardrails(p.summary)).toBe(false);
        for (const t of p.tasks)
          expect(violatesProgramGuardrails(t.text), t.text).toBe(false);
        for (const m of p.mealIdeas)
          for (const x of m.ideas)
            expect(violatesProgramGuardrails(x), x).toBe(false);
        for (const x of [
          ...p.tips,
          ...p.watchOuts,
          ...p.week.map((w) => w.focus),
        ])
          expect(violatesProgramGuardrails(x), x).toBe(false);
        expect(text).not.toMatch(/undefined|NaN/);
        expect(parseStoredProgram(JSON.parse(text))).toEqual(p);
      }
    },
  );

  it("a sleep program uses the computed times", () => {
    const p = templateProgram(ctx("sleep", all[3][1]));
    expect(p.tasks[0].text).toContain("23:30");
  });

  it("a condition program for a doctor-led condition always carries the doctor note", () => {
    const p = templateProgram(
      ctx("condition", { condition: "kidney_disease", underCare: true }),
    );
    expect(p.watchOuts.join(" ")).toContain("แพทย์");
  });
});

describe("programPrompt", () => {
  it("gives the model facts but no birth year, sex field or free identity", () => {
    const c = ctx("weight", weightParams);
    const text = programPrompt({
      ...c,
      food: {
        loggedDays: 12,
        windowDays: 30,
        meals: 30,
        avgKcal: 1700,
        avgProteinG: 60,
        avgCarbsG: 220,
        avgFatG: 55,
        macroPct: { protein: 14, carbs: 52, fat: 29 },
        topFoods: [{ name: "ข้าวผัด", days: 6 }],
        reliable: true,
      },
    });
    expect(text).toContain("age band 30s");
    expect(text).toContain("12 days logged");
    expect(text).toContain("ข้าวผัด");
    expect(text).not.toContain("1990");
    expect(text).not.toContain("birthYear");
  });
});
