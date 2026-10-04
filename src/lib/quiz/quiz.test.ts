import { describe, expect, it } from "vitest";
import {
  MAX_DELTA,
  containsBannedAdvice,
  QUIZ_LEVERS,
  TIPS_PER_LEVER,
  computeQuiz,
  leverPoints,
  leverYears,
  normalizeAiPlan,
  parseQuizForm,
  parseStoredPlan,
  planPrompt,
  templatePlan,
  type QuizAnswers,
} from "./quiz";

const YEAR = 2026;
const best: QuizAnswers = {
  birth_year: 1985,
  smoking: "never",
  alcohol: "occasional",
  exercise_days: 5,
  sleep_band: 3,
  produce_band: 4,
  stress: 1,
  checkup_last_year: true,
};
const worst: QuizAnswers = {
  birth_year: 1985,
  smoking: "current",
  alcohol: "daily",
  exercise_days: 0,
  sleep_band: 1,
  produce_band: 1,
  stress: 5,
  checkup_last_year: false,
};

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const formOk = {
  birth_year: "1985",
  smoking: "never",
  alcohol: "none",
  exercise_days: "3",
  sleep_band: "3",
  produce_band: "2",
  stress: "3",
  checkup_last_year: "yes",
};

describe("parseQuizForm", () => {
  it("parses a complete form", () => {
    expect(parseQuizForm(form(formOk), YEAR)).toEqual({
      ok: true,
      answers: {
        birth_year: 1985,
        smoking: "never",
        alcohol: "none",
        exercise_days: 3,
        sleep_band: 3,
        produce_band: 2,
        stress: 3,
        checkup_last_year: true,
      },
    });
  });
  it("requires every answer and rejects out-of-range values", () => {
    for (const k of Object.keys(formOk)) {
      const rest: Record<string, string> = { ...formOk };
      delete rest[k];
      expect(parseQuizForm(form(rest), YEAR).ok, `missing ${k}`).toBe(false);
    }
    for (const bad of [
      { birth_year: "2025" },
      { birth_year: "1900" },
      { smoking: "x" },
      { alcohol: "x" },
      { exercise_days: "8" },
      { sleep_band: "5" },
      { produce_band: "0" },
      { stress: "6" },
      { checkup_last_year: "maybe" },
    ])
      expect(
        parseQuizForm(form({ ...formOk, ...bad }), YEAR).ok,
        JSON.stringify(bad),
      ).toBe(false);
  });
});

describe("scoring", () => {
  it("scores healthy habits high and unhealthy ones low, within 0–100", () => {
    const hi = computeQuiz(best, YEAR);
    const lo = computeQuiz(worst, YEAR);
    expect(hi.score).toBeGreaterThan(85);
    expect(lo.score).toBeLessThan(25);
    for (const r of [hi, lo]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
  it("keeps the weights summing to 1 (a perfect answer set scores 100)", () => {
    const perfect: QuizAnswers = {
      ...best,
      alcohol: "none",
      exercise_days: 7,
      sleep_band: 3,
      produce_band: 4,
      stress: 1,
    };
    expect(computeQuiz(perfect, YEAR).score).toBe(100);
  });
  it("makes the health age younger for good habits and older for poor ones, never beyond ±10 years", () => {
    expect(computeQuiz(best, YEAR).deltaYears).toBeLessThan(0);
    expect(computeQuiz(worst, YEAR).deltaYears).toBeGreaterThan(5);
    for (const a of [best, worst]) {
      const r = computeQuiz(a, YEAR);
      expect(Math.abs(r.deltaYears)).toBeLessThanOrEqual(MAX_DELTA);
      expect(r.healthAge).toBe(r.chronoAge + r.deltaYears);
    }
    // extreme: an all-negative sum is clamped
    expect(
      Math.min(...QUIZ_LEVERS.map((k) => leverYears(best)[k])),
    ).toBeGreaterThanOrEqual(-2);
  });
  it("derives age from the birth year", () => {
    expect(computeQuiz(best, YEAR).chronoAge).toBe(41);
  });
  it("is monotonic: changing one habit for the worse never raises the score", () => {
    const base = leverPoints(best);
    expect(leverPoints({ ...best, smoking: "current" }).smoking).toBeLessThan(
      base.smoking,
    );
    expect(leverPoints({ ...best, exercise_days: 0 }).activity).toBeLessThan(
      base.activity,
    );
    expect(
      computeQuiz({ ...best, smoking: "current" }, YEAR).score,
    ).toBeLessThan(computeQuiz(best, YEAR).score);
  });
  it("picks up to three levers worth improving, biggest first, and none when habits are good", () => {
    const r = computeQuiz(worst, YEAR);
    expect(r.levers).toHaveLength(3);
    expect(r.levers[0]).toBe("smoking"); // +4 years is the biggest
    expect(
      computeQuiz(
        { ...best, alcohol: "none", exercise_days: 7, produce_band: 4 },
        YEAR,
      ).levers,
    ).toEqual([]);
  });
  it("never uses weight or body shape anywhere", () => {
    for (const k of QUIZ_LEVERS) expect(k).not.toMatch(/weight|bmi|body|obes/i);
  });
});

describe("templatePlan", () => {
  it("always has 7 days, six on levers and a final review", () => {
    const plan = templatePlan(["smoking", "sleep"]);
    expect(plan.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan[6]).toMatchObject({
      lever: "review",
      tipKey: "planTip_review",
    });
    expect(
      plan.slice(0, 6).every((d) => d.tipKey?.startsWith("planTip_")),
    ).toBe(true);
  });
  it("tops up missing levers with maintenance habits and rotates tips", () => {
    const plan = templatePlan([]);
    expect(new Set(plan.slice(0, 3).map((d) => d.lever)).size).toBe(3);
    const keys = plan.slice(0, 6).map((d) => d.tipKey);
    expect(new Set(keys).size).toBe(6); // 3 levers × 2 distinct tips
    expect(TIPS_PER_LEVER).toBeGreaterThanOrEqual(2);
  });
});

describe("AI plan validation", () => {
  const good = (
    text = "เดินเร็วหลังมื้อเย็น 10 นาทีเพื่อให้ร่างกายได้ขยับ",
  ) => ({
    days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, text })),
  });
  it("accepts a clean 7-day plan", () => {
    const plan = normalizeAiPlan(good(), ["activity"])!;
    expect(plan).toHaveLength(7);
    expect(plan[0]).toMatchObject({ day: 1, tipKey: null });
  });
  it("accepts days out of order but rejects missing days, wrong count, short or long text", () => {
    const g = good();
    expect(normalizeAiPlan({ days: [...g.days].reverse() }, [])).not.toBeNull();
    expect(normalizeAiPlan({ days: g.days.slice(0, 6) }, [])).toBeNull();
    expect(
      normalizeAiPlan(
        { days: g.days.map((d, i) => (i === 3 ? { ...d, day: 1 } : d)) },
        [],
      ),
    ).toBeNull();
    expect(
      normalizeAiPlan(
        { days: g.days.map((d, i) => (i === 0 ? { ...d, text: "สั้น" } : d)) },
        [],
      ),
    ).toBeNull();
    expect(normalizeAiPlan(good("x".repeat(301)), [])).toBeNull();
    expect(normalizeAiPlan("nope", [])).toBeNull();
  });
  it("rejects medical, supplement and weight-loss language in Thai and English", () => {
    for (const bad of [
      "กินวิตามินซีทุกเช้าเพื่อภูมิคุ้มกันดี",
      "ทานอาหารเสริมก่อนนอนเพื่อหลับสบาย",
      "อดอาหารมื้อเย็นเพื่อลดน้ำหนักให้ได้ผล",
      "ปรึกษาแพทย์เรื่องการรักษาโรคความดัน",
      "Take a daily supplement to boost your energy",
      "Try intermittent fasting for a few hours",
      "This will cure your insomnia quickly",
    ])
      expect(normalizeAiPlan(good(bad), []), bad).toBeNull();
  });
  it("rejects the word for medicine but not harmless words that merely contain ยา", () => {
    for (const bad of [
      "กินยาแก้ปวดก่อนนอนจะได้หลับสบาย",
      "ทานยานอนหลับเมื่อนอนไม่หลับ",
      "อย่าลืมกินยาทุกเช้า",
    ])
      expect(containsBannedAdvice(bad), bad).toBe(true);
    for (const ok of [
      "ลองเปลี่ยนมาดื่มน้ำเปล่าแก้วใหญ่ทันทีที่อยากสูบบุหรี่เพื่อช่วยเบี่ยงเบนความสนใจ",
      "ยามเช้าลองยืดเหยียดร่างกายเบา ๆ ห้านาทีก่อนเริ่มวัน",
      "เรียนรู้ภาษาใหม่วันละนิดเพื่อให้สมองได้ใช้งาน",
      "แก้ปัญหาทีละอย่างและหายใจลึก ๆ สองนาที",
      "รักษาความสม่ำเสมอของเวลานอนให้เหมือนเดิมทุกคืน",
      "เดินเร็วสิบนาทีหลังมื้ออาหารเพื่อให้ร่างกายได้ขยับ",
    ])
      expect(containsBannedAdvice(ok), ok).toBe(false);
    expect(
      normalizeAiPlan(good("อยากกินขนมหวานให้ดื่มน้ำเปล่าก่อนหนึ่งแก้ว"), []),
    ).not.toBeNull();
  });
  it("round-trips a stored plan", () => {
    const plan = templatePlan(["sleep"]);
    expect(parseStoredPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(parseStoredPlan([])).toEqual([]);
  });
  it("builds a prompt that carries levers but no identity, and forbids medical talk", () => {
    const { system, prompt } = planPrompt(computeQuiz(worst, YEAR), "th");
    expect(prompt).toContain("smoking");
    expect(prompt).not.toMatch(/1985|email|name/i);
    expect(system).toMatch(/never diagnose/);
    expect(system).toMatch(/weight loss/);
  });
});
