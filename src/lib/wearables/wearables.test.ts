import { describe, expect, it } from "vitest";
import { AppleHealthAggregator, aggregateAppleXml } from "./apple";
import { parseObservationCsv } from "./csv";
import {
  MAX_BATCH,
  normalizeBatch,
  normalizeObservation,
  parseBearer,
  tierAllows,
} from "./types";

const now = new Date("2026-10-20T05:00:00Z");

describe("tierAllows", () => {
  it("none stores nothing, basic the everyday types, full everything", () => {
    expect(tierAllows("none", "steps")).toBe(false);
    expect(tierAllows("basic", "steps")).toBe(true);
    expect(tierAllows("basic", "sleep_minutes")).toBe(true);
    expect(tierAllows("basic", "bp_systolic")).toBe(false);
    expect(tierAllows("basic", "weight_kg")).toBe(false);
    expect(tierAllows("full", "blood_glucose")).toBe(true);
  });
});

describe("normalizeObservation", () => {
  const ok = { type: "steps", value: 8000, start: "2026-10-19" };
  it("turns a plain day into the start of that day in Bangkok and fixes the unit", () => {
    const r = normalizeObservation(ok, "csv", "basic", now);
    expect(r).toMatchObject({
      ok: true,
      row: {
        unit: "count",
        start_at: "2026-10-18T17:00:00.000Z",
        source: "csv",
        external_id: "steps:2026-10-18T17:00:00.000Z",
      },
    });
  });
  it("turns away what it should, each for its own reason", () => {
    const reason = (raw: unknown, tier: "basic" | "full" = "basic") => {
      const r = normalizeObservation(raw, "api", tier, now);
      return r.ok ? "ok" : r.reason;
    };
    expect(reason({ ...ok, type: "mood" })).toBe("type");
    expect(reason({ ...ok, type: "bp_systolic", value: 120 })).toBe("plan");
    expect(reason({ ...ok, value: -1 })).toBe("range");
    expect(reason({ ...ok, value: 1e9 })).toBe("range");
    expect(reason({ ...ok, value: Number.NaN })).toBe("shape");
    expect(reason({ ...ok, start: "last tuesday!" })).toBe("date");
    expect(reason({ ...ok, start: "2026-12-31" })).toBe("future");
    expect(reason({ ...ok, start: "2015-01-01" })).toBe("old");
    expect(reason({ ...ok, end: "2026-10-18" })).toBe("date"); // ends before it starts
    expect(reason("nope")).toBe("shape");
    expect(reason({ ...ok, type: "bp_systolic", value: 120 }, "full")).toBe(
      "ok",
    );
  });
});

describe("normalizeBatch", () => {
  it("counts accepted and rejected, drops repeats in one batch, and caps the size", () => {
    const rows = [
      { type: "steps", value: 1, start: "2026-10-01", external_id: "a" },
      { type: "steps", value: 2, start: "2026-10-01", external_id: "a" },
      { type: "steps", value: -5, start: "2026-10-01" },
      { type: "weight_kg", value: 60, start: "2026-10-01" },
    ];
    const r = normalizeBatch(rows, "api", "basic", now);
    expect(r.rows).toHaveLength(1);
    expect(r.result).toEqual({
      accepted: 1,
      rejected: 2,
      reasons: { range: 1, plan: 1 },
    });
    const big = Array.from({ length: MAX_BATCH + 5 }, (_, i) => ({
      type: "steps",
      value: 1,
      start: "2026-10-01",
      external_id: `x${i}`,
    }));
    const b = normalizeBatch(big, "api", "basic", now);
    expect(b.result.accepted).toBe(MAX_BATCH);
    expect(b.result.rejected).toBe(5);
  });
});

describe("parseBearer", () => {
  it("accepts only the token shape we issue", () => {
    const t = "a".repeat(43);
    expect(parseBearer(`Bearer rsk_${t}`)).toBe(t);
    for (const bad of [
      null,
      "",
      `Bearer ${t}`,
      `bearer rsk_${t}`,
      `Bearer rsk_${t}x`,
      "Bearer rsk_short",
    ])
      expect(parseBearer(bad)).toBeNull();
  });
});

const rec = (
  type: string,
  source: string,
  start: string,
  end: string,
  value: string,
  unit = "count",
) =>
  `<Record type="${type}" sourceName="${source}" unit="${unit}" creationDate="${start}" startDate="${start}" endDate="${end}" value="${value}"/>`;
const STEP = "HKQuantityTypeIdentifierStepCount";

describe("Apple Health aggregation", () => {
  it("sums steps per source and takes the larger source (phone and watch overlap)", () => {
    const xml = [
      `<?xml version="1.0"?><HealthData>`,
      rec(
        STEP,
        "iPhone",
        "2026-10-01 08:00:00 +0700",
        "2026-10-01 08:10:00 +0700",
        "1000",
      ),
      rec(
        STEP,
        "iPhone",
        "2026-10-01 12:00:00 +0700",
        "2026-10-01 12:10:00 +0700",
        "2000",
      ),
      rec(
        STEP,
        "Watch",
        "2026-10-01 08:00:00 +0700",
        "2026-10-01 08:10:00 +0700",
        "2800",
      ),
      rec(
        STEP,
        "iPhone",
        "2026-10-02 09:00:00 +0700",
        "2026-10-02 09:10:00 +0700",
        "500",
      ),
      `</HealthData>`,
    ].join("\n");
    expect(aggregateAppleXml(xml, "2026-09-01")).toEqual([
      {
        type: "steps",
        value: 3000,
        start: "2026-10-01",
        device: "Apple Health",
        external_id: "steps:2026-10-01",
      },
      {
        type: "steps",
        value: 500,
        start: "2026-10-02",
        device: "Apple Health",
        external_id: "steps:2026-10-02",
      },
    ]);
  });

  it("averages heart rate, converts units, and counts only real sleep on the day you woke", () => {
    const xml = [
      rec(
        "HKQuantityTypeIdentifierHeartRate",
        "Watch",
        "2026-10-01 10:00:00 +0700",
        "2026-10-01 10:00:00 +0700",
        "60",
        "count/min",
      ),
      rec(
        "HKQuantityTypeIdentifierHeartRate",
        "Watch",
        "2026-10-01 11:00:00 +0700",
        "2026-10-01 11:00:00 +0700",
        "80",
        "count/min",
      ),
      rec(
        "HKQuantityTypeIdentifierBodyMass",
        "Scale",
        "2026-10-01 07:00:00 +0700",
        "2026-10-01 07:00:00 +0700",
        "132.3",
        "lb",
      ),
      rec(
        "HKQuantityTypeIdentifierOxygenSaturation",
        "Watch",
        "2026-10-01 07:00:00 +0700",
        "2026-10-01 07:00:00 +0700",
        "0.97",
        "%",
      ),
      rec(
        "HKQuantityTypeIdentifierBloodGlucose",
        "Meter",
        "2026-10-01 07:00:00 +0700",
        "2026-10-01 07:00:00 +0700",
        "5",
        "mmol<L>",
      ),
      rec(
        "HKCategoryTypeIdentifierSleepAnalysis",
        "Watch",
        "2026-09-30 23:00:00 +0700",
        "2026-10-01 03:00:00 +0700",
        "HKCategoryValueSleepAnalysisAsleepCore",
        "",
      ),
      rec(
        "HKCategoryTypeIdentifierSleepAnalysis",
        "Watch",
        "2026-10-01 03:00:00 +0700",
        "2026-10-01 06:30:00 +0700",
        "HKCategoryValueSleepAnalysisAsleepREM",
        "",
      ),
      rec(
        "HKCategoryTypeIdentifierSleepAnalysis",
        "Watch",
        "2026-10-01 06:30:00 +0700",
        "2026-10-01 07:00:00 +0700",
        "HKCategoryValueSleepAnalysisAwake",
        "",
      ),
    ].join("\n");
    const by = Object.fromEntries(
      aggregateAppleXml(xml, "2026-09-01").map((r) => [r.type, r.value]),
    );
    expect(by.heart_rate).toBe(70);
    expect(by.weight_kg).toBeCloseTo(60, 1);
    expect(by.spo2).toBe(97);
    expect(by.blood_glucose).toBeCloseTo(90.08, 2);
    expect(by.sleep_minutes).toBe(450); // 4 h + 3.5 h asleep, the awake half hour not counted
  });

  it("skips days before the window and records of types it does not use", () => {
    const xml = [
      rec(
        STEP,
        "iPhone",
        "2025-01-01 08:00:00 +0700",
        "2025-01-01 08:10:00 +0700",
        "999",
      ),
      rec(
        "HKQuantityTypeIdentifierActiveEnergyBurned",
        "Watch",
        "2026-10-01 08:00:00 +0700",
        "2026-10-01 08:10:00 +0700",
        "300",
        "kcal",
      ),
    ].join("\n");
    expect(aggregateAppleXml(xml, "2026-01-01")).toEqual([]);
  });

  it("gives the same answer however the file is cut into chunks", () => {
    const xml = [
      rec(
        STEP,
        "iPhone",
        "2026-10-01 08:00:00 +0700",
        "2026-10-01 08:10:00 +0700",
        "1000",
      ),
      rec(
        STEP,
        "iPhone",
        "2026-10-01 09:00:00 +0700",
        "2026-10-01 09:10:00 +0700",
        "234",
      ),
    ].join("\n");
    const whole = aggregateAppleXml(xml, "2026-01-01");
    for (const size of [1, 7, 50, 1000]) {
      const agg = new AppleHealthAggregator("2026-01-01");
      for (let i = 0; i < xml.length; i += size)
        agg.push(xml.slice(i, i + size));
      expect(agg.finish()).toEqual(whole);
    }
    expect(whole[0].value).toBe(1234);
  });
});

describe("parseObservationCsv", () => {
  it("reads date,type,value (any column order, quotes, BOM, Windows line ends) and skips bad rows", () => {
    const r = parseObservationCsv(
      '﻿value,Date,TYPE,unit\r\n8200,2026-10-01,steps,count\r\n"62",2026-10-01,resting_heart_rate,bpm\r\nabc,2026-10-01,steps,\r\n5,2026-10-01,mood,\r\n',
    );
    expect(r).toEqual({
      ok: true,
      skipped: 2,
      rows: [
        {
          type: "steps",
          value: 8200,
          start: "2026-10-01",
          device: "CSV",
          external_id: "steps:2026-10-01",
        },
        {
          type: "resting_heart_rate",
          value: 62,
          start: "2026-10-01",
          device: "CSV",
          external_id: "resting_heart_rate:2026-10-01",
        },
      ],
    });
  });
  it("refuses a file without the three columns, an empty one, and a huge one", () => {
    expect(parseObservationCsv("a,b\n1,2")).toEqual({
      ok: false,
      reason: "header",
    });
    expect(parseObservationCsv("  \n")).toEqual({ ok: false, reason: "empty" });
    const many = "date,type,value\n" + "2026-10-01,steps,1\n".repeat(5001);
    expect(parseObservationCsv(many)).toEqual({
      ok: false,
      reason: "too_many",
    });
  });
});
