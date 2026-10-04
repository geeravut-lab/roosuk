import { describe, expect, it } from "vitest";
import type { Insight } from "./anomaly";
import { insightPrompt, normalizeInsightNote } from "./explain";

const insight = (kind: Insight["kind"], facts: Insight["facts"]): Insight => ({
  kind,
  severity: 2,
  anchor: "a",
  facts,
  href: "/",
});

describe("insightPrompt", () => {
  it("gives the model names and counts only, never lab values", () => {
    const p = insightPrompt(
      insight("lab_worse", { markers: "ldl,hba1c", count: 2 }),
      "en",
    );
    expect(p).toContain("LDL cholesterol");
    expect(p).toContain("HbA1c");
    expect(p).not.toMatch(/\d{2,}/);
    expect(
      insightPrompt(insight("lab_worse", { markers: "ldl" }), "th"),
    ).toContain("ไขมันเลว");
  });
  it("states the habit facts", () => {
    expect(
      insightPrompt(insight("score_drop", { recent: 60, previous: 80 }), "en"),
    ).toContain("60");
    expect(
      insightPrompt(insight("sleep_short", { days: 3, of: 5 }), "en"),
    ).toContain("3 of the last 5");
    expect(
      insightPrompt(insight("comeback", { run: 7, gap: 5 }), "en"),
    ).toContain("7 days in a row");
  });
});

describe("normalizeInsightNote", () => {
  it("accepts a calm note and drops unsafe steps only", () => {
    const n = normalizeInsightNote({
      summary:
        "สัปดาห์นี้คะแนนต่ำลงเล็กน้อย เป็นเรื่องปกติที่จังหวะชีวิตจะขึ้นลงนะคะ",
      steps: [
        "เข้านอนเร็วขึ้นสัก 30 นาที",
        "ลดน้ำหนักให้ได้ 3 กิโล",
        "หยุดยาที่กินอยู่",
      ],
    });
    expect(n?.steps).toEqual(["เข้านอนเร็วขึ้นสัก 30 นาที"]);
  });
  it("rejects diagnosis, doses, weight goals and bad shapes", () => {
    for (const summary of [
      "You have diabetes, please be careful about it.",
      "ควรกิน 500 มก. ทุกวันเพื่อให้ดีขึ้นนะคะ",
      "ต้องลดน้ำหนักให้ได้ภายในเดือนนี้นะ",
      "short",
    ])
      expect(normalizeInsightNote({ summary, steps: [] }), summary).toBeNull();
    expect(normalizeInsightNote(null)).toBeNull();
    expect(
      normalizeInsightNote({
        summary: "A fine and friendly note here.",
        steps: "x",
      }),
    ).toMatchObject({ steps: [] });
  });
});
