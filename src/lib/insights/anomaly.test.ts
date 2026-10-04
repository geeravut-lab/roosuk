import { describe, expect, it } from "vitest";
import type { CheckinRow } from "@/lib/health/checkin";
import { addDays } from "@/lib/health/dates";
import { detectInsights, weekStart, type LabResultRow } from "./anomaly";

const TODAY = "2026-10-14"; // a Wednesday
const row = (offset: number, over: Partial<CheckinRow> = {}): CheckinRow => ({
  checkin_date: addDays(TODAY, offset),
  sleep_band: 3,
  activity_band: 3,
  energy: 4,
  mood: 4,
  nutrition: 4,
  ...over,
});
const good = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => row(from + i));
const poor = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) =>
    row(from + i, {
      sleep_band: 2,
      activity_band: 1,
      energy: 2,
      mood: 2,
      nutrition: 2,
    }),
  );
const lab = (
  marker: string,
  status: LabResultRow["status"],
  date: string,
  id = "r",
): LabResultRow => ({
  marker_key: marker,
  status,
  collected_on: date,
  report_id: id,
});
const kinds = (xs: ReturnType<typeof detectInsights>) => xs.map((x) => x.kind);

describe("weekStart", () => {
  it("is the Monday of that week", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday
  });
});

describe("score_drop", () => {
  it("fires when this week is clearly lower than last week, with enough days in both", () => {
    const out = detectInsights({
      today: TODAY,
      checkins: [...good(-13, -7), ...poor(-6, 0)],
      labs: [],
    });
    expect(kinds(out)).toContain("score_drop");
    const i = out.find((x) => x.kind === "score_drop")!;
    expect(i.facts.drop).toBeGreaterThanOrEqual(15);
    expect(i.anchor).toBe("2026-10-12");
  });
  it("is quiet for a steady week, an improvement, or too little data", () => {
    expect(
      kinds(detectInsights({ today: TODAY, checkins: good(-13, 0), labs: [] })),
    ).not.toContain("score_drop");
    expect(
      kinds(
        detectInsights({
          today: TODAY,
          checkins: [...poor(-13, -7), ...good(-6, 0)],
          labs: [],
        }),
      ),
    ).not.toContain("score_drop");
    expect(
      kinds(
        detectInsights({
          today: TODAY,
          checkins: [...good(-13, -12), ...poor(-6, 0)],
          labs: [],
        }),
      ),
    ).not.toContain("score_drop");
    expect(
      kinds(
        detectInsights({
          today: TODAY,
          checkins: [...good(-13, -7), ...poor(-1, 0)],
          labs: [],
        }),
      ),
    ).not.toContain("score_drop");
  });
});

describe("sleep_short", () => {
  it("needs three of the last five check-ins with the shortest sleep", () => {
    const rows = [
      row(-4),
      row(-3, { sleep_band: 1 }),
      row(-2, { sleep_band: 1 }),
      row(-1),
      row(0, { sleep_band: 1 }),
    ];
    const i = detectInsights({ today: TODAY, checkins: rows, labs: [] }).find(
      (x) => x.kind === "sleep_short",
    )!;
    expect(i.facts).toEqual({ days: 3, of: 5 });
    expect(i.anchor).toBe(TODAY);
    const two = [
      row(-2, { sleep_band: 1 }),
      row(-1),
      row(0, { sleep_band: 1 }),
    ];
    expect(
      kinds(detectInsights({ today: TODAY, checkins: two, labs: [] })),
    ).not.toContain("sleep_short");
  });
});

describe("comeback", () => {
  it("a person who had a run and has been away a few days gets a gentle nudge", () => {
    const rows = good(-12, -6); // 7 days, last one 6 days ago
    const i = detectInsights({ today: TODAY, checkins: rows, labs: [] }).find(
      (x) => x.kind === "comeback",
    )!;
    expect(i.severity).toBe(1);
    expect(i.facts).toEqual({ run: 7, gap: 6 });
  });
  it("not for a short run, a brief gap, or someone long gone", () => {
    expect(
      kinds(detectInsights({ today: TODAY, checkins: good(-8, -6), labs: [] })),
    ).not.toContain("comeback");
    expect(
      kinds(detectInsights({ today: TODAY, checkins: good(-6, -2), labs: [] })),
    ).not.toContain("comeback"); // 2 days away
    expect(
      kinds(
        detectInsights({ today: TODAY, checkins: good(-60, -50), labs: [] }),
      ),
    ).not.toContain("comeback");
  });
});

describe("lab_worse", () => {
  it("a test that moved to a worse status than last time, newest report first, handed to the report", () => {
    const out = detectInsights({
      today: TODAY,
      checkins: [],
      labs: [
        lab("ldl", "watch", "2026-09-20", "new"),
        lab("ldl", "normal", "2026-03-01", "old"),
        lab("hba1c", "normal", "2026-09-20", "new"),
        lab("hba1c", "normal", "2026-03-01", "old"),
      ],
    });
    expect(kinds(out)).toEqual(["lab_worse"]);
    expect(out[0]).toMatchObject({
      severity: 3,
      href: "/scan/lab/new?from=today",
    });
    expect(out[0].facts).toEqual({ markers: "ldl", count: 1 });
  });
  it("is quiet when things are the same or better, with a single result, unknown status, or an old result", () => {
    const same = [
      lab("ldl", "watch", "2026-09-20"),
      lab("ldl", "watch", "2026-03-01"),
    ];
    const better = [
      lab("ldl", "normal", "2026-09-20"),
      lab("ldl", "abnormal", "2026-03-01"),
    ];
    const single = [lab("ldl", "abnormal", "2026-09-20")];
    const unknown = [
      lab("ldl", "unknown", "2026-09-20"),
      lab("ldl", "normal", "2026-03-01"),
    ];
    const old = [
      lab("ldl", "watch", "2025-12-01"),
      lab("ldl", "normal", "2025-06-01"),
    ];
    for (const labs of [same, better, single, unknown, old])
      expect(
        kinds(detectInsights({ today: TODAY, checkins: [], labs })),
      ).not.toContain("lab_worse");
  });
  it("two results on the same day count once (no phantom change)", () => {
    const labs = [
      lab("ldl", "watch", "2026-09-20"),
      lab("ldl", "normal", "2026-09-20"),
    ];
    expect(
      kinds(detectInsights({ today: TODAY, checkins: [], labs })),
    ).not.toContain("lab_worse");
  });
});

describe("ordering", () => {
  it("puts the lab hand-off first and lists each kind once", () => {
    const out = detectInsights({
      today: TODAY,
      checkins: [...good(-13, -7), ...poor(-6, 0)],
      labs: [
        lab("ldl", "abnormal", "2026-09-20"),
        lab("ldl", "normal", "2026-03-01"),
      ],
    });
    expect(kinds(out)[0]).toBe("lab_worse");
    expect(new Set(kinds(out)).size).toBe(out.length);
  });
});
