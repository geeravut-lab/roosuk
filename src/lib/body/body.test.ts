import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import { violatesAnswerGuardrails } from "@/lib/ask/safety";
import { containsBannedAdvice } from "@/lib/quiz/quiz";
import {
  BODY_SCHEMA,
  MIN_RANGE_KG,
  adultStatus,
  assessBody,
  bandOf,
  bandsTouched,
  bmiOf,
  bodyPrompt,
  bodySystemPrompt,
  parseBodyAi,
  parseBodyForm,
  parseWeightInput,
  withMeasuredWeight,
  withoutMeasuredWeight,
  type BodyAi,
} from "./body";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ok = { height: "170", ack: "on" };
const ai = (over: Partial<BodyAi["body"]> = {}): BodyAi => ({
  body: {
    usable: true,
    issue: "none",
    weight_kg_low: 60,
    weight_kg_high: 68,
    confidence: 0.7,
    ...over,
  },
  face: { usable: true, tired_look: "none" },
  palm: { usable: true, pallor: "none" },
});

describe("BMI and Asian bands", () => {
  it("computes to one decimal", () => {
    expect(bmiOf(70, 170)).toBe(24.2);
    expect(bmiOf(60, 160)).toBe(23.4);
  });
  it("cuts at 18.5 / 23 / 25 / 30", () => {
    for (const [bmi, band] of [
      [17.9, "low"],
      [18.5, "healthy"],
      [22.9, "healthy"],
      [23, "above"],
      [24.9, "above"],
      [25, "high"],
      [29.9, "high"],
      [30, "very_high"],
    ] as const)
      expect(bandOf(bmi), String(bmi)).toBe(band);
  });
  it("tells which bands a range touches", () => {
    expect(bandsTouched(20, 22)).toEqual(["healthy"]);
    expect(bandsTouched(22, 25.5)).toEqual(["healthy", "high"]);
  });
});

describe("who may scan", () => {
  it("leans safe: only clearly adult birth years count", () => {
    expect(adultStatus(1985, 2026)).toBe("adult");
    expect(adultStatus(2007, 2026)).toBe("adult"); // 19
    expect(adultStatus(2008, 2026)).toBe("unknown"); // 17 or 18
    expect(adultStatus(2009, 2026)).toBe("minor");
    expect(adultStatus(2015, 2026)).toBe("minor");
    expect(adultStatus(null, 2026)).toBe("unknown");
  });
});

describe("parseBodyForm", () => {
  it("accepts a height with or without a weight", () => {
    expect(parseBodyForm(form(ok), "adult")).toEqual({
      ok: true,
      heightCm: 170,
      weightKg: null,
    });
    expect(
      parseBodyForm(form({ ...ok, height: "165,5", weight: "58.2" }), "adult"),
    ).toEqual({
      ok: true,
      heightCm: 165.5,
      weightKg: 58.2,
    });
  });
  it("needs the acknowledgement every time, and an age confirmation when the profile cannot say", () => {
    expect(parseBodyForm(form({ height: "170" }), "adult")).toEqual({
      ok: false,
      error: "err_body_ack",
    });
    expect(parseBodyForm(form(ok), "unknown")).toEqual({
      ok: false,
      error: "err_body_adult",
    });
    expect(parseBodyForm(form({ ...ok, adult: "on" }), "unknown").ok).toBe(
      true,
    );
  });
  it("never works for a minor, whatever is ticked", () => {
    expect(parseBodyForm(form({ ...ok, adult: "on" }), "minor")).toEqual({
      ok: false,
      error: "err_body_adult",
    });
  });
  it("rejects heights and weights outside what a person can be", () => {
    for (const bad of [
      { height: "90" },
      { height: "300" },
      { height: "abc" },
      { height: "" },
      { weight: "10" },
      { weight: "400" },
      { weight: "abc" },
    ] as Record<string, string>[])
      expect(
        parseBodyForm(form({ ...ok, ...bad }), "adult"),
        JSON.stringify(bad),
      ).toEqual({
        ok: false,
        error: "err_body_invalid",
      });
  });
});

describe("parseBodyAi", () => {
  it("accepts the schema's shape and repairs small slips", () => {
    expect(parseBodyAi(ai())).not.toBeNull();
    const r = parseBodyAi({
      body: {
        usable: true,
        issue: "weird",
        weight_kg_low: "60",
        weight_kg_high: 68,
        confidence: 0.8,
      },
    });
    expect(r!.body.issue).toBe("none");
    expect(r!.body.weight_kg_low).toBe(60);
    expect(r!.face).toEqual({ usable: false, tired_look: "unclear" });
  });
  it("rejects what is not that shape", () => {
    expect(parseBodyAi(null)).toBeNull();
    expect(parseBodyAi({ body: "x" })).toBeNull();
  });
  it("the schema asks for fixed categories only — no free text field", () => {
    const flat = JSON.stringify(BODY_SCHEMA);
    expect(flat).not.toMatch(/"description"|"summary"|"advice"|"comment"/);
  });
});

describe("assessBody", () => {
  const run = (a: BodyAi, weightKg: number | null = null) =>
    assessBody({
      heightCm: 170,
      weightKg,
      ai: a,
      hasFace: true,
      hasPalm: true,
    });

  it("turns an estimate into a BMI RANGE and a band decided by code", () => {
    const r = run(ai());
    expect(r.ok && r.result).toMatchObject({
      basis: "estimated",
      estLow: 60,
      estHigh: 68,
      bmiLow: 20.8,
      bmiHigh: 23.5,
      band: "healthy",
    });
  });
  it("a typed weight wins over the estimate", () => {
    const r = run(ai(), 80);
    expect(r.ok && r.result).toMatchObject({
      basis: "measured",
      weightKg: 80,
      bmiLow: 27.7,
      bmiHigh: 27.7,
      band: "high",
      estLow: 60,
    });
  });
  it("never shows a range narrower than the honesty floor, however sure the model sounds", () => {
    const r = run(ai({ weight_kg_low: 64, weight_kg_high: 65, confidence: 1 }));
    expect(r.ok && r.result.estHigh! - r.result.estLow!).toBeGreaterThanOrEqual(
      MIN_RANGE_KG,
    );
  });
  it("fixes an inverted range", () => {
    const r = run(ai({ weight_kg_low: 70, weight_kg_high: 62 }));
    expect(r.ok && [r.result.estLow, r.result.estHigh]).toEqual([62, 70]);
  });
  it("refuses a photo the model cannot use, each reason", () => {
    for (const issue of [
      "not_a_person",
      "not_full_body",
      "too_dark_or_blurry",
      "multiple_people",
    ] as const)
      expect(run(ai({ usable: false, issue })), issue).toEqual({
        ok: false,
        reason: "unusable",
      });
    expect(run(ai({ usable: false, issue: "none" }))).toEqual({
      ok: false,
      reason: "unusable",
    });
    expect(run(ai({ usable: true, issue: "not_a_person" }))).toEqual({
      ok: false,
      reason: "unusable",
    });
  });
  it("refuses anyone who looks like a minor, even with a typed weight", () => {
    expect(run(ai({ issue: "appears_to_be_minor" }), 55)).toEqual({
      ok: false,
      reason: "minor",
    });
    expect(run(ai({ usable: false, issue: "appears_to_be_minor" }))).toEqual({
      ok: false,
      reason: "minor",
    });
  });
  it("refuses numbers a person cannot have, a wild range and low confidence", () => {
    for (const bad of [
      ai({ weight_kg_low: 10, weight_kg_high: 20 }),
      ai({ weight_kg_low: 200, weight_kg_high: 300 }),
      ai({ weight_kg_low: 40, weight_kg_high: 90 }), // 50 kg wide
      ai({ confidence: 0.1 }),
      ai({ weight_kg_low: Number.NaN, weight_kg_high: Number.NaN }),
      ai({ weight_kg_low: 0, weight_kg_high: 0 }),
    ])
      expect(run(bad), JSON.stringify(bad.body)).toEqual({
        ok: false,
        reason: "unusable",
      });
    // a 170 cm person at 31–37 kg is a misreading, not a BMI of 10
    expect(run(ai({ weight_kg_low: 31, weight_kg_high: 37 }))).toEqual({
      ok: false,
      reason: "unusable",
    });
  });
  it("face and palm: only fixed notes, and 'unclear' when the photo was not usable; nothing when not provided", () => {
    const a = ai();
    a.face = { usable: true, tired_look: "possible" };
    a.palm = { usable: false, pallor: "possible" }; // unusable photo: the claim is dropped
    const r = run(a);
    expect(r.ok && [r.result.faceNote, r.result.palmNote]).toEqual([
      "possible",
      "unclear",
    ]);
    const none = assessBody({
      heightCm: 170,
      weightKg: null,
      ai: a,
      hasFace: false,
      hasPalm: false,
    });
    expect(none.ok && [none.result.faceNote, none.result.palmNote]).toEqual([
      "not_provided",
      "not_provided",
    ]);
  });
});

describe("changing the typed weight afterwards", () => {
  const scan = { heightCm: 170, estLow: 60, estHigh: 68 };
  it("recomputes BMI and band from the new weight", () => {
    expect(withMeasuredWeight(scan, 90)).toEqual({
      weightKg: 90,
      bmiLow: 31.1,
      bmiHigh: 31.1,
      band: "very_high",
      basis: "measured",
    });
  });
  it("goes back to the estimate when the weight is removed, or has nothing to go back to", () => {
    expect(withoutMeasuredWeight(scan)).toMatchObject({
      weightKg: null,
      basis: "estimated",
      band: "healthy",
    });
    expect(
      withoutMeasuredWeight({ heightCm: 170, estLow: null, estHigh: null }),
    ).toBeNull();
  });
  it("only accepts a plausible weight", () => {
    expect(parseWeightInput("62.5")).toBe(62.5);
    for (const bad of ["", "abc", "10", "999", null])
      expect(parseWeightInput(bad)).toBeNull();
  });
});

describe("the prompt", () => {
  it("only asks for what is visible and carries height, not identity", () => {
    const { system, prompt } = bodyPrompt({
      heightCm: 168,
      sex: "female",
      ageBand: "35-39",
      hasFace: true,
      hasPalm: false,
    });
    expect(system).toMatch(/never give health advice or diagnoses/);
    expect(system).toBe(bodySystemPrompt());
    expect(prompt).toContain("168 cm");
    expect(prompt).toMatch(/1\) a full-body photo, 2\) a face photo/);
    expect(prompt).not.toMatch(/3\)/);
    expect(prompt).toMatch(/under 18/);
    expect(prompt).not.toMatch(/@|email|name:/i);
  });
});

describe("what the user is told", () => {
  const bands = ["low", "healthy", "above", "high", "very_high"] as const;
  it("every sentence is in both languages and passes the same forbidden-statement checks as an AI answer", () => {
    for (const lang of ["th", "en"] as const) {
      const d = dict[lang] as unknown as Record<string, string>;
      const advice = [
        ...bands.flatMap((b) => [d[`bodyAdvice_${b}`], d[`bodyBand_${b}`]]),
        ...["possible", "none", "unclear"].flatMap((n) => [
          d[`bodyFace_${n}`],
          d[`bodyPalm_${n}`],
        ]),
      ];
      // the disclaimers say "not a diagnosis" on purpose, so only the advice goes through the answer check
      const fixed = [d.bodyNotesCaveat, d.bodyDisclaimer, d.bodyAsianNote];
      for (const text of [...advice, ...fixed]) {
        expect(text, lang).toBeTruthy();
        expect(text, text).not.toMatch(
          /ลดน้ำหนัก|ลดความอ้วน|diet|lose weight|weight[- ]loss|เป้าหมายน้ำหนัก|target weight/i,
        );
      }
      for (const text of advice) {
        expect(violatesAnswerGuardrails(text), text).toBe(false);
        expect(containsBannedAdvice(text), text).toBe(false);
      }
    }
  });
  it("never diagnoses or names a disease", () => {
    for (const lang of ["th", "en"] as const) {
      const d = dict[lang] as unknown as Record<string, string>;
      for (const k of Object.keys(d).filter((x) =>
        /^body(Advice|Face|Palm)_/.test(x),
      ))
        expect(d[k], k).not.toMatch(
          /โลหิตจาง|เบาหวาน|ตับ|anemia|diabet|liver|jaundice|disease|โรค/i,
        );
    }
  });
});
