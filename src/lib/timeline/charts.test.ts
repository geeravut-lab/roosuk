import { describe, expect, it } from "vitest";
import {
  dailyKcal,
  layoutChart,
  markerSeries,
  parseRange,
  rangeStart,
  trendableMarkers,
  yDomain,
} from "./charts";

describe("parseRange", () => {
  it("accepts the offered ranges and defaults to 30", () => {
    expect(parseRange("7", null)).toBe(7);
    expect(parseRange("365", null)).toBe(365);
    expect(parseRange(undefined, null)).toBe(30);
    expect(parseRange("12", null)).toBe(30);
    expect(parseRange(["7"], null)).toBe(30);
  });
  it("never goes past the plan's window", () => {
    expect(parseRange("365", 30)).toBe(30);
    expect(parseRange("90", 90)).toBe(90);
    expect(parseRange("90", 60)).toBe(30);
    expect(parseRange("30", 10)).toBe(7);
    expect(parseRange("30", 3)).toBe(7); // never an empty option list
  });
});

describe("yDomain", () => {
  it("covers the data and the band, with air", () => {
    const [lo, hi] = yDomain([5, 8], [4, 6]);
    expect(lo).toBeLessThan(4);
    expect(hi).toBeGreaterThan(8);
  });
  it("copes with one value, no values and open band sides", () => {
    expect(yDomain([5])).toEqual([4 - 0.24, 6 + 0.24]);
    expect(yDomain([])).toEqual([0, 1]);
    const [lo, hi] = yDomain([5, 9], [null, 7]);
    expect(lo).toBeLessThan(5);
    expect(hi).toBeGreaterThan(9);
  });
  it("uses a fixed domain as given", () => {
    expect(yDomain([40], undefined, [0, 100])).toEqual([0, 100]);
  });
});

describe("layoutChart", () => {
  const from = "2026-09-01";
  const to = "2026-09-11";
  it("places points by real date and keeps y inside the plot", () => {
    const l = layoutChart(
      [
        { date: "2026-09-01", value: 10 },
        { date: "2026-09-11", value: 20 },
      ],
      from,
      to,
      { fixedY: [0, 20] },
    );
    expect(l.points[0].x).toBe(l.xStart);
    expect(l.points[1].x).toBe(l.xEnd);
    expect(l.points[1].y).toBeLessThan(l.points[0].y);
    for (const p of l.points) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(150);
    }
  });
  it("breaks the line at a missing day instead of inventing a value", () => {
    const l = layoutChart(
      [
        { date: "2026-09-01", value: 50 },
        { date: "2026-09-02", value: 60 },
        { date: "2026-09-04", value: 70 },
        { date: "2026-09-05", value: 80 },
        { date: "2026-09-09", value: 90 },
      ],
      from,
      to,
      { fixedY: [0, 100] },
    );
    expect(l.paths).toHaveLength(2); // 1-2 and 4-5; the lone 9th is a dot only
    expect(l.points).toHaveLength(5);
  });
  it("joins lab points across gaps (a trend is not daily) and draws the band", () => {
    const l = layoutChart(
      [
        { date: "2026-09-01", value: 90 },
        { date: "2026-09-09", value: 110 },
      ],
      from,
      to,
      { band: [70, 99], joinGaps: true },
    );
    expect(l.paths).toHaveLength(1);
    expect(l.band).not.toBeNull();
    expect(l.band!.top).toBeLessThan(l.band!.bottom);
  });
  it("ignores points outside the range, nulls and NaN", () => {
    const l = layoutChart(
      [
        { date: "2026-08-31", value: 1 },
        { date: "2026-09-12", value: 1 },
        { date: "2026-09-05", value: null },
        { date: "2026-09-06", value: Number.NaN },
        { date: "2026-09-07", value: 3 },
      ],
      from,
      to,
    );
    expect(l.points.map((p) => p.date)).toEqual(["2026-09-07"]);
    expect(l.paths).toEqual([]);
  });
  it("drops a band that lies completely outside the plotted values' domain", () => {
    const l = layoutChart([{ date: from, value: 5 }], from, to, {
      band: [null, null],
    });
    expect(l.band).toBeNull();
  });
});

describe("series builders", () => {
  it("sums meals per day and skips bad numbers", () => {
    const k = dailyKcal([
      { meal_date: "2026-09-01", kcal: 400 },
      { meal_date: "2026-09-01", kcal: 250 },
      { meal_date: "2026-09-02", kcal: Number.NaN },
      { meal_date: "2026-09-03", kcal: -5 },
    ]);
    expect(k).toEqual([{ date: "2026-09-01", value: 650 }]);
  });
  const rows = [
    {
      marker_key: "ldl",
      value_std: 130,
      status: "watch" as const,
      collected_on: "2026-09-01",
    },
    {
      marker_key: "ldl",
      value_std: "110",
      status: "normal" as const,
      collected_on: "2026-03-01",
    },
    {
      marker_key: "ldl",
      value_std: 999,
      status: "abnormal" as const,
      collected_on: "2026-09-01",
    }, // same day, older row
    {
      marker_key: "hba1c",
      value_std: null,
      status: "unknown" as const,
      collected_on: "2026-09-01",
    },
    {
      marker_key: "hba1c",
      value_std: 5.4,
      status: "normal" as const,
      collected_on: "2026-03-01",
    },
    {
      marker_key: null,
      value_std: 1,
      status: "unknown" as const,
      collected_on: "2026-09-01",
    },
  ];
  it("one point per day (newest row wins), sorted by date, converted values only", () => {
    expect(markerSeries(rows, "ldl")).toEqual([
      { date: "2026-03-01", value: 110, status: "normal" },
      { date: "2026-09-01", value: 130, status: "watch" },
    ]);
    expect(markerSeries(rows, "hba1c")).toHaveLength(1);
  });
  it("lists only markers with a real trend", () => {
    expect(trendableMarkers(rows)).toEqual(["ldl"]);
  });
  it("range start is inclusive of today", () => {
    expect(rangeStart("2026-09-30", 7)).toBe("2026-09-24");
  });
});
