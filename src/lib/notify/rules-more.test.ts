import { describe, expect, it } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  checkupReminderNotice,
  dietWatchNotice,
  monthlyReportReadyNotice,
  streakLastCallNotice,
} from "./messages";
import {
  checkupReminder,
  reportMonthToAnnounce,
  streakLastCall,
} from "./rules";

describe("reportMonthToAnnounce", () => {
  it("announces the month that just ended, from the chosen day for four days", () => {
    expect(reportMonthToAnnounce("2026-10-01", 2)).toBeNull();
    expect(reportMonthToAnnounce("2026-10-02", 2)).toBe("2026-09");
    expect(reportMonthToAnnounce("2026-10-05", 2)).toBe("2026-09");
    expect(reportMonthToAnnounce("2026-10-06", 2)).toBeNull();
  });
  it("crosses the year", () => {
    expect(reportMonthToAnnounce("2027-01-03", 2)).toBe("2026-12");
  });
});

describe("streakLastCall", () => {
  const base = {
    bangkokHour: 22,
    hour: 21,
    checkedToday: false,
    streak: 9,
    minStreak: 7,
  };
  it("fires only for a long streak, not yet checked in, after the hour", () => {
    expect(streakLastCall(base)).toBe(true);
    expect(streakLastCall({ ...base, checkedToday: true })).toBe(false);
    expect(streakLastCall({ ...base, bangkokHour: 20 })).toBe(false);
    expect(streakLastCall({ ...base, streak: 6 })).toBe(false);
    expect(streakLastCall({ ...base, streak: 0, minStreak: 0 })).toBe(false);
  });
});

describe("checkupReminder", () => {
  const base = {
    today: "2026-10-04",
    annualMonths: 12,
    recheckDays: 90,
    hadOutOfRange: false,
  };
  it("annual: a year after the latest report, not before", () => {
    expect(checkupReminder({ ...base, latestLabDate: "2025-10-04" })).toBe(
      "annual",
    );
    expect(
      checkupReminder({ ...base, latestLabDate: "2025-10-20" }),
    ).toBeNull(); // 349 days
    expect(checkupReminder({ ...base, latestLabDate: "2024-01-01" })).toBe(
      "annual",
    );
  });
  it("re-check: only when some values were outside the range, after the days", () => {
    expect(
      checkupReminder({
        ...base,
        latestLabDate: "2026-06-01",
        hadOutOfRange: true,
      }),
    ).toBe("recheck");
    expect(
      checkupReminder({
        ...base,
        latestLabDate: "2026-06-01",
        hadOutOfRange: false,
      }),
    ).toBeNull();
    expect(
      checkupReminder({
        ...base,
        latestLabDate: "2026-09-01",
        hadOutOfRange: true,
      }),
    ).toBeNull(); // 33 days
  });
  it("a switched-off number (0) disables that kind, and a future date never fires", () => {
    expect(
      checkupReminder({
        ...base,
        annualMonths: 0,
        latestLabDate: "2020-01-01",
      }),
    ).toBeNull();
    expect(
      checkupReminder({
        ...base,
        recheckDays: 0,
        latestLabDate: "2026-06-01",
        hadOutOfRange: true,
      }),
    ).toBeNull();
    expect(
      checkupReminder({
        ...base,
        latestLabDate: "2026-12-01",
        hadOutOfRange: true,
      }),
    ).toBeNull();
  });
});

describe("the new notices", () => {
  const t = dict.th;
  it("link inside the app, are reminders, and carry a dedupe key", () => {
    const a = monthlyReportReadyNotice(t, "2026-09", "กันยายน 2569");
    expect(a).toMatchObject({
      category: "reminder",
      href: "/report?month=2026-09",
      dedupeKey: "report:2026-09",
    });
    expect(a.title).toContain("กันยายน 2569");
    const b = streakLastCallNotice(t, 9, "2026-10-04");
    expect(b).toMatchObject({
      href: "/today/checkin",
      dedupeKey: "streaklast:2026-10-04",
    });
    expect(b.title).toContain("9");
    const c = checkupReminderNotice(t, "th", "recheck", "2026-06-01");
    expect(c).toMatchObject({
      kind: "checkup_recheck",
      href: "/checkup-interest",
      dedupeKey: "checkup:recheck:2026-06-01",
    });
    expect(checkupReminderNotice(t, "th", "annual", "2025-10-04").kind).toBe(
      "checkup_annual",
    );
  });
  it("never diagnose, set weight goals or promise anything", () => {
    const all = [
      dict.th.notifAnnualBody,
      dict.th.notifRecheckBody,
      dict.th.notifReportBody,
      dict.th.notifLastCallBody,
      dict.en.notifAnnualBody,
      dict.en.notifRecheckBody,
      dict.en.notifReportBody,
      dict.en.notifLastCallBody,
    ].join(" ");
    expect(all).not.toMatch(
      /น้ำหนัก|\bweight\b|คุณเป็นโรค|you have (diabetes|cancer)/i,
    );
    expect(dict.th.notifRecheckBody).toContain("ไม่ใช่การวินิจฉัย");
    expect(dict.en.notifRecheckBody).toContain("not a diagnosis");
  });
});

describe("dietWatchNotice", () => {
  it("names the conditions, links to goals and dedupes per week", () => {
    const n = dietWatchNotice(dict.th, ["gout", "diabetes"], "2026-10-05");
    expect(n.kind).toBe("diet_watch");
    expect(n.href).toBe("/goals");
    expect(n.dedupeKey).toBe("diet_watch:2026-10-05");
    expect(n.body).toContain("เกาต์");
    expect(n.body).toContain("เบาหวาน");
  });
});
