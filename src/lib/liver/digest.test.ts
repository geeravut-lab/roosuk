import { describe, expect, it } from "vitest";
import { inputsDigest } from "./digest";
import type { LiverAnswers } from "./questionnaire";

const answers: LiverAnswers = {
  redFlags: [],
  birthYear: 1980,
  sex: "male",
  heightCm: null,
  weightKg: null,
  waistCm: null,
  diabetes: "no",
  hypertension: "no",
  dyslipidemia: "no",
  history: [],
  familyLiver: "no",
  hepB: "negative",
  hepC: "negative",
  alcohol: "none",
  meds: "no",
  symptoms: [],
};

describe("inputsDigest", () => {
  const panels = [
    {
      date: "2026-09-01",
      values: { alt: { value: 30, status: "normal" as const } },
    },
    {
      date: "2026-03-01",
      values: { alt: { value: 28, status: "normal" as const } },
    },
  ];
  it("is a SHA-256 hex string and does not depend on key or panel order", () => {
    const a = inputsDigest({ today: "2026-10-10", answers, panels });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const reordered = inputsDigest({
      panels: [...panels].reverse(),
      answers: Object.fromEntries(
        Object.entries(answers).reverse(),
      ) as LiverAnswers,
      today: "2026-10-10",
    });
    expect(reordered).toBe(a);
  });
  it("changes when any input changes", () => {
    const a = inputsDigest({ today: "2026-10-10", answers, panels });
    expect(inputsDigest({ today: "2026-10-11", answers, panels })).not.toBe(a);
    expect(
      inputsDigest({
        today: "2026-10-10",
        answers: { ...answers, meds: "yes" },
        panels,
      }),
    ).not.toBe(a);
    expect(
      inputsDigest({ today: "2026-10-10", answers, panels: [panels[0]] }),
    ).not.toBe(a);
  });
});
