import { describe, expect, it } from "vitest";
import { LINE_EMAIL_DOMAIN } from "@/lib/line/login";
import {
  buildSharedView,
  cleanInviteCode,
  maskEmail,
  parseScopes,
} from "./family";

describe("parseScopes", () => {
  it("keeps known switches in the menu's order and drops the rest", () => {
    expect(parseScopes(["score", "checkin", "labs", "checkin"])).toEqual([
      "checkin",
      "score",
    ]);
    expect(parseScopes([])).toEqual([]);
  });
});

describe("cleanInviteCode", () => {
  it("accepts a code typed any way, or the end of a pasted link", () => {
    expect(cleanInviteCode(" abc2345 ")).toBe("ABC2345");
    expect(cleanInviteCode("https://roosuk.example/family?code=ABC2345")).toBe(
      "ABC2345",
    );
    for (const bad of ["", "ab", "!!!!!!!", null, 5, "a b c d e f g"])
      expect(cleanInviteCode(bad)).toBeNull();
  });
});

describe("maskEmail", () => {
  it("shows two letters and the domain; LINE placeholders show nothing", () => {
    expect(maskEmail("geeravut@gmail.com")).toBe("ge•••@gmail.com");
    expect(maskEmail(`line_x@${LINE_EMAIL_DOMAIN}`)).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("no-at-sign")).toBeNull();
  });
});

describe("buildSharedView", () => {
  const today = "2026-10-20";
  const row = (d: string, s = 3) => ({
    checkin_date: d,
    sleep_band: s,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  });
  const rows = [
    row("2026-10-20"),
    row("2026-10-19"),
    row("2026-10-18"),
    row("2026-10-05"),
  ];

  it("computes only the switches that are on", () => {
    expect(buildSharedView([], rows, today)).toEqual({});
    const c = buildSharedView(["checkin"], rows, today);
    expect(c).toEqual({
      checkin: { checkedToday: true, streak: 3, daysLast7: 3 },
    });
    expect(c.score).toBeUndefined();
    const s = buildSharedView(["score"], rows, today);
    expect(s.checkin).toBeUndefined();
    expect(s.score?.overall).toBeTypeOf("number");
  });
  it("says so when there is nothing yet", () => {
    expect(buildSharedView(["checkin", "score"], [], today)).toEqual({
      checkin: { checkedToday: false, streak: 0, daysLast7: 0 },
      score: { overall: null, trend: null, focus: null },
    });
  });
});
