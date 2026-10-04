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
    });
    expect(assess(null, 95, "mg/dL")).toEqual({
      value_std: null,
      status: "unknown",
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
  it("keeps unknown tests without judging them", () => {
    const r = normalizeLabResult(
      raw([
        rawItem({
          name: "Mystery marker",
          marker_key: "",
          value: 3,
          unit: "u",
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
