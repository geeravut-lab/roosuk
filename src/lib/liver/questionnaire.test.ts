import { describe, expect, it } from "vitest";
import {
  answersSchema,
  parseLiverForm,
  parseStoredAnswers,
  prefillTri,
  type LiverDefaults,
} from "./questionnaire";

const known: LiverDefaults = {
  birthYear: 1980,
  sex: "female",
  alcohol: "weekly",
  conditions: ["diabetes"],
  hepB: "never_tested",
  hepC: "unknown",
};

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

/** A complete, valid submission with no red flags. */
const full: [string, string][] = [
  ["redFlags", "none"],
  ["heightCm", "165"],
  ["weightKg", "58"],
  ["waistCm", ""],
  ["diabetes", "no"],
  ["hypertension", "no"],
  ["dyslipidemia", "unsure"],
  ["history", "none"],
  ["familyLiver", "no"],
  ["hepB", "vaccinated"],
  ["hepC", "negative"],
  ["alcohol", "occasional"],
  ["meds", "yes"],
  ["symptoms", "none"],
];

describe("parseLiverForm", () => {
  it("reads a complete form, filling birth year and sex from the profile", () => {
    const r = parseLiverForm(form(full), known);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers).toMatchObject({
      redFlags: [],
      birthYear: 1980,
      sex: "female",
      heightCm: 165,
      weightKg: 58,
      waistCm: null,
      diabetes: "no",
      dyslipidemia: "unsure",
      hepB: "vaccinated",
      meds: "yes",
      symptoms: [],
      history: [],
    });
    // what comes out is what the database check accepts
    expect(answersSchema.safeParse(r.answers).success).toBe(true);
  });

  it("a submitted birth year and sex win over the profile", () => {
    const r = parseLiverForm(
      form([...full, ["birthYear", "1962"], ["sex", "male"]]),
      known,
    );
    expect(r.ok && r.answers).toMatchObject({ birthYear: 1962, sex: "male" });
  });

  it("silence is not an answer: red flags must be answered, 'none' counts", () => {
    expect(parseLiverForm(form(full.slice(1)), known).ok).toBe(false);
    expect(parseLiverForm(form(full), known).ok).toBe(true);
  });

  it("requires every other question when there is no red flag", () => {
    for (const name of [
      "diabetes",
      "hypertension",
      "dyslipidemia",
      "familyLiver",
      "hepB",
      "hepC",
      "alcohol",
      "meds",
      "history",
      "symptoms",
    ]) {
      const r = parseLiverForm(form(full.filter(([k]) => k !== name)), known);
      expect(r.ok, name).toBe(false);
    }
    // and a birth year from somewhere
    expect(parseLiverForm(form(full), { ...known, birthYear: null }).ok).toBe(
      false,
    );
  });

  it("a red flag ends the questionnaire: nothing else is required", () => {
    const r = parseLiverForm(form([["redFlags", "jaundice"]]), {
      ...known,
      birthYear: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answers.redFlags).toEqual(["jaundice"]);
    expect(r.answers.birthYear).toBeNull();
    expect(r.answers.diabetes).toBe("unsure");
  });

  it("'none' together with a real red flag still counts the flag", () => {
    const r = parseLiverForm(
      form([
        ["redFlags", "none"],
        ["redFlags", "gi_bleed"],
      ]),
      known,
    );
    expect(r.ok && r.answers.redFlags).toEqual(["gi_bleed"]);
  });

  it("refuses numbers outside a human range or that are not numbers", () => {
    for (const [name, value] of [
      ["heightCm", "17"],
      ["heightCm", "abc"],
      ["weightKg", "5"],
      ["weightKg", "1000"],
      ["waistCm", "10"],
      ["birthYear", "1800"],
    ] as const)
      expect(
        parseLiverForm(
          form([...full.filter(([k]) => k !== name), [name, value]]),
          known,
        ).ok,
        `${name}=${value}`,
      ).toBe(false);
  });

  it("ignores unknown option values instead of storing them", () => {
    const r = parseLiverForm(
      form([
        ...full.filter(([k]) => k !== "symptoms" && k !== "history"),
        ["symptoms", "fatigue"],
        ["symptoms", "made_up"],
        ["history", "told_fatty_liver"],
        ["history", "<script>"],
      ]),
      known,
    );
    expect(r.ok && r.answers.symptoms).toEqual(["fatigue"]);
    expect(r.ok && r.answers.history).toEqual(["told_fatty_liver"]);
    expect(
      parseLiverForm(
        form([...full.filter(([k]) => k !== "hepB"), ["hepB", "maybe"]]),
        known,
      ).ok,
    ).toBe(false);
  });
});

describe("stored answers", () => {
  it("are validated again on the way out", () => {
    expect(parseStoredAnswers({ nonsense: true })).toBeNull();
    expect(parseStoredAnswers(null)).toBeNull();
    const ok = parseLiverForm(form(full), known);
    expect(ok.ok && parseStoredAnswers(ok.answers)).toEqual(
      ok.ok ? ok.answers : null,
    );
  });
});

describe("prefill", () => {
  it("pre-answers only what the profile already says", () => {
    expect(prefillTri(["diabetes"], "diabetes")).toBe("yes");
    expect(prefillTri(["diabetes"], "hypertension")).toBe("");
  });
});
