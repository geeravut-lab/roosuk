import { describe, expect, it } from "vitest";
import {
  MIN_GROUP,
  cleanCompanyCode,
  companyStats,
  grantEnd,
  newCompanyCode,
  parseCompanyForm,
} from "./corporate";

const today = "2026-10-20";
const get = (o: Record<string, unknown>) => (k: string) => o[k];
const ok = {
  name: " Acme  Co ",
  seats: "50",
  tier: "premium",
  validUntil: "2026-12-31",
  note: "",
  active: "on",
};

describe("codes", () => {
  it("are 7 characters from the look-alike-free alphabet", () => {
    for (let i = 0; i < 50; i++)
      expect(newCompanyCode()).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
    expect(cleanCompanyCode(" ab3-kx7 m ")).toBe("AB3KX7M");
    for (const bad of ["", "AB0KX7M", "SHORT", 5, null])
      expect(cleanCompanyCode(bad)).toBeNull();
  });
});

describe("parseCompanyForm", () => {
  it("reads a good form", () => {
    expect(parseCompanyForm(get(ok), today)).toEqual({
      ok: true,
      value: {
        name: "Acme Co",
        seats: 50,
        tier: "premium",
        validUntil: "2026-12-31",
        note: null,
        active: true,
      },
    });
  });
  it("names the first thing that is wrong", () => {
    const bad = (o: Record<string, unknown>) => {
      const r = parseCompanyForm(get({ ...ok, ...o }), today);
      return r.ok ? "ok" : r.field;
    };
    expect(bad({ name: "  " })).toBe("name");
    expect(bad({ seats: "0" })).toBe("seats");
    expect(bad({ seats: "x" })).toBe("seats");
    expect(bad({ tier: "free" })).toBe("tier");
    expect(bad({ validUntil: "2026-10-19" })).toBe("validUntil"); // in the past
    expect(bad({ validUntil: "2040-01-01" })).toBe("validUntil"); // absurdly far
    expect(bad({ validUntil: "soon" })).toBe("validUntil");
  });
  it("the grant runs to the end of the last day in Bangkok", () => {
    expect(grantEnd("2026-12-31")).toBe("2026-12-31T16:59:59.000Z");
  });
});

describe("companyStats", () => {
  const row = (d: string, s = 3) => ({
    checkin_date: d,
    sleep_band: s,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  });
  const person = (days: string[]) => ({ checkins: days.map((d) => row(d)) });

  it("says nothing below the minimum group — however the numbers look", () => {
    const few = Array.from({ length: MIN_GROUP - 1 }, () => person([today]));
    expect(companyStats(few, today)).toBeNull();
    expect(companyStats([], today)).toBeNull();
  });
  it("reports anonymous group figures once enough people took part", () => {
    const people = [
      person([today, "2026-10-19"]),
      person(["2026-10-18"]),
      person([]),
      person(["2026-09-01"]), // checked in, but not this week
      person([today]),
    ];
    const s = companyStats(people, today);
    expect(s).toMatchObject({ participants: 5, activePercent: 60 });
    expect(s!.avgScore).toBeTypeOf("number");
    expect(Object.keys(s!).sort()).toEqual([
      "activePercent",
      "avgScore",
      "participants",
    ]); // no names, no rows
  });
  it("avgScore is null when nobody has a score yet", () => {
    expect(
      companyStats(
        Array.from({ length: 5 }, () => person([])),
        today,
      ),
    ).toEqual({ participants: 5, activePercent: 0, avgScore: null });
  });
});
