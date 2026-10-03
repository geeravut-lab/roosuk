import { describe, expect, it } from "vitest";
import {
  pickDailyActions,
  ACTION_TEMPLATES,
  ALL_ACTION_KEYS,
  CHECKIN_ACTION,
  isActionKey,
} from "./actions";
import { parseCheckinForm, type CheckinRow } from "./checkin";
import { addDays, bangkokDate, dayOfYear, daysBetween } from "./dates";
import { hasSustainedLowMood } from "./mood";
import {
  computeHealthScore,
  dayScore,
  categoryPoints,
  weakestFirst,
} from "./score";
import { computeStreak, recentDays } from "./streak";

const TODAY = "2026-10-10";
const row = (offset: number, over: Partial<CheckinRow> = {}): CheckinRow => ({
  checkin_date: addDays(TODAY, offset),
  sleep_band: 3,
  activity_band: 3,
  energy: 4,
  mood: 4,
  nutrition: 4,
  ...over,
});

describe("dates", () => {
  it("uses Bangkok midnight, not UTC", () => {
    expect(bangkokDate(new Date("2026-10-10T16:59:59Z"))).toBe("2026-10-10");
    expect(bangkokDate(new Date("2026-10-10T17:00:00Z"))).toBe("2026-10-11");
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-10-01", "2026-10-10")).toBe(9);
    expect(dayOfYear("2026-01-01")).toBe(1);
    expect(dayOfYear("2026-12-31")).toBe(365);
  });
  it("rejects garbage", () => {
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });
});

describe("parseCheckinForm", () => {
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const ok = {
    sleep_band: "3",
    activity_band: "2",
    energy: "4",
    mood: "5",
    nutrition: "1",
  };
  it("accepts a complete answer set", () => {
    expect(parseCheckinForm(form(ok))).toEqual({
      ok: true,
      answers: {
        sleep_band: 3,
        activity_band: 2,
        energy: 4,
        mood: 5,
        nutrition: 1,
      },
    });
  });
  it("rejects missing, out of range and non-integer answers", () => {
    const missing: Partial<typeof ok> = { ...ok };
    delete missing.mood;
    expect(parseCheckinForm(form(missing as Record<string, string>)).ok).toBe(
      false,
    );
    expect(parseCheckinForm(form({ ...ok, sleep_band: "5" })).ok).toBe(false);
    expect(parseCheckinForm(form({ ...ok, energy: "0" })).ok).toBe(false);
    expect(parseCheckinForm(form({ ...ok, mood: "2.5" })).ok).toBe(false);
    expect(parseCheckinForm(form({ ...ok, nutrition: "abc" })).ok).toBe(false);
  });
});

describe("category points and day score", () => {
  it("peaks at 7–8 h sleep and eases off for 9+", () => {
    const sleep = (b: number) =>
      categoryPoints(row(0, { sleep_band: b })).sleep;
    expect(sleep(3)).toBe(100);
    expect(sleep(1)).toBeLessThan(sleep(2));
    expect(sleep(4)).toBeLessThan(sleep(3));
  });
  it("maps the 1–5 scale onto 0–100 and averages energy and mood for recovery", () => {
    expect(categoryPoints(row(0, { nutrition: 1 })).nutrition).toBe(0);
    expect(categoryPoints(row(0, { nutrition: 5 })).nutrition).toBe(100);
    expect(categoryPoints(row(0, { energy: 1, mood: 5 })).recovery).toBe(50);
  });
  it("scores the best possible day 100 and the worst low but not negative", () => {
    expect(
      dayScore({
        sleep_band: 3,
        activity_band: 4,
        energy: 5,
        mood: 5,
        nutrition: 5,
      }),
    ).toBe(100);
    const worst = dayScore({
      sleep_band: 1,
      activity_band: 1,
      energy: 1,
      mood: 1,
      nutrition: 1,
    });
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThan(30);
  });
});

describe("computeHealthScore", () => {
  it("has no score without check-ins and never invents one", () => {
    const s = computeHealthScore([], TODAY);
    expect(s.overall).toBeNull();
    expect(s.focus).toBeNull();
    expect(s.trend).toBeNull();
    expect(s.daysUsed).toBe(0);
    expect(Object.values(s.categories).every((v) => v === null)).toBe(true);
  });

  it("averages the window, leaves check-up out until there is lab data, and counts lifestyle as consistency", () => {
    const s = computeHealthScore([row(0), row(-1)], TODAY);
    expect(s.daysUsed).toBe(2);
    expect(s.categories.checkup).toBeNull();
    expect(s.categories.lifestyle).toBe(Math.round((2 / 7) * 100));
    expect(s.categories.sleep).toBe(100);
    const present = Object.values(s.categories).filter(
      (v): v is number => v !== null,
    );
    expect(s.overall).toBe(
      Math.round(present.reduce((a, b) => a + b, 0) / present.length),
    );
  });

  it("ignores check-ins outside the 7-day window and in the future", () => {
    const s = computeHealthScore([row(-7), row(1), row(0)], TODAY);
    expect(s.daysUsed).toBe(1);
  });

  it("points the focus at the weakest actionable category, or nothing when all are good", () => {
    const poorSleep = computeHealthScore([row(0, { sleep_band: 1 })], TODAY);
    expect(poorSleep.focus).toBe("sleep");
    const great = computeHealthScore(
      [
        row(0, {
          sleep_band: 3,
          activity_band: 4,
          energy: 5,
          mood: 5,
          nutrition: 5,
        }),
      ],
      TODAY,
    );
    expect(great.focus).toBeNull();
  });

  it("shows a trend only when both weeks have at least 3 check-ins", () => {
    const thisWeek = [0, -1, -2].map((o) => row(o, { nutrition: 5 }));
    const lastWeek = [-7, -8, -9].map((o) => row(o, { nutrition: 1 }));
    expect(
      computeHealthScore([...thisWeek, ...lastWeek], TODAY).trend,
    ).toBeGreaterThan(0);
    expect(computeHealthScore([...thisWeek, row(-7)], TODAY).trend).toBeNull();
    expect(computeHealthScore(thisWeek, TODAY).trend).toBeNull();
  });

  it("orders categories weakest first", () => {
    const s = computeHealthScore(
      [row(0, { activity_band: 1, nutrition: 2 })],
      TODAY,
    );
    expect(weakestFirst(s)[0]).toBe("activity");
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(
      computeStreak([TODAY, addDays(TODAY, -1), addDays(TODAY, -2)], TODAY),
    ).toEqual({
      current: 3,
      best: 3,
      checkedToday: true,
    });
  });
  it("stays alive until today ends, then breaks after a missed day", () => {
    expect(
      computeStreak([addDays(TODAY, -1), addDays(TODAY, -2)], TODAY),
    ).toMatchObject({
      current: 2,
      checkedToday: false,
    });
    expect(
      computeStreak([addDays(TODAY, -2), addDays(TODAY, -3)], TODAY).current,
    ).toBe(0);
  });
  it("remembers the best run separately from the current one", () => {
    const old = [-20, -19, -18, -17, -16].map((o) => addDays(TODAY, o));
    expect(computeStreak([...old, TODAY], TODAY)).toMatchObject({
      current: 1,
      best: 5,
    });
  });
  it("is zero for no data and ignores duplicates", () => {
    expect(computeStreak([], TODAY)).toEqual({
      current: 0,
      best: 0,
      checkedToday: false,
    });
    expect(computeStreak([TODAY, TODAY], TODAY).current).toBe(1);
  });
  it("lists the last seven days oldest first", () => {
    const days = recentDays([TODAY, addDays(TODAY, -2)], TODAY);
    expect(days).toHaveLength(7);
    expect(days[6]).toEqual({ date: TODAY, done: true });
    expect(days[4].done).toBe(true);
    expect(days[5].done).toBe(false);
  });
});

describe("pickDailyActions", () => {
  it("always starts with the check-in and returns 3 known, distinct actions", () => {
    const score = computeHealthScore(
      [row(-1, { sleep_band: 1, activity_band: 1 })],
      TODAY,
    );
    const picked = pickDailyActions(score, TODAY);
    expect(picked).toHaveLength(3);
    expect(picked[0]).toBe(CHECKIN_ACTION);
    expect(new Set(picked).size).toBe(3);
    expect(picked.every(isActionKey)).toBe(true);
  });
  it("targets the two weakest categories", () => {
    const score = computeHealthScore(
      [row(-1, { sleep_band: 1, activity_band: 1, nutrition: 5 })],
      TODAY,
    );
    const [, a, b] = pickDailyActions(score, TODAY);
    // activity (20 pts) is weaker than sleep (30 pts) at band 1
    expect(ACTION_TEMPLATES.activity).toContain(a);
    expect(ACTION_TEMPLATES.sleep).toContain(b);
  });
  it("starts new users with activity + nutrition", () => {
    const [, a, b] = pickDailyActions(computeHealthScore([], TODAY), TODAY);
    expect(ACTION_TEMPLATES.activity).toContain(a);
    expect(ACTION_TEMPLATES.nutrition).toContain(b);
  });
  it("is stable within a day and rotates between days", () => {
    const score = computeHealthScore([], TODAY);
    expect(pickDailyActions(score, TODAY)).toEqual(
      pickDailyActions(score, TODAY),
    );
    const seen = new Set(
      [0, 1, 2].map((d) => pickDailyActions(score, addDays(TODAY, d)).join()),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
  it("only knows the keys in its templates", () => {
    expect(isActionKey("hack")).toBe(false);
    expect(isActionKey(5)).toBe(false);
    expect(ALL_ACTION_KEYS).toContain("move_walk");
  });
});

describe("hasSustainedLowMood", () => {
  it("fires on three consecutive lowest-mood days, today or ending yesterday", () => {
    expect(
      hasSustainedLowMood(
        [0, -1, -2].map((o) => row(o, { mood: 1 })),
        TODAY,
      ),
    ).toBe(true);
    expect(
      hasSustainedLowMood(
        [-1, -2, -3].map((o) => row(o, { mood: 1 })),
        TODAY,
      ),
    ).toBe(true);
  });
  it("does not fire on gaps, higher moods or stale data", () => {
    expect(
      hasSustainedLowMood(
        [row(0, { mood: 1 }), row(-2, { mood: 1 }), row(-3, { mood: 1 })],
        TODAY,
      ),
    ).toBe(false);
    expect(
      hasSustainedLowMood(
        [row(0, { mood: 1 }), row(-1, { mood: 2 }), row(-2, { mood: 1 })],
        TODAY,
      ),
    ).toBe(false);
    expect(
      hasSustainedLowMood(
        [-5, -6, -7].map((o) => row(o, { mood: 1 })),
        TODAY,
      ),
    ).toBe(false);
    expect(hasSustainedLowMood([], TODAY)).toBe(false);
  });
});

describe("buildHabitView", () => {
  it("marks the check-in action done once today has a row, and ticks from storage", async () => {
    const { buildHabitView } = await import("./view");
    const rows = [row(-1, { sleep_band: 1 })];
    const before = buildHabitView(rows, new Set(), TODAY);
    expect(before.todayRow).toBeNull();
    expect(before.actions[0]).toEqual({ key: CHECKIN_ACTION, done: false });
    expect(before.doneCount).toBe(0);

    const second = before.actions[1].key;
    const after = buildHabitView(
      [...rows, row(0)],
      new Set([second, "not-today"]),
      TODAY,
    );
    expect(after.actions.map((a) => a.key)).toEqual(
      before.actions.map((a) => a.key),
    ); // stable all day
    expect(after.actions.map((a) => a.done)).toEqual([true, true, false]);
    expect(after.doneCount).toBe(2);
    expect(after.streak.current).toBe(2);
  });

  it("flags sustained low mood and exposes a 7-day strip", async () => {
    const { buildHabitView } = await import("./view");
    const rows = [0, -1, -2].map((o) => row(o, { mood: 1 }));
    const v = buildHabitView(rows, new Set(), TODAY);
    expect(v.lowMood).toBe(true);
    expect(v.week).toHaveLength(7);
  });
});
