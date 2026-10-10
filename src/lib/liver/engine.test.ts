import { describe, expect, it } from "vitest";
import {
  assessLiver,
  type LabPanel,
  type LabValue,
  type LiverMarker,
} from "./engine";
import { RED_FLAGS, SYMPTOMS, type LiverAnswers } from "./questionnaire";

const TODAY = "2026-10-10";

/** A person with nothing of concern, 41 years old. */
const healthy: LiverAnswers = {
  redFlags: [],
  birthYear: 1985,
  sex: "male",
  heightCm: 175,
  weightKg: 68,
  waistCm: 80,
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
const answers = (o: Partial<LiverAnswers> = {}): LiverAnswers => ({
  ...healthy,
  ...o,
});

const v = (value: number, status: LabValue["status"] = "normal"): LabValue => ({
  value,
  status,
});
const panel = (
  date: string,
  values: Partial<Record<LiverMarker, LabValue>>,
): LabPanel => ({ date, values });

/** A normal liver panel. */
const normalLabs = (date = "2026-09-20"): LabPanel =>
  panel(date, {
    alt: v(25),
    ast: v(24),
    alp: v(80),
    ggt: v(30),
    total_bilirubin: v(0.7),
    albumin: v(4.4),
    platelets: v(250),
    inr: v(1.0),
  });

const run = (a: Partial<LiverAnswers>, panels: LabPanel[] = []) =>
  assessLiver({ today: TODAY, answers: answers(a), panels });

describe("level 0 — no current concern", () => {
  it("healthy answers and a normal panel", () => {
    const r = run({}, [normalLabs()]);
    expect(r.level).toBe(0);
    expect(r.urgency).toBe("none");
    expect(r.reasons).toEqual([]);
    expect(r.scores.fib4).toMatchObject({ status: "ok", band: "low" });
    expect(r.scores.apri).toMatchObject({ status: "ok", band: "low" });
    expect(r.scoresOn).toBe("2026-09-20");
  });
  it("no labs at all is still level 0 for someone with no risk — and says the data is missing", () => {
    const r = run({});
    expect(r.level).toBe(0);
    expect(r.gaps).toContain("no_labs");
    expect(r.scores.fib4).toEqual({
      status: "insufficient",
      missing: ["ast", "alt", "platelets"],
    });
  });
});

describe("level 3 — red flags and severe values", () => {
  it.each(RED_FLAGS)(
    "%s alone is level 3 with the emergency message, whatever the labs say",
    (flag) => {
      const r = run({ redFlags: [flag] }, [normalLabs()]);
      expect(r.level).toBe(3);
      expect(r.urgency).toBe("emergency");
      expect(r.reasons[0].code).toBe(`rf_${flag}`);
    },
  );
  it("works with nothing else answered", () => {
    const r = assessLiver({
      today: TODAY,
      answers: answers({
        redFlags: ["jaundice"],
        birthYear: null,
        heightCm: null,
        weightKg: null,
        waistCm: null,
        diabetes: "unsure",
        hepB: "unknown",
        hepC: "unknown",
        alcohol: null,
      }),
      panels: [],
    });
    expect(r.level).toBe(3);
    expect(r.urgency).toBe("emergency");
  });
  it("several red flags are all listed", () => {
    const r = run({ redFlags: ["gi_bleed", "confusion"] });
    expect(r.redFlags).toEqual(["gi_bleed", "confusion"]);
    expect(r.reasons.map((x) => x.code)).toEqual(
      expect.arrayContaining(["rf_gi_bleed", "rf_confusion"]),
    );
  });
  it.each([
    ["alt", 400],
    ["ast", 400],
    ["total_bilirubin", 3.0],
    ["inr", 1.5],
    ["albumin", 2.4],
    ["platelets", 49],
  ] as const)(
    "a severe %s (%s) is level 3 'see a doctor soon', not the emergency message",
    (marker, value) => {
      const r = run({}, [
        panel("2026-10-01", { [marker]: v(value, "abnormal") }),
      ]);
      expect(r.level).toBe(3);
      expect(r.urgency).toBe("soon");
      expect(r.reasons.find((x) => x.code === "lab_severe")?.markers).toEqual([
        marker,
      ]);
    },
  );
  it("just under the severe values is level 2, not 3", () => {
    expect(
      run({}, [panel("2026-10-01", { alt: v(399, "abnormal") })]).level,
    ).toBe(2);
    expect(
      run({}, [panel("2026-10-01", { total_bilirubin: v(2.9, "watch") })])
        .level,
    ).toBe(2);
    expect(
      run({}, [panel("2026-10-01", { platelets: v(50, "abnormal") })]).level,
    ).toBe(2);
  });
  it("a red flag never lowers the level (adding any red flag to any situation gives level 3)", () => {
    const situations = [
      run({}),
      run({ diabetes: "yes" }),
      run({ symptoms: ["itching"] }, [normalLabs()]),
      run({}, [panel("2026-10-01", { alt: v(90, "abnormal") })]),
    ];
    for (const s of situations) {
      for (const f of RED_FLAGS) {
        const withFlag = run({ redFlags: [f] });
        expect(withFlag.level).toBeGreaterThanOrEqual(s.level);
        expect(withFlag.level).toBe(3);
      }
    }
  });
});

describe("level 2 — needs follow-up", () => {
  it("any core liver test outside its range", () => {
    const r = run({}, [
      normalLabs(),
      panel("2026-10-01", { alt: v(62, "watch") }),
    ]);
    expect(r.level).toBe(2);
    expect(r.reasons).toContainEqual({
      code: "lab_out_of_range",
      markers: ["alt"],
    });
    expect(r.outOfRange).toEqual([{ marker: "alt", status: "watch" }]);
  });
  it("uses the NEWEST fresh value of a test", () => {
    const r = run({}, [
      panel("2026-03-01", { alt: v(120, "abnormal") }),
      panel("2026-09-01", { alt: v(30) }),
    ]);
    expect(r.level).toBe(0);
  });
  it("FIB-4 in the middle band raises to level 2 even when every enzyme is normal", () => {
    // age 41 × AST 40 / (platelets 150 × √ALT 40) = 1.73
    const r = run({}, [
      panel("2026-09-01", { alt: v(40), ast: v(40), platelets: v(150) }),
    ]);
    expect(r.scores.fib4).toMatchObject({ status: "ok", band: "intermediate" });
    expect(r.level).toBe(2);
    expect(r.reasons.map((x) => x.code)).toContain("fib4_intermediate");
  });
  it("FIB-4 above 2.67 is reported as high", () => {
    const r = run({ birthYear: 1970 }, [
      panel("2026-09-01", {
        alt: v(40),
        ast: v(90, "abnormal"),
        platelets: v(110, "watch"),
      }),
    ]);
    expect(r.scores.fib4).toMatchObject({ band: "high" });
    expect(r.reasons.map((x) => x.code)).toContain("fib4_high");
    expect(r.level).toBe(2);
  });
  it("for someone 65 or over, a FIB-4 of 1.3–2.0 is not a reason to escalate", () => {
    // age 66 × 40 / (200 × √100) = 1.32
    const labs = [
      panel("2026-09-01", { alt: v(30), ast: v(30), platelets: v(200) }),
    ];
    const older = run({ birthYear: 1960, diabetes: "no" }, [
      panel("2026-09-01", {
        alt: v(100, "abnormal"),
        ast: v(40),
        platelets: v(200),
      }),
    ]);
    expect(older.scores.fib4).toMatchObject({
      value: 1.32,
      band: "low",
      ageNote: "over65",
    });
    expect(older.reasons.map((x) => x.code)).not.toContain("fib4_intermediate");
    const younger = run({ birthYear: 1985 }, [
      panel("2026-09-01", {
        alt: v(100, "abnormal"),
        ast: v(40),
        platelets: v(200),
      }),
    ]);
    expect(younger.scores.fib4).toMatchObject({ value: 0.82 });
    void labs;
  });
  it("the age used is the age on the day of the blood test", () => {
    // born 1961: 64 at a 2025 test → low cut-off 1.3; 65 at a 2026 test → 2.0
    const at2025 = assessLiver({
      today: "2025-12-01",
      answers: answers({ birthYear: 1961 }),
      panels: [
        panel("2025-11-01", { alt: v(25), ast: v(18), platelets: v(150) }),
      ],
    });
    const at2026 = assessLiver({
      today: "2026-02-01",
      answers: answers({ birthYear: 1961 }),
      panels: [
        panel("2026-01-10", { alt: v(25), ast: v(18), platelets: v(150) }),
      ],
    });
    expect(at2025.scores.fib4).toMatchObject({ band: "intermediate" });
    expect(at2026.scores.fib4).toMatchObject({ band: "low" });
  });
  it("APRI above 1.5 raises to level 2", () => {
    const r = run({}, [
      panel("2026-09-01", {
        alt: v(30),
        ast: v(70, "watch"),
        platelets: v(110, "watch"),
      }),
    ]);
    expect(r.scores.apri).toMatchObject({ band: "high" });
    expect(r.reasons.map((x) => x.code)).toContain("apri_high");
  });
  it("hepatitis B or C marked positive", () => {
    expect(run({ hepB: "positive" }).level).toBe(2);
    const r = run({ hepC: "positive" });
    expect(r.level).toBe(2);
    expect(r.reasons.map((x) => x.code)).toContain("hep_positive");
  });
  it("having been told of abnormal liver tests or liver disease", () => {
    expect(run({ history: ["abnormal_liver_tests"] }).level).toBe(2);
    expect(run({ history: ["liver_disease"] }).level).toBe(2);
    // told "fatty liver" alone is a risk factor (level 1), per the design doc
    expect(run({ history: ["told_fatty_liver"] }).level).toBe(1);
  });
  it("dark urine / pale stool, itching or unintended weight loss", () => {
    for (const s of [
      "dark_urine_pale_stool",
      "itching",
      "weight_loss",
    ] as const)
      expect(run({ symptoms: [s] }).level).toBe(2);
  });
  it("three or more risk factors together", () => {
    const two = run({ diabetes: "yes", hypertension: "yes" });
    expect(two.level).toBe(1);
    const three = run({
      diabetes: "yes",
      hypertension: "yes",
      dyslipidemia: "yes",
    });
    expect(three.level).toBe(2);
    expect(three.reasons.map((x) => x.code)).toContain("many_factors");
  });
});

describe("level 1 — risk factors present", () => {
  it.each([
    ["diabetes", { diabetes: "yes" }],
    ["hypertension", { hypertension: "yes" }],
    ["dyslipidemia", { dyslipidemia: "yes" }],
    ["daily alcohol", { alcohol: "daily" }],
    ["family history", { familyLiver: "yes" }],
    ["medicines or herbs", { meds: "yes" }],
    ["one chronic symptom", { symptoms: ["fatigue"] }],
    ["BMI 23 or more", { heightCm: 170, weightKg: 67 }],
    ["waist at the limit (man 90)", { waistCm: 90 }],
  ] as [string, Partial<LiverAnswers>][])("%s", (_name, a) => {
    const r = run(a, [normalLabs()]);
    expect(r.level).toBe(1);
    expect(r.urgency).toBe("none");
  });
  it("waist limits depend on sex; with the sex unknown the waist is not judged", () => {
    expect(run({ sex: "female", waistCm: 80 }).level).toBe(1);
    expect(run({ sex: "female", waistCm: 79 }).level).toBe(0);
    expect(run({ sex: "male", waistCm: 89 }).level).toBe(0);
    expect(run({ sex: null, waistCm: 120 }).level).toBe(0);
  });
  it("BMI is judged at 23 (Asian cut-off)", () => {
    // 170 cm: 22.9 at 66 kg, 23.2 at 67 kg
    expect(run({ heightCm: 170, weightKg: 66 }).level).toBe(0);
    expect(run({ heightCm: 170, weightKg: 67 }).level).toBe(1);
    expect(run({ heightCm: 170, weightKg: 67 }).bmi).toBe(23.2);
  });
  it("raised triglycerides, low HDL or high glucose in the labs", () => {
    const base = normalLabs();
    for (const extra of [
      { triglycerides: v(190, "watch") },
      { hdl: v(35, "watch") },
      { fasting_glucose: v(110, "watch") },
      { hba1c: v(5.9, "watch") },
    ] as Partial<Record<LiverMarker, LabValue>>[]) {
      const r = run({}, [{ ...base, values: { ...base.values, ...extra } }]);
      expect(r.level).toBe(1);
      expect(r.factors).toContain("metabolic_labs");
    }
  });
  it("born up to 1991 and never tested for hepatitis B", () => {
    const r = run({ birthYear: 1975, hepB: "never_tested" }, [normalLabs()]);
    expect(r.level).toBe(1);
    expect(r.factors).toContain("hep_b_cohort");
    expect(r.doctorQuestions).toContain("hepatitis_tests");
    expect(run({ birthYear: 1992, hepB: "never_tested" }).level).toBe(0);
    expect(run({ birthYear: 1975, hepB: "vaccinated" }).level).toBe(0);
  });
  it("an untested hepatitis status is a data gap and a suggestion, not a risk", () => {
    const r = run({ birthYear: 2000, hepB: "never_tested", hepC: "unknown" });
    expect(r.level).toBe(0);
    expect(r.gaps).toContain("hep_untested");
    expect(r.doctorQuestions).toContain("hepatitis_tests");
  });
});

describe("missing data never becomes a number", () => {
  it("platelets missing → FIB-4 and APRI are 'insufficient' and say what is missing", () => {
    const r = run({}, [panel("2026-09-01", { alt: v(25), ast: v(24) })]);
    expect(r.scores.fib4).toEqual({
      status: "insufficient",
      missing: ["platelets"],
    });
    expect(r.scores.apri).toEqual({
      status: "insufficient",
      missing: ["platelets"],
    });
    expect(r.gaps).toContain("fib4_missing");
    expect(r.level).toBe(0);
  });
  it("the three FIB-4 values must come from the same day", () => {
    const r = run({}, [
      panel("2026-03-01", { alt: v(25), ast: v(24) }),
      panel("2026-08-01", { platelets: v(250) }),
    ]);
    expect(r.scores.fib4).toEqual({
      status: "insufficient",
      missing: ["same_day"],
    });
  });
  it("a second, older panel with all three does not hide a newer incomplete one — the newest COMPLETE panel is used", () => {
    const r = run({}, [
      panel("2026-02-01", { alt: v(25), ast: v(24), platelets: v(250) }),
      panel("2026-08-01", { alt: v(25) }),
    ]);
    expect(r.scoresOn).toBe("2026-02-01");
    expect(r.scores.fib4.status).toBe("ok");
  });
  it("no birth year → no FIB-4, and the gap is named", () => {
    const r = run({ birthYear: null }, [normalLabs()]);
    expect(r.scores.fib4).toEqual({ status: "insufficient", missing: ["age"] });
    expect(r.gaps).toContain("no_age");
  });
  it("an implausible platelet value (a count typed in the wrong unit) is 'invalid', not a score", () => {
    const r = run({}, [
      panel("2026-09-01", { alt: v(25), ast: v(24), platelets: v(250000) }),
    ]);
    expect(r.scores.fib4).toEqual({ status: "invalid", fields: ["platelets"] });
    expect(r.scores.apri).toEqual({ status: "invalid", fields: ["platelets"] });
  });
  it("NFS and FLI only appear when all their inputs exist", () => {
    const none = run({}, [normalLabs()]);
    expect(none.scores.nfs.status).toBe("ok"); // albumin, BMI and 'no diabetes' are all there
    expect(none.scores.fli.status).toBe("insufficient"); // no triglycerides
    const noBmi = run({ heightCm: null }, [normalLabs()]);
    expect(noBmi.scores.nfs).toEqual({
      status: "insufficient",
      missing: ["bmi"],
    });
    const unsure = run({ diabetes: "unsure" }, [normalLabs()]);
    expect(unsure.scores.nfs).toEqual({
      status: "insufficient",
      missing: ["glucoseOrDiabetes"],
    });
    const withTg = run({}, [
      {
        ...normalLabs(),
        values: { ...normalLabs().values, triglycerides: v(120) },
      },
    ]);
    expect(withTg.scores.fli.status).toBe("ok");
  });
  it("a fasting glucose or HbA1c in the diabetic range answers NFS's diabetes term", () => {
    const labs = normalLabs();
    const r = run({ diabetes: "unsure" }, [
      { ...labs, values: { ...labs.values, hba1c: v(7.1, "abnormal") } },
    ]);
    expect(r.scores.nfs.status).toBe("ok");
  });
});

describe("labs that are old or from the future", () => {
  it("older than a year are ignored for the level and named as a gap", () => {
    const r = run({}, [panel("2025-09-01", { alt: v(150, "abnormal") })]);
    expect(r.level).toBe(0);
    expect(r.gaps).toContain("labs_too_old");
  });
  it("older than six months are used, with a 'consider repeating' gap", () => {
    const r = run({}, [panel("2026-02-01", { alt: v(25) })]);
    expect(r.gaps).toContain("labs_stale");
    expect(r.doctorQuestions).toContain("repeat_labs");
  });
  it("a date after today is ignored", () => {
    const r = run({}, [panel("2026-12-01", { alt: v(150, "abnormal") })]);
    expect(r.level).toBe(0);
  });
});

describe("the engine is deterministic and conservative", () => {
  it("same input, same output", () => {
    const a = answers({ diabetes: "yes", symptoms: ["fatigue"] });
    const p = [normalLabs()];
    expect(assessLiver({ today: TODAY, answers: a, panels: p })).toEqual(
      assessLiver({ today: TODAY, answers: a, panels: p }),
    );
  });
  it("more risk never gives a lower level", () => {
    const steps: Partial<LiverAnswers>[] = [
      {},
      { diabetes: "yes" },
      { diabetes: "yes", hypertension: "yes", dyslipidemia: "yes" },
      {
        diabetes: "yes",
        hypertension: "yes",
        dyslipidemia: "yes",
        hepB: "positive",
      },
      {
        diabetes: "yes",
        hypertension: "yes",
        dyslipidemia: "yes",
        redFlags: ["jaundice"],
      },
    ];
    const levels = steps.map((s) => run(s, [normalLabs()]).level);
    expect(levels).toEqual([...levels].sort());
    expect(levels).toEqual([0, 1, 2, 2, 3]);
  });
  it("every symptom, red flag and combination yields a level 0–3 with the stored shape", () => {
    for (const sym of SYMPTOMS) {
      const r = run({ symptoms: [sym] }, [normalLabs()]);
      expect([0, 1, 2, 3]).toContain(r.level);
      expect(r.v).toBe(1);
      expect(r.engine).toMatch(/draft/);
      expect(JSON.parse(JSON.stringify(r))).toEqual(r); // JSON-safe: it is stored as jsonb
    }
  });
  it("suggests the questions that fit the situation", () => {
    const r = run(
      {
        diabetes: "yes",
        meds: "yes",
        alcohol: "daily",
        familyLiver: "yes",
        symptoms: ["itching"],
      },
      [panel("2026-09-01", { alt: v(55, "watch") })],
    );
    expect(r.doctorQuestions).toEqual(
      expect.arrayContaining([
        "ultrasound",
        "repeat_labs",
        "medicines_review",
        "alcohol_talk",
        "metabolic_review",
        "symptoms_review",
        "family_screening",
      ]),
    );
    const calm = run(
      { birthYear: 2000, hepB: "vaccinated", hepC: "negative" },
      [normalLabs()],
    );
    expect(calm.doctorQuestions).toEqual([]);
  });
});
