import { describe, expect, it } from "vitest";
import {
  SECTIONS,
  briefPrompt,
  buildSnapshot,
  parsePassportForm,
  parseStoredSnapshot,
  type SnapshotInput,
} from "@/lib/passport/passport";
import { buildLiverBrief } from "./brief";
import { assessLiver } from "./engine";
import type { LiverAnswers } from "./questionnaire";
import { toPanels, type LiverLabRow } from "./trend";

const answers: LiverAnswers = {
  redFlags: [],
  birthYear: 1975,
  sex: "female",
  heightCm: 160,
  weightKg: 66,
  waistCm: 84,
  diabetes: "yes",
  hypertension: "no",
  dyslipidemia: "no",
  history: [],
  familyLiver: "no",
  hepB: "never_tested",
  hepC: "negative",
  alcohol: "none",
  meds: "yes",
  symptoms: [],
};
const rows: LiverLabRow[] = [
  {
    marker_key: "alt",
    value_std: 60,
    status: "watch",
    collected_on: "2026-09-01",
  },
  {
    marker_key: "ast",
    value_std: 50,
    status: "watch",
    collected_on: "2026-09-01",
  },
  {
    marker_key: "platelets",
    value_std: 170,
    status: "normal",
    collected_on: "2026-09-01",
  },
  {
    marker_key: "alt",
    value_std: 40,
    status: "normal",
    collected_on: "2026-05-01",
  },
];
const panels = toPanels(rows);
const result = assessLiver({ today: "2026-10-10", answers, panels });
const liver = buildLiverBrief({
  assessment: { created_on: "2026-10-10", result, answers },
  panels,
  rows,
  birthYear: 1975,
});

const input: SnapshotInput = {
  today: "2026-10-10",
  sections: ["liver"],
  profile: null,
  labs: [],
  checkins: [],
  documents: [],
  wearableDays: [],
  liver,
};

describe("the liver section of a Health Passport", () => {
  it("is one of the sections a person can tick", () => {
    expect(SECTIONS).toContain("liver");
    const f = new FormData();
    f.append("label", "For Dr. Lee");
    f.append("expiryDays", "7");
    f.append("sections", "liver");
    f.append("ack", "on");
    const r = parsePassportForm(f);
    expect(r.ok && r.value.sections).toEqual(["liver"]);
  });

  it("is in the snapshot only when ticked — and nothing else rides along", () => {
    const s = buildSnapshot(input);
    expect(s.liver?.result?.level).toBe(2);
    expect(Object.keys(s).sort()).toEqual([
      "generatedOn",
      "liver",
      "sections",
      "v",
    ]);
    const without = buildSnapshot({ ...input, sections: ["labs"] });
    expect(without.liver).toBeUndefined();
  });

  it("round-trips through storage and a damaged value is dropped, not trusted", () => {
    const s = buildSnapshot(input);
    const back = parseStoredSnapshot(JSON.parse(JSON.stringify(s)));
    expect(back?.liver?.result?.level).toBe(2);
    expect(back?.liver?.labs.length).toBe(3);
    const broken = JSON.parse(JSON.stringify(s));
    broken.liver.result.level = 9;
    expect(parseStoredSnapshot(broken)?.liver).toBeUndefined();
  });

  it("gives the AI brief the level and FIB-4 but no names and no raw answers", () => {
    const text = briefPrompt(buildSnapshot(input));
    expect(text).toMatch(/Liver screening .*not a diagnosis.*level 2 of 3/);
    expect(text).toMatch(/FIB-4 \d/);
    expect(text).not.toMatch(/never_tested|meds|hepB/);
  });
});
