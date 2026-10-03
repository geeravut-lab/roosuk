import { describe, expect, it } from "vitest";
import { bangkokMonthStart, windowStart } from "./period";

describe("bangkokMonthStart", () => {
  it("uses Thai time, so the month rolls over at midnight in Bangkok, not at 07:00", () => {
    expect(bangkokMonthStart(new Date("2026-10-15T12:00:00Z"))).toBe(
      "2026-10-01",
    );
    // 18:00 UTC on 30 Sep is already 1 Oct 01:00 in Bangkok
    expect(bangkokMonthStart(new Date("2026-09-30T18:00:00Z"))).toBe(
      "2026-10-01",
    );
    // 16:59 UTC on 30 Sep is still 30 Sep 23:59 in Bangkok
    expect(bangkokMonthStart(new Date("2026-09-30T16:59:00Z"))).toBe(
      "2026-09-01",
    );
    expect(bangkokMonthStart(new Date("2026-12-31T17:00:00Z"))).toBe(
      "2027-01-01",
    );
  });
});

describe("windowStart", () => {
  it("is the month itself for monthly quotas", () => {
    expect(windowStart("2026-10-01", 1)).toBe("2026-10-01");
  });

  it("aligns quarterly windows to January", () => {
    expect(windowStart("2026-10-01", 3)).toBe("2026-10-01");
    expect(windowStart("2026-11-01", 3)).toBe("2026-10-01");
    expect(windowStart("2026-12-01", 3)).toBe("2026-10-01");
    expect(windowStart("2027-01-01", 3)).toBe("2027-01-01");
    expect(windowStart("2026-05-01", 3)).toBe("2026-04-01");
  });

  it("supports longer windows and rejects nonsense", () => {
    expect(windowStart("2026-09-01", 12)).toBe("2026-01-01");
    expect(() => windowStart("2026-10-01", 0)).toThrow(RangeError);
    expect(() => windowStart("2026-10-01", 13)).toThrow(RangeError);
    expect(() => windowStart("2026-10-01", 1.5)).toThrow(RangeError);
  });
});
