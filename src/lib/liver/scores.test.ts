import { describe, expect, it } from "vitest";
import { apri, bmiOf, CUTOFFS, fib4, fli, nfs } from "./scores";

const ok = (r: ReturnType<typeof fib4>) => {
  if (r.status !== "ok") throw new Error(`expected a score, got ${r.status}`);
  return r;
};

describe("FIB-4 = age × AST / (platelets × √ALT)", () => {
  // ALT 100 → √ALT = 10, platelets 200 → value = age × AST / 2000
  const at = (age: number, ast: number, alt = 100, platelets = 200) =>
    fib4({ age, ast, alt, platelets });

  it("computes the textbook value", () => {
    const r = ok(fib4({ age: 50, ast: 40, alt: 40, platelets: 250 }));
    expect(r.value).toBe(1.26); // 2000 / (250 × 6.3246)
  });

  it("<1.3 is low, 1.3 to 2.67 is intermediate, >2.67 is high (🔒 cut-offs)", () => {
    expect(CUTOFFS.fib4).toMatchObject({ low: 1.3, high: 2.67, lowAge65: 2.0 });
    expect(ok(at(40, 64.5))).toMatchObject({ value: 1.29, band: "low" });
    expect(ok(at(40, 65))).toMatchObject({ value: 1.3, band: "intermediate" });
    expect(ok(at(40, 133.5))).toMatchObject({
      value: 2.67,
      band: "intermediate",
    });
    expect(ok(at(40, 134))).toMatchObject({ value: 2.68, band: "high" });
  });

  it("from age 65 the low cut-off is 2.0", () => {
    // 1.3 is intermediate at 40 but low at 65 and over
    expect(ok(at(64, 65)).band).toBe("intermediate");
    expect(ok(at(65, 40))).toMatchObject({ value: 1.3, band: "low" });
    expect(ok(at(65, 40)).ageNote).toBe("over65");
    expect(ok(at(64, 40)).ageNote).toBeUndefined();
    expect(ok(at(70, 39, 100, 140))).toMatchObject({
      value: 1.95,
      band: "low",
    });
    expect(ok(at(70, 40, 100, 140))).toMatchObject({
      value: 2,
      band: "intermediate",
    });
    // the high cut-off does not move with age
    expect(ok(at(80, 134)).band).toBe("high");
  });

  it("bands the number that is shown (rounded to 2 decimals), never a hidden one", () => {
    // 1.2996… is shown as 1.30 and must read as 1.30, not as "low"
    const r = ok(fib4({ age: 40, ast: 64.98, alt: 100, platelets: 200 }));
    expect(r.value).toBe(1.3);
    expect(r.band).toBe("intermediate");
  });

  it("notes that under 35 it is less reliable, and refuses to compute for children", () => {
    expect(ok(at(30, 40)).ageNote).toBe("under35");
    expect(ok(at(35, 40)).ageNote).toBeUndefined();
    expect(at(17, 40)).toEqual({ status: "invalid", fields: ["age"] });
    expect(at(111, 40)).toEqual({ status: "invalid", fields: ["age"] });
  });

  it("is 'insufficient', not a fake number, when an input is missing", () => {
    expect(fib4({ age: 50, ast: 40, alt: 40, platelets: null })).toEqual({
      status: "insufficient",
      missing: ["platelets"],
    });
    expect(
      fib4({ age: null, ast: undefined, alt: 40, platelets: null }),
    ).toEqual({ status: "insufficient", missing: ["age", "ast", "platelets"] });
  });

  it("refuses implausible inputs (a platelet count read in the wrong unit, a zero)", () => {
    expect(fib4({ age: 50, ast: 40, alt: 40, platelets: 250000 })).toEqual({
      status: "invalid",
      fields: ["platelets"],
    });
    expect(fib4({ age: 50, ast: 40, alt: 0, platelets: 250 }).status).toBe(
      "invalid",
    );
    expect(fib4({ age: 50, ast: 40, alt: 40, platelets: 0 }).status).toBe(
      "invalid",
    );
    expect(fib4({ age: 50, ast: NaN, alt: 40, platelets: 250 }).status).toBe(
      "insufficient",
    );
    expect(
      fib4({ age: 50, ast: 40, alt: 40, platelets: Infinity }).status,
    ).toBe("insufficient"); // not a finite number is "no number"
  });
});

describe("APRI = (AST / 40) / platelets × 100", () => {
  it("<0.5 low, 0.5 to 1.5 intermediate, >1.5 high (🔒)", () => {
    expect(apri({ ast: 39, platelets: 200 })).toMatchObject({
      value: 0.49,
      band: "low",
    });
    expect(apri({ ast: 40, platelets: 200 })).toMatchObject({
      value: 0.5,
      band: "intermediate",
    });
    expect(apri({ ast: 60, platelets: 100 })).toMatchObject({
      value: 1.5,
      band: "intermediate",
    });
    expect(apri({ ast: 61, platelets: 100 })).toMatchObject({
      value: 1.53,
      band: "high",
    });
  });
  it("needs AST and platelets", () => {
    expect(apri({ ast: 40, platelets: null })).toEqual({
      status: "insufficient",
      missing: ["platelets"],
    });
    expect(apri({ ast: 40, platelets: 2500 }).status).toBe("invalid");
  });
});

describe("NAFLD fibrosis score", () => {
  const base = {
    age: 55,
    bmi: 30,
    glucoseOrDiabetes: true,
    ast: 45,
    alt: 50,
    platelets: 220,
    albumin: 4.2,
  };
  it("follows the published formula", () => {
    const expected =
      -1.675 +
      0.037 * 55 +
      0.094 * 30 +
      1.13 +
      0.99 * (45 / 50) -
      0.013 * 220 -
      0.66 * 4.2;
    const r = nfs(base);
    expect(r.status === "ok" && r.value).toBeCloseTo(expected, 2);
  });
  it("bands at -1.455 and 0.676, and from 65 the low cut-off is 0.12", () => {
    const r = nfs({ ...base, platelets: 100 }); // low platelets push it up
    expect(r.status === "ok" && r.band).toBe("high");
    const low = nfs({
      ...base,
      bmi: 20,
      glucoseOrDiabetes: false,
      albumin: 4.8,
    });
    expect(low.status === "ok" && low.band).toBe("low");
    const old = nfs({ ...base, age: 70, bmi: 22, glucoseOrDiabetes: false });
    const young = nfs({ ...base, age: 40, bmi: 22, glucoseOrDiabetes: false });
    expect(old.status === "ok" && old.value).toBeGreaterThan(
      young.status === "ok" ? young.value : 0,
    );
  });
  it("is insufficient without a yes/no on diabetes, BMI or albumin", () => {
    expect(nfs({ ...base, glucoseOrDiabetes: null })).toEqual({
      status: "insufficient",
      missing: ["glucoseOrDiabetes"],
    });
    expect(nfs({ ...base, bmi: null, albumin: undefined })).toEqual({
      status: "insufficient",
      missing: ["bmi", "albumin"],
    });
  });
});

describe("Fatty Liver Index", () => {
  it("follows the published formula", () => {
    const y =
      0.953 * Math.log(150) +
      0.139 * 28 +
      0.718 * Math.log(50) +
      0.053 * 95 -
      15.745;
    const expected = Math.round((Math.exp(y) / (1 + Math.exp(y))) * 100);
    const r = fli({ triglycerides: 150, bmi: 28, ggt: 50, waist: 95 });
    expect(r).toMatchObject({ status: "ok", value: expected, band: "high" });
  });
  it("bands <30 low, 30 to <60 intermediate, ≥60 high", () => {
    const low = fli({ triglycerides: 70, bmi: 21, ggt: 15, waist: 70 });
    expect(low.status === "ok" && low.band).toBe("low");
    const mid = fli({ triglycerides: 120, bmi: 25, ggt: 30, waist: 85 });
    expect(mid.status === "ok" && mid.band).toBe("intermediate");
  });
  it("needs triglycerides, BMI, GGT and waist", () => {
    expect(fli({ triglycerides: 150, bmi: 28, ggt: 50, waist: null })).toEqual({
      status: "insufficient",
      missing: ["waist"],
    });
  });
});

describe("BMI", () => {
  it("is weight over height squared, to one decimal", () => {
    expect(bmiOf(170, 70)).toBe(24.2);
    expect(bmiOf(160, 45)).toBe(17.6);
  });
  it("is null for missing or implausible input", () => {
    expect(bmiOf(null, 70)).toBeNull();
    expect(bmiOf(170, undefined)).toBeNull();
    expect(bmiOf(17, 70)).toBeNull(); // metres typed as centimetres
    expect(bmiOf(170, 7)).toBeNull();
  });
});
