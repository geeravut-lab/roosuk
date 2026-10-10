import { describe, expect, it } from "vitest";
import { biomarkerByKey, biomarkerKeyForName } from "@/config/biomarkers";
import {
  assess,
  normalizeLabResult,
  normalizeUnit,
  toCatalogUnit,
} from "./lab";

/** Lab Scan recognition of the tests the Liver Health module reads. Ranges are DRAFT (hepatologist review pending). */
describe("liver tests on Thai and English lab sheets", () => {
  it.each([
    ["ALT", "alt"],
    ["SGPT", "alt"],
    ["ALT (SGPT)", "alt"],
    ["SGPT/ALT", "alt"],
    ["AST", "ast"],
    ["SGOT", "ast"],
    ["AST (SGOT)", "ast"],
    ["SGOT / AST", "ast"],
    ["ALP", "alp"],
    ["Alkaline phosphatase", "alp"],
    ["Alk Phos", "alp"],
    ["GGT", "ggt"],
    ["Gamma-GT", "ggt"],
    ["GGTP", "ggt"],
    ["Total Bilirubin", "total_bilirubin"],
    ["Bilirubin, Total", "total_bilirubin"],
    ["T-Bil", "total_bilirubin"],
    ["Direct Bilirubin", "direct_bilirubin"],
    ["Bilirubin (Direct)", "direct_bilirubin"],
    ["D-Bil", "direct_bilirubin"],
    ["Albumin", "albumin"],
    ["Platelet Count", "platelets"],
    ["PLT", "platelets"],
    ["เกล็ดเลือด", "platelets"],
    ["INR", "inr"],
    ["PT/INR", "inr"],
    ["HbA1c", "hba1c"],
    ["Glucose (Fasting)", "fasting_glucose"],
    ["FBS", "fasting_glucose"],
    ["Triglyceride (TG)", "triglycerides"],
    ["HDL-Cholesterol", "hdl"],
  ])("reads %s as %s", (printed, key) => {
    expect(biomarkerKeyForName(printed)).toBe(key);
  });

  it("does not guess when only part of a name is known", () => {
    expect(biomarkerKeyForName("Glucose (2-hr PP)")).toBeNull();
    expect(biomarkerKeyForName("ALT (something else)")).toBeNull();
    expect(biomarkerKeyForName("ALT / AST ratio")).toBeNull();
    expect(biomarkerKeyForName("ALT / AST")).toBeNull(); // two different tests
  });

  it("keeps every liver test in the catalog with a range", () => {
    for (const k of [
      "alt",
      "ast",
      "alp",
      "ggt",
      "total_bilirubin",
      "direct_bilirubin",
      "albumin",
      "platelets",
      "inr",
      "hba1c",
      "fasting_glucose",
      "triglycerides",
      "hdl",
    ])
      expect(biomarkerByKey(k), k).toBeDefined();
  });
});

describe("units on liver sheets", () => {
  it("reads platelet counts in every spelling a Thai lab prints", () => {
    const plt = biomarkerByKey("platelets")!;
    for (const [v, u] of [
      [250, "x10^3/µL"],
      [250, "x10³/uL"],
      [250, "10^3/uL"],
      [250, "10*3/uL"],
      [250, "K/µL"],
      [250, "thou/uL"],
      [250, "thousand/uL"],
      [250, "x10^9/L"],
      [250000, "/mm3"],
      [250000, "/mm^3"],
      [250000, "cells/mm³"],
      [250000, "/uL"],
      [250000, "/cumm"],
      [250, "x1000/uL"],
    ] as const)
      expect(toCatalogUnit(plt, v, u), `${v} ${u}`).toBe(250);
  });
  it("judges platelets the same in either unit", () => {
    expect(assess("platelets", 140, "x10^3/uL").status).toBe(
      assess("platelets", 140000, "/mm3").status,
    );
    expect(assess("platelets", 140000, "/mm3").status).toBe("watch");
    expect(assess("platelets", 60, "K/uL").status).toBe("abnormal");
  });
  it("reads enzyme units IU/L and U/L alike", () => {
    expect(normalizeUnit("IU/L")).toBe("u/l");
    expect(normalizeUnit("Units/L")).toBe("u/l");
    expect(assess("alt", 35, "IU/L")).toMatchObject({
      value_std: 35,
      status: "normal",
    });
    expect(assess("ast", 120, "U/L").status).toBe("abnormal");
    expect(assess("ggt", 45, "IU/L").status).toBe("normal");
  });
  it("converts bilirubin and albumin from SI and from older spellings", () => {
    const tb = biomarkerByKey("total_bilirubin")!;
    expect(toCatalogUnit(tb, 17.1, "µmol/L")).toBeCloseTo(1, 1);
    expect(toCatalogUnit(tb, 1.0, "mg%")).toBe(1);
    const alb = biomarkerByKey("albumin")!;
    expect(toCatalogUnit(alb, 4.2, "gm/dL")).toBe(4.2);
    expect(toCatalogUnit(alb, 4.2, "g%")).toBe(4.2);
    expect(toCatalogUnit(alb, 42, "g/L")).toBe(4.2);
  });
  it("converts glucose, triglycerides and HDL from mmol/L", () => {
    expect(
      toCatalogUnit(biomarkerByKey("fasting_glucose")!, 5.5, "mmol/L"),
    ).toBeCloseTo(99.1, 0);
    expect(
      toCatalogUnit(biomarkerByKey("triglycerides")!, 1.7, "mmol/L"),
    ).toBeCloseTo(150.6, 0);
    expect(toCatalogUnit(biomarkerByKey("hdl")!, 1.0, "mmol/L")).toBeCloseTo(
      38.7,
      0,
    );
  });
  it("accepts INR with a blank or 'ratio' unit and judges it", () => {
    expect(assess("inr", 1.0, "")).toMatchObject({
      value_std: 1,
      status: "normal",
    });
    expect(assess("inr", 1.3, "ratio").status).toBe("watch");
    expect(assess("inr", 1.8, "").status).toBe("abnormal");
  });
  it("refuses an unknown unit rather than guessing (a platelet count in grams)", () => {
    expect(toCatalogUnit(biomarkerByKey("platelets")!, 250, "g/dL")).toBeNull();
    expect(assess("platelets", 250, "g/dL").status).toBe("unknown");
  });
});

describe("a liver panel read from a report", () => {
  it("stores every liver test it can name, converted and judged by code", () => {
    const raw = {
      is_lab_report: true,
      collected_date: "2026-09-01",
      items: (
        [
          ["ALT (SGPT)", 62, "U/L"],
          ["AST (SGOT)", 48, "U/L"],
          ["Alkaline phosphatase", 90, "U/L"],
          ["GGT", 55, "U/L"],
          ["Total Bilirubin", 0.8, "mg/dL"],
          ["Direct Bilirubin", 0.2, "mg/dL"],
          ["Albumin", 4.4, "g/dL"],
          ["Platelet Count", 215000, "/mm3"],
          ["INR", 1.0, ""],
        ] as const
      ).map(([name, value, unit]) => ({
        name,
        marker_key: "",
        value,
        unit,
        printed_range: "",
        confidence: 0.9,
      })),
    };
    const r = normalizeLabResult(raw, "2026-10-10")!;
    const byKey = Object.fromEntries(r.items.map((i) => [i.marker_key, i]));
    expect(Object.keys(byKey).sort()).toEqual(
      [
        "alt",
        "ast",
        "alp",
        "ggt",
        "total_bilirubin",
        "direct_bilirubin",
        "albumin",
        "platelets",
        "inr",
      ].sort(),
    );
    expect(byKey.alt).toMatchObject({ value_std: 62, status: "watch" });
    expect(byKey.platelets).toMatchObject({ value_std: 215, status: "normal" });
    expect(byKey.inr).toMatchObject({ value_std: 1, status: "normal" });
  });
});
