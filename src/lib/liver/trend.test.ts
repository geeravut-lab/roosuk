import { describe, expect, it } from "vitest";
import { buildLiverBrief, briefSchema, parseStoredBrief } from "./brief";
import { assessLiver } from "./engine";
import type { LiverAnswers } from "./questionnaire";
import {
  fib4Series,
  latestLabs,
  toPanels,
  trendNotes,
  trendableLiver,
  type LiverLabRow,
} from "./trend";

const row = (
  marker_key: string | null,
  value_std: number | string | null,
  collected_on: string,
  status: LiverLabRow["status"] = "normal",
): LiverLabRow => ({ marker_key, value_std, status, collected_on });

// newest first, as the loaders return them
const rows: LiverLabRow[] = [
  row("alt", 90, "2026-09-01", "abnormal"),
  row("ast", 60, "2026-09-01", "watch"),
  row("platelets", "180", "2026-09-01"),
  row("alt", 55, "2026-06-01", "watch"),
  row("ast", 38, "2026-06-01"),
  row("platelets", 200, "2026-06-01"),
  row("alt", 40, "2026-03-01"),
  row("alt", 35, "2026-03-01"), // an older duplicate on the same day: the first row wins
  row("albumin", 4.2, "2026-03-01"),
  row("cholesterol_made_up", 5, "2026-03-01"),
  row(null, 7, "2026-03-01"),
  row("ggt", null, "2026-03-01"), // could not be converted: never drawn
];

describe("toPanels", () => {
  it("groups liver tests by day, newest day first, one value per test per day", () => {
    const p = toPanels(rows);
    expect(p.map((x) => x.date)).toEqual([
      "2026-09-01",
      "2026-06-01",
      "2026-03-01",
    ]);
    expect(p[0].values).toEqual({
      alt: { value: 90, status: "abnormal" },
      ast: { value: 60, status: "watch" },
      platelets: { value: 180, status: "normal" },
    });
    expect(p[2].values.alt).toEqual({ value: 40, status: "normal" });
    expect(p[2].values.albumin).toBeDefined();
    expect(p[2].values).not.toHaveProperty("ggt");
    expect(JSON.stringify(p)).not.toContain("made_up");
  });
});

describe("latestLabs", () => {
  it("lists the newest value of each test in the design's order, with its unit", () => {
    const l = latestLabs(toPanels(rows));
    expect(l.map((x) => x.marker)).toEqual([
      "alt",
      "ast",
      "albumin",
      "platelets",
    ]);
    expect(l[0]).toMatchObject({ value: 90, date: "2026-09-01", unit: "U/L" });
    expect(l[2]).toMatchObject({ marker: "albumin", date: "2026-03-01" });
  });
});

describe("trends", () => {
  it("only tests with two days of results are trendable", () => {
    expect(trendableLiver(rows)).toEqual(["alt", "ast", "platelets"]);
  });
  it("notes a rise that ends outside the range, without naming a cause", () => {
    const n = trendNotes(rows);
    expect(n).toContainEqual({ marker: "alt", kind: "rising" });
    expect(n.find((x) => x.marker === "platelets")).toBeUndefined();
  });
  it("notes a fall in platelets or albumin that ends outside the range", () => {
    const n = trendNotes([
      row("platelets", 100, "2026-09-01", "watch"),
      row("platelets", 130, "2026-06-01"),
      row("platelets", 160, "2026-03-01"),
    ]);
    expect(n).toEqual([{ marker: "platelets", kind: "falling" }]);
  });
  it("notes results outside the range on consecutive days", () => {
    const n = trendNotes([
      row("ggt", 70, "2026-09-01", "watch"),
      row("ggt", 72, "2026-06-01", "watch"),
    ]);
    expect(n).toEqual([{ marker: "ggt", kind: "persistent" }]);
  });
  it("says nothing about steady normal values or a single result", () => {
    expect(
      trendNotes([row("alt", 30, "2026-09-01"), row("alt", 31, "2026-06-01")]),
    ).toEqual([]);
    expect(trendNotes([row("alt", 90, "2026-09-01", "abnormal")])).toEqual([]);
  });
  it("FIB-4 over time uses the age on each day and skips days without all three", () => {
    const s = fib4Series(toPanels(rows), 1976);
    expect(s.map((p) => p.date)).toEqual(["2026-06-01", "2026-09-01"]);
    expect(s[1].value).toBeGreaterThan(s[0].value ?? 0);
    expect(fib4Series(toPanels(rows), null)).toEqual([]);
  });
});

describe("the doctor brief", () => {
  const answers: LiverAnswers = {
    redFlags: [],
    birthYear: 1976,
    sex: "male",
    heightCm: 172,
    weightKg: 80,
    waistCm: 96,
    diabetes: "yes",
    hypertension: "no",
    dyslipidemia: "no",
    history: [],
    familyLiver: "no",
    hepB: "never_tested",
    hepC: "negative",
    alcohol: "weekly",
    meds: "yes",
    symptoms: ["fatigue"],
  };
  const panels = toPanels(rows);
  const result = assessLiver({ today: "2026-10-10", answers, panels });
  const brief = buildLiverBrief({
    assessment: { created_on: "2026-10-10", result, answers },
    panels,
    rows,
    birthYear: 1976,
  });

  it("holds the assessment, the latest values, the trends, FIB-4 and questions", () => {
    expect(brief.assessedOn).toBe("2026-10-10");
    expect(brief.result?.level).toBe(2);
    expect(brief.labs.length).toBe(4);
    expect(brief.trends.map((t) => t.marker)).toEqual([
      "alt",
      "ast",
      "platelets",
    ]);
    expect(brief.fib4Trend.length).toBe(2);
    expect(brief.trendNotes.length).toBeGreaterThan(0);
    expect(brief.questions).toEqual(
      expect.arrayContaining(["ultrasound", "medicines_review", "repeat_labs"]),
    );
    expect(brief.answers).toMatchObject({ meds: "yes", symptoms: ["fatigue"] });
  });
  it("carries the medicine question as a yes/no flag only — never a name", () => {
    expect(JSON.stringify(brief)).not.toMatch(/medicine_name|drug|herb_name/i);
    expect(Object.keys(brief.answers ?? {})).not.toContain("medsList");
  });
  it("survives JSON storage and validates when read back", () => {
    const stored = JSON.parse(JSON.stringify(brief));
    expect(briefSchema.safeParse(stored).success).toBe(true);
    expect(parseStoredBrief(stored)?.result?.level).toBe(2);
    expect(parseStoredBrief({ v: 1, junk: true })).toBeNull();
    expect(parseStoredBrief(null)).toBeNull();
  });
  it("without an assessment it still lists the labs and suggests the baseline questions", () => {
    const b = buildLiverBrief({
      assessment: null,
      panels,
      rows,
      birthYear: null,
    });
    expect(b.result).toBeNull();
    expect(b.labs.length).toBe(4);
    expect(b.questions).toEqual([
      "ultrasound",
      "hepatitis_tests",
      "repeat_labs",
    ]);
    expect(b.fib4Trend).toEqual([]);
    expect(parseStoredBrief(JSON.parse(JSON.stringify(b)))).not.toBeNull();
  });
  it("keeps at most 12 points per trend", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row(
        "alt",
        30 + i,
        `2025-${String((i % 12) + 1).padStart(2, "0")}-${i < 12 ? "01" : "15"}`,
      ),
    );
    const b = buildLiverBrief({
      assessment: null,
      panels: toPanels(many),
      rows: many,
      birthYear: 1980,
    });
    expect(b.trends[0].points.length).toBe(12);
  });
});
