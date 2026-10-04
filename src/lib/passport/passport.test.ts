import { describe, expect, it } from "vitest";
import {
  briefPrompt,
  buildSnapshot,
  hashToken,
  isTokenShape,
  latestLabs,
  linkStatus,
  newToken,
  normalizeBrief,
  parsePassportForm,
  parseStoredSnapshot,
  type SnapshotInput,
} from "./passport";

const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o))
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const ok = {
  label: "For Dr. Lee",
  expiryDays: "7",
  sections: ["profile", "labs"],
  ack: "on",
};

describe("parsePassportForm", () => {
  it("accepts a complete form and keeps sections in a fixed order", () => {
    const r = parsePassportForm(
      form({ ...ok, sections: ["labs", "profile"], withBrief: "on" }),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        label: "For Dr. Lee",
        holderName: null,
        sections: ["profile", "labs"],
        expiryDays: 7,
        withBrief: true,
      },
    });
  });
  it("needs a label, a known expiry and at least one known section", () => {
    for (const bad of [
      { ...ok, label: "  " },
      { ...ok, expiryDays: "365" },
      { ...ok, sections: [] as string[] },
      { ...ok, sections: ["passwords"] },
    ])
      expect(parsePassportForm(form(bad))).toEqual({
        ok: false,
        error: "err_invalid_input",
      });
  });
  it("will not make a link without the person's own acknowledgement", () => {
    const { ack: _ack, ...rest } = ok;
    void _ack;
    expect(parsePassportForm(form(rest))).toEqual({
      ok: false,
      error: "err_passport_ack",
    });
  });
});

describe("tokens", () => {
  it("are 43 url-safe characters, never repeat, and hash to 64 hex characters", () => {
    const a = newToken();
    expect(isTokenShape(a)).toBe(true);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
  it("anything else in a URL is not even looked up", () => {
    for (const bad of [
      "",
      "abc",
      "x".repeat(44),
      `${"a".repeat(42)}!`,
      "../etc",
    ])
      expect(isTokenShape(bad)).toBe(false);
  });
});

const today = "2026-10-20";
const base: SnapshotInput = {
  today,
  sections: ["profile", "labs", "checkins", "documents", "wearables"],
  profile: {
    birth_year: 1980,
    sex: "female",
    smoking: "never",
    alcohol: "occasional",
    exercise_days: 3,
    conditions: ["hypertension"],
    goals: ["sleep"],
  },
  labs: [
    {
      name: "HbA1c",
      marker_key: "hba1c",
      value: "5.4",
      unit: "%",
      status: "normal",
      collected_on: "2026-01-02",
    },
    {
      name: "HbA1c",
      marker_key: "hba1c",
      value: "5.9",
      unit: "%",
      status: "watch",
      collected_on: "2026-09-02",
    },
    {
      name: "LDL",
      marker_key: "ldl",
      value: 160,
      unit: "mg/dL",
      status: "abnormal",
      collected_on: "2026-09-02",
    },
  ],
  checkins: [
    {
      checkin_date: "2026-10-20",
      sleep_band: 3,
      activity_band: 2,
      energy: 4,
      mood: 4,
      nutrition: 3,
    },
    {
      checkin_date: "2026-08-01",
      sleep_band: 1,
      activity_band: 1,
      energy: 1,
      mood: 1,
      nutrition: 1,
    },
  ],
  documents: [
    { title: "Vaccine card", category: "vaccine", doc_date: "2026-05-01" },
    { title: "Weird", category: "not-a-category", doc_date: null },
  ],
  wearableDays: [
    { steps: 8000, restingHr: 60, sleepMinutes: 420 },
    { steps: 6000, restingHr: null, sleepMinutes: 360 },
  ],
};

describe("buildSnapshot", () => {
  it("uses the newest value of each test and puts the odd ones first", () => {
    const labs = latestLabs(base.labs);
    expect(labs.map((l) => [l.name, l.value, l.status])).toEqual([
      ["LDL", 160, "abnormal"],
      ["HbA1c", 5.9, "watch"],
    ]);
  });
  it("only reads the sections that were ticked", () => {
    const s = buildSnapshot({ ...base, sections: ["labs"] });
    expect(Object.keys(s).sort()).toEqual([
      "generatedOn",
      "labs",
      "sections",
      "v",
    ]);
  });
  it("summarises the profile, check-ins, documents and wearables without raw rows", () => {
    const s = buildSnapshot(base);
    expect(s.profile).toMatchObject({ age: 46, conditions: ["hypertension"] });
    expect(s.checkins).toMatchObject({ windowDays: 30, days: 1 }); // the August one is outside the window
    expect(s.documents).toEqual([
      { title: "Vaccine card", category: "vaccine", docDate: "2026-05-01" },
    ]);
    expect(s.wearables).toMatchObject({
      days: 2,
      avgSteps: 7000,
      avgRestingHr: 60,
      avgSleepMinutes: 390,
    });
  });
  it("round-trips through the stored form, and a damaged value is refused", () => {
    const s = buildSnapshot(base);
    expect(parseStoredSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseStoredSnapshot({ v: 2 })).toBeNull();
    expect(parseStoredSnapshot(null)).toBeNull();
    const broken = JSON.parse(JSON.stringify(s));
    broken.labs = [{ name: 1 }];
    expect(parseStoredSnapshot(broken)?.labs).toBeUndefined();
  });
});

describe("linkStatus", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  it("is revoked before expired before active", () => {
    expect(
      linkStatus({ expires_at: "2026-10-21T00:00:00Z", revoked_at: null }, now),
    ).toBe("active");
    expect(
      linkStatus({ expires_at: "2026-10-19T00:00:00Z", revoked_at: null }, now),
    ).toBe("expired");
    expect(
      linkStatus(
        {
          expires_at: "2026-10-21T00:00:00Z",
          revoked_at: "2026-10-20T00:00:00Z",
        },
        now,
      ),
    ).toBe("revoked");
  });
});

describe("the brief", () => {
  it("sends the model only what was shared, with no name", () => {
    const p = briefPrompt(buildSnapshot({ ...base, sections: ["labs"] }));
    expect(p).toContain("LDL: 160 mg/dL");
    expect(p).not.toContain("Profile:");
    expect(p).not.toContain("Conditions");
  });
  it("keeps a good brief and drops a bad bullet", () => {
    const b = normalizeBrief({
      summary: "You recorded two lab values and checked in on one day.",
      changes: ["LDL is outside the general range on 2026-09-02."],
      questions: [
        "Should I repeat the LDL test?",
        "ok",
        "Stop taking your medicine",
      ],
    });
    expect(b?.questions).toEqual(["Should I repeat the LDL test?"]);
    expect(b?.changes).toHaveLength(1);
  });
  it("refuses a brief that diagnoses, gives a dose or sets a weight target", () => {
    for (const summary of [
      "คุณเป็นเบาหวาน ควรกินยา 500 มก. ทุกวัน",
      "You have diabetes and should lose weight to reach your target weight.",
      "short",
    ])
      expect(
        normalizeBrief({ summary, changes: [], questions: [] }),
      ).toBeNull();
  });
});
