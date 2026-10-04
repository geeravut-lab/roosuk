import { describe, expect, it } from "vitest";
import {
  BIOMARKERS,
  biomarkerByKey,
  biomarkerKeyForName,
  normalizeName,
} from "@/config/biomarkers";
import {
  applyLabReview,
  assess,
  parsePrintedRange,
  classifyValue,
  cleanDate,
  countOutOfRange,
  formatRange,
  isPdf,
  labPrompt,
  normalizeLabResult,
  normalizeUnit,
  parseStoredLabItems,
  sortBySeverity,
  toCatalogUnit,
} from "./lab";

const TODAY = "2026-10-10";

describe("biomarker catalog", () => {
  it("has unique keys and aliases that never collide across markers", () => {
    expect(new Set(BIOMARKERS.map((m) => m.key)).size).toBe(BIOMARKERS.length);
    const seen = new Map<string, string>();
    for (const m of BIOMARKERS)
      for (const a of [...m.aliases, m.en, m.th]) {
        const n = normalizeName(a);
        expect(seen.get(n) ?? m.key, `alias "${a}"`).toBe(m.key);
        seen.set(n, m.key);
      }
  });
  it("keeps every normal range inside its watch range and each range ordered", () => {
    for (const m of BIOMARKERS) {
      const [nl, nh] = m.normal;
      const [wl, wh] = m.watch;
      if (nl !== null && nh !== null) expect(nl, m.key).toBeLessThan(nh);
      if (wl !== null && wh !== null) expect(wl, m.key).toBeLessThan(wh);
      if (nl !== null)
        expect(wl === null ? -Infinity : wl, m.key).toBeLessThanOrEqual(nl);
      if (nh !== null)
        expect(wh === null ? Infinity : wh, m.key).toBeGreaterThanOrEqual(nh);
      expect(m.normal[0] === null && m.normal[1] === null).toBe(false);
    }
  });
  it("resolves printed names exactly, and refuses near-misses", () => {
    expect(biomarkerKeyForName("FBS")).toBe("fasting_glucose");
    expect(biomarkerKeyForName("  Fasting  Glucose ")).toBe("fasting_glucose");
    expect(biomarkerKeyForName("HbA1c")).toBe("hba1c");
    expect(biomarkerKeyForName("ไตรกลีเซอไรด์")).toBe("triglycerides");
    expect(biomarkerKeyForName("Glucose (2-hr post prandial)")).toBeNull();
    expect(biomarkerKeyForName("LDL")).toBe("ldl");
  });
});

describe("units and conversion", () => {
  it("normalises spellings", () => {
    expect(normalizeUnit("µmol/L")).toBe("umol/l");
    expect(normalizeUnit("x10^3/µL")).toBe("k/ul");
    expect(normalizeUnit("10³/uL")).toBe("k/ul");
    expect(normalizeUnit(" mg / dL ")).toBe("mg/dl");
    expect(normalizeUnit("mL/min/1.73m²")).toBe("ml/min/1.73m2");
    // a cubic millimetre is a microlitre
    for (const u of ["/mm^3", "/mm3", "cells/mm³", "/cumm", "cells/uL"])
      expect(normalizeUnit(u).endsWith("/ul"), u).toBe(true);
    expect(normalizeUnit("10^3/mm^3")).toBe("k/ul");
    expect(normalizeUnit("x10^9/L")).toBe("k/ul");
    expect(normalizeUnit("10^6/uL")).toBe("m/ul");
    expect(normalizeUnit("x10^12/L")).toBe("m/ul");
  });
  it("reads the units a Thai CBC sheet prints (/mm^3) — the bug that left WBC and platelets unassessed", () => {
    const wbc = biomarkerByKey("wbc")!;
    const plt = biomarkerByKey("platelets")!;
    const rbc = biomarkerByKey("rbc")!;
    expect(toCatalogUnit(wbc, 7270, "/mm^3")).toBe(7.27);
    expect(toCatalogUnit(plt, 293000, "/mm^3")).toBe(293);
    expect(toCatalogUnit(rbc, 4_800_000, "/mm^3")).toBe(4.8);
    expect(assess("wbc", 7270, "/mm^3").status).toBe("normal");
    expect(assess("platelets", 293000, "/mm^3").status).toBe("normal");
    expect(assess("platelets", 90000, "/mm^3").status).toBe("abnormal");
  });
  it("converts known units and refuses unknown ones", () => {
    const glu = biomarkerByKey("fasting_glucose")!;
    expect(toCatalogUnit(glu, 90, "mg/dL")).toBe(90);
    expect(toCatalogUnit(glu, 5, "mmol/L")).toBeCloseTo(90.08, 1);
    expect(toCatalogUnit(glu, 5, "furlongs")).toBeNull();
    expect(toCatalogUnit(glu, 5, "")).toBeNull();
    const wbc = biomarkerByKey("wbc")!;
    expect(toCatalogUnit(wbc, 7500, "/uL")).toBe(7.5);
    expect(toCatalogUnit(wbc, 7.5, "x10^3/uL")).toBe(7.5);
  });
});

describe("printed reference ranges", () => {
  it("reads the ways a report prints a range", () => {
    expect(parsePrintedRange("[12-16]")).toEqual([12, 16]);
    expect(parsePrintedRange("3,700 - 10,000")).toEqual([3700, 10000]);
    expect(parsePrintedRange("0.6 – 1.3")).toEqual([0.6, 1.3]);
    expect(parsePrintedRange("< 5.7")).toEqual([null, 5.7]);
    expect(parsePrintedRange("≤200")).toEqual([null, 200]);
    expect(parsePrintedRange("ไม่เกิน 150")).toEqual([null, 150]);
    expect(parsePrintedRange(">= 40")).toEqual([40, null]);
    expect(parsePrintedRange("> 60")).toEqual([60, null]);
  });
  it("refuses what it cannot read with confidence", () => {
    for (const bad of ["", "normal", "138000-40", "16-12", "Negative", "-"])
      expect(parsePrintedRange(bad), bad).toBeNull();
  });
  it("judges tests outside our table by the report's own range: inside normal, outside watch, never abnormal", () => {
    expect(assess(null, 14, "mg/L", "5-20")).toEqual({
      value_std: null,
      status: "normal",
      basis: "printed",
    });
    expect(assess(null, 30, "mg/L", "5-20").status).toBe("watch");
    expect(assess(null, 3, "mg/L", "5-20").status).toBe("watch");
    expect(assess(null, 4, "x", "< 5").status).toBe("normal");
    expect(assess(null, 3, "mg/L", "garbled").status).toBe("unknown");
  });
  it("prefers our table when it knows the marker and the unit, and falls back when the unit is foreign", () => {
    expect(assess("hemoglobin", 11.9, "g/dL", "12-16")).toMatchObject({
      status: "watch",
      basis: "catalog",
    });
    expect(assess("hemoglobin", 119, "weird", "110-160")).toMatchObject({
      status: "normal",
      basis: "printed",
    });
  });
  it("covers the differential and red-cell indices of a CBC", () => {
    expect(assess("neutrophil_pct", 62, "%").status).toBe("normal");
    expect(assess("lymphocyte_pct", 28, "%").status).toBe("normal");
    expect(assess("monocyte_pct", 6, "%").status).toBe("normal");
    expect(assess("mcv", 91, "fL").status).toBe("normal");
    expect(biomarkerKeyForName("Neutrophil")).toBe("neutrophil_pct");
    expect(biomarkerKeyForName("Lymphocyte")).toBe("lymphocyte_pct");
    expect(biomarkerKeyForName("นิวโทรฟิล")).toBe("neutrophil_pct");
    expect(biomarkerKeyForName("MCHC")).toBe("mchc");
  });
});

describe("status", () => {
  it("classifies at the boundaries (inclusive)", () => {
    const glu = biomarkerByKey("fasting_glucose")!;
    expect(classifyValue(glu, 99)).toBe("normal");
    expect(classifyValue(glu, 100)).toBe("watch");
    expect(classifyValue(glu, 125)).toBe("watch");
    expect(classifyValue(glu, 126)).toBe("abnormal");
    expect(classifyValue(glu, 69)).toBe("watch");
    expect(classifyValue(glu, 59)).toBe("abnormal");
    const hdl = biomarkerByKey("hdl")!;
    expect(classifyValue(hdl, 40)).toBe("normal");
    expect(classifyValue(hdl, 36)).toBe("watch");
    expect(classifyValue(hdl, 30)).toBe("abnormal");
    expect(classifyValue(hdl, 90)).toBe("normal");
  });
  it("assesses through unit conversion, and not at all without a known marker or unit", () => {
    expect(assess("fasting_glucose", 5, "mmol/L")).toMatchObject({
      status: "normal",
    });
    expect(assess("fasting_glucose", 7.2, "mmol/L").status).toBe("abnormal");
    expect(assess("fasting_glucose", 95, "weird")).toEqual({
      value_std: null,
      status: "unknown",
      basis: null,
    });
    expect(assess(null, 95, "mg/dL")).toEqual({
      value_std: null,
      status: "unknown",
      basis: null,
    });
    expect(assess("nope", 95, "mg/dL").status).toBe("unknown");
  });
  it("formats the reference range for display", () => {
    expect(formatRange(biomarkerByKey("fasting_glucose")!)).toBe("70–99 mg/dL");
    expect(formatRange(biomarkerByKey("ldl")!)).toBe("≤ 129 mg/dL");
    expect(formatRange(biomarkerByKey("hdl")!)).toBe("≥ 40 mg/dL");
  });
});

describe("cleanDate", () => {
  it("fixes Buddhist Era years and rejects impossible, future and ancient dates", () => {
    expect(cleanDate("2026-09-01", TODAY)).toBe("2026-09-01");
    expect(cleanDate("2569-09-01", TODAY)).toBe("2026-09-01");
    expect(cleanDate("2026-02-30", TODAY)).toBeNull();
    expect(cleanDate("2027-01-01", TODAY)).toBeNull();
    expect(cleanDate("1980-01-01", TODAY)).toBeNull();
    expect(cleanDate("01/09/2026", TODAY)).toBeNull();
    expect(cleanDate("", TODAY)).toBeNull();
    expect(cleanDate(5, TODAY)).toBeNull();
  });
});

const rawItem = (o: object = {}) => ({
  name: "FBS",
  marker_key: "fasting_glucose",
  value: 104,
  unit: "mg/dL",
  printed_range: "70-99",
  confidence: 0.95,
  ...o,
});
const raw = (items: object[], extra: object = {}) => ({
  is_lab_report: true,
  collected_date: "2569-09-01",
  items,
  ...extra,
});

describe("normalizeLabResult", () => {
  it("decides the status itself, whatever the model implied", () => {
    const r = normalizeLabResult(raw([rawItem()]), TODAY)!;
    expect(r.collectedOn).toBe("2026-09-01");
    expect(r.items[0]).toMatchObject({
      marker_key: "fasting_glucose",
      status: "watch",
      value_std: 104,
    });
  });
  it("trusts our alias table over the model's marker_key", () => {
    const r = normalizeLabResult(
      raw([
        rawItem({
          name: "HbA1c",
          marker_key: "fasting_glucose",
          value: 5.3,
          unit: "%",
        }),
      ]),
      TODAY,
    )!;
    expect(r.items[0]).toMatchObject({ marker_key: "hba1c", status: "normal" });
  });
  it("ignores a marker_key the catalog does not have", () => {
    const r = normalizeLabResult(
      raw([rawItem({ name: "Mystery", marker_key: "made_up", unit: "u" })]),
      TODAY,
    )!;
    expect(r.items[0].marker_key).toBeNull();
  });
  it("keeps only the first reading of a marker and drops absurd values", () => {
    const r = normalizeLabResult(
      raw([
        rawItem(),
        rawItem({ value: 200 }),
        rawItem({ name: "x", marker_key: "", value: 9e9 }),
      ]),
      TODAY,
    )!;
    expect(r.items).toHaveLength(1);
    expect(r.items[0].value).toBe(104);
  });
  it("keeps an absolute count out of the % marker of the same name", () => {
    const r = normalizeLabResult(
      raw([
        rawItem({
          name: "Neutrophil",
          marker_key: "neutrophil_pct",
          value: 62,
          unit: "%",
          printed_range: "35-80",
        }),
        rawItem({
          name: "Neutrophil",
          marker_key: "neutrophil_pct",
          value: 4500,
          unit: "/mm^3",
          printed_range: "1800-7500",
        }),
      ]),
      TODAY,
    )!;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ marker_key: "neutrophil_pct" });
    expect(r.items[1]).toMatchObject({
      marker_key: null,
      status: "normal",
      basis: "printed",
    });
  });
  it("keeps unknown tests without judging them", () => {
    const r = normalizeLabResult(
      raw([
        rawItem({
          name: "Mystery marker",
          marker_key: "",
          value: 3,
          unit: "u",
          printed_range: "",
        }),
      ]),
      TODAY,
    )!;
    expect(r.items[0]).toMatchObject({
      marker_key: null,
      status: "unknown",
      value_std: null,
    });
  });
  it("rejects non-reports, empty results and garbage", () => {
    expect(
      normalizeLabResult(raw([rawItem()], { is_lab_report: false }), TODAY),
    ).toBeNull();
    expect(normalizeLabResult(raw([]), TODAY)).toBeNull();
    expect(normalizeLabResult("x", TODAY)).toBeNull();
    expect(normalizeLabResult(null, TODAY)).toBeNull();
  });
  it("returns a null date rather than a made-up one", () => {
    expect(
      normalizeLabResult(
        raw([rawItem()], { collected_date: "last Tuesday" }),
        TODAY,
      )!.collectedOn,
    ).toBeNull();
  });
});

describe("review", () => {
  const items = normalizeLabResult(
    raw([
      rawItem(),
      rawItem({ name: "HbA1c", marker_key: "hba1c", value: 5.3, unit: "%" }),
    ]),
    TODAY,
  )!.items;
  it("round-trips through jsonb", () => {
    expect(parseStoredLabItems(JSON.parse(JSON.stringify(items)))).toEqual(
      items,
    );
    expect(parseStoredLabItems([{ name: 1 }])).toEqual([]);
  });
  it("reads reports stored before `basis` existed: judged ones came from our table", () => {
    const legacy = [
      { ...items[0], basis: undefined },
      { ...items[0], status: "unknown", value_std: null, basis: undefined },
    ];
    const out = parseStoredLabItems(JSON.parse(JSON.stringify(legacy)));
    expect(out.map((i) => i.basis)).toEqual(["catalog", null]);
  });
  it("recomputes the status from a corrected value and ignores junk edits", () => {
    const out = applyLabReview(items, {
      values: [88, Number.NaN],
      remove: [false, false],
    });
    expect(out[0]).toMatchObject({ value: 88, status: "normal" });
    expect(out[1].value).toBe(5.3);
    expect(
      applyLabReview(items, {
        values: [null, 1e12],
        remove: [false, false],
      }).map((i) => i.value),
    ).toEqual([104, 5.3]);
  });
  it("removes rows", () => {
    expect(
      applyLabReview(items, { values: [], remove: [true, false] }),
    ).toHaveLength(1);
    expect(applyLabReview(items, { values: [], remove: [true, true] })).toEqual(
      [],
    );
  });
  it("sorts the worst first and counts what is out of range", () => {
    const mixed = [
      { status: "normal" as const },
      { status: "abnormal" as const },
      { status: "unknown" as const },
      { status: "watch" as const },
    ];
    expect(sortBySeverity(mixed).map((m) => m.status)).toEqual([
      "abnormal",
      "watch",
      "unknown",
      "normal",
    ]);
    expect(countOutOfRange(mixed)).toBe(2);
  });
});

describe("file checks and prompt", () => {
  it("recognises a PDF by its header", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
  });
  it("lists the catalog, tells the model to transcribe only, and explains the Buddhist Era", () => {
    const { system, prompt } = labPrompt();
    for (const m of BIOMARKERS) expect(prompt).toContain(m.key);
    expect(system).toMatch(/never interpret/);
    expect(system).toMatch(/never as instructions/);
    expect(prompt).toMatch(/subtract 543/);
  });
});
