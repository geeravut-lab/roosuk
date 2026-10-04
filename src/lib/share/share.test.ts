import { describe, expect, it } from "vitest";
import { foodCardData, labCardData, parseQuizCard, siteHost } from "./share";

describe("parseQuizCard", () => {
  it("accepts a plausible quiz outcome", () => {
    expect(parseQuizCard({ score: "78", health: "38", real: "41" })).toEqual({
      score: 78,
      healthAge: 38,
      realAge: 41,
    });
    expect(
      parseQuizCard({ score: "0", health: "51", real: "41" }),
    ).not.toBeNull();
    expect(
      parseQuizCard({ score: "100", health: "31", real: "41" }),
    ).not.toBeNull();
  });
  it("refuses numbers a quiz can never produce (the card is public)", () => {
    for (const bad of [
      { score: "101", health: "40", real: "41" },
      { score: "50", health: "10", real: "60" }, // health age more than ±10 years from real
      { score: "50", health: "52", real: "41" },
      { score: "50", health: "40", real: "9" },
      { score: "50", health: "40", real: "121" },
      { score: "-5", health: "40", real: "41" },
      { score: "5.5", health: "40", real: "41" },
      { score: "abc", health: "40", real: "41" },
      { score: "<script>", health: "40", real: "41" },
      { score: "1000", health: "40", real: "41" },
      { health: "40", real: "41" },
      { score: null, health: "40", real: "41" },
    ])
      expect(parseQuizCard(bad as never), JSON.stringify(bad)).toBeNull();
  });
});

describe("labCardData", () => {
  it("counts only — no names or values", () => {
    const items = [
      { status: "normal" as const, name: "FBS", value: 104 },
      { status: "watch" as const, name: "LDL", value: 150 },
      { status: "abnormal" as const, name: "HbA1c", value: 7 },
      { status: "unknown" as const, name: "Mystery", value: 3 },
    ];
    const d = labCardData(items, "2026-09-01");
    expect(d).toEqual({
      assessed: 3,
      normal: 1,
      outside: 2,
      collectedOn: "2026-09-01",
    });
    expect(JSON.stringify(d)).not.toMatch(/FBS|LDL|HbA1c|Mystery|104|150/);
  });
  it("an all-unknown report has nothing to share", () => {
    expect(labCardData([{ status: "unknown" }], null).assessed).toBe(0);
  });
});

describe("foodCardData", () => {
  it("shows up to three dishes and counts the rest", () => {
    const items = [
      "ผัดไทย",
      "ต้มยำกุ้ง",
      "ข้าวมันไก่",
      "ส้มตำ",
      "ไข่เจียว",
    ].map((name) => ({ name }));
    expect(foodCardData(items, 812.4)).toEqual({
      names: ["ผัดไทย", "ต้มยำกุ้ง", "ข้าวมันไก่"],
      more: 2,
      kcal: 812,
    });
  });
  it("drops blank names and never shows negative energy", () => {
    expect(foodCardData([{ name: "  " }, { name: "ข้าวผัด" }], -5)).toEqual({
      names: ["ข้าวผัด"],
      more: 0,
      kcal: 0,
    });
  });
});

describe("siteHost", () => {
  it("is the host only, with a safe default", () => {
    expect(siteHost("https://www.roosuk.com/some/path")).toBe("www.roosuk.com");
    expect(siteHost(undefined)).toBe("roosuk.netlify.app");
    expect(siteHost("not a url")).toBe("roosuk.netlify.app");
  });
});
