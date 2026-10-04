import { daysBetween, bangkokDate } from "@/lib/health/dates";
import { previousMonth } from "@/lib/report/monthly";

/**
 * automation_rules: the table says WHETHER a rule runs and with which numbers;
 * the conditions live here, in typed, tested code (docs/06). Reading the table
 * can fail or be empty — then every rule runs with its code default, because a
 * reminder that goes quiet over a missing settings row is worse than one that
 * ignores an admin's tweak for an hour.
 */
export interface RuleState {
  enabled: boolean;
  params: Record<string, unknown>;
}
export type RuleSet = ReadonlyMap<string, RuleState>;

export function parseRules(
  rows:
    | readonly { key: string; enabled: boolean; params: unknown }[]
    | null
    | undefined,
): RuleSet {
  const map = new Map<string, RuleState>();
  for (const r of rows ?? [])
    map.set(r.key, {
      enabled: !!r.enabled,
      params:
        r.params && typeof r.params === "object" && !Array.isArray(r.params)
          ? (r.params as Record<string, unknown>)
          : {},
    });
  return map;
}

/** A rule with no row is ON: a new rule must ship working, not off. */
export function ruleEnabled(rules: RuleSet, key: string): boolean {
  return rules.get(key)?.enabled ?? true;
}

export function ruleNumber(
  rules: RuleSet,
  key: string,
  param: string,
  fallback: number,
  max = 10_000,
): number {
  const raw = rules.get(key)?.params[param];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
}

// ── conditions ─────────────────────────────────────────────────────────────

/** Hour of day (0–23) in Bangkok. */
export function bangkokHour(now: Date): number {
  return new Date(now.getTime() + 7 * 3_600_000).getUTCHours();
}

export type ReminderKind = "plain" | "streak";

/**
 * Remind only once the evening hour has come, only if there is no check-in yet,
 * and mention the streak only when there is one worth protecting.
 */
export function checkinReminderKind(a: {
  bangkokHour: number;
  hour: number;
  checkedToday: boolean;
  streak: number;
  minStreak: number;
}): ReminderKind | null {
  if (a.checkedToday || a.bangkokHour < a.hour) return null;
  return a.streak >= a.minStreak && a.streak > 0 ? "streak" : "plain";
}

/** Whole Bangkok calendar days from today until `endsAt` (0 = ends today), or null when it is not in the future. */
export function daysUntil(
  endsAt: string | Date | null | undefined,
  now: Date,
): number | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime()) || end <= now) return null;
  return daysBetween(bangkokDate(now), bangkokDate(end));
}

/** Which of the two warning days (if any) this is. */
export function expiryStage(
  daysLeft: number | null,
  first: number,
  second: number,
): "first" | "second" | null {
  if (daysLeft === null) return null;
  if (daysLeft === second) return "second";
  if (daysLeft === first) return "first";
  return null;
}

/**
 * "Your monthly report is ready": from `day` of the month for a few days (so a
 * missed run still catches up; the per-user dedupe key makes it once), the month
 * to announce is the one that just ended.
 */
export function reportMonthToAnnounce(
  today: string,
  day: number,
): string | null {
  const dom = Number(today.slice(8, 10));
  return dom >= day && dom <= day + 3 ? previousMonth(today.slice(0, 7)) : null;
}

/** The late "last call": only for someone with a streak worth saving, not yet checked in, after the hour. */
export function streakLastCall(a: {
  bangkokHour: number;
  hour: number;
  checkedToday: boolean;
  streak: number;
  minStreak: number;
}): boolean {
  return (
    !a.checkedToday &&
    a.bangkokHour >= a.hour &&
    a.streak > 0 &&
    a.streak >= a.minStreak
  );
}

export type CheckupKind = "annual" | "recheck";

/**
 * When to suggest talking to a doctor about a check-up, from the LATEST
 * confirmed lab report only: a year has passed ("annual"), or some values were
 * outside the general range and `recheckDays` have passed ("recheck"). The
 * date of that report is the anchor, so each report is nudged about once.
 */
export function checkupReminder(a: {
  today: string;
  latestLabDate: string;
  hadOutOfRange: boolean;
  annualMonths: number;
  recheckDays: number;
}): CheckupKind | null {
  const age = daysBetween(a.latestLabDate, a.today);
  if (age < 0) return null;
  if (a.annualMonths > 0 && age >= Math.round(a.annualMonths * 30.4))
    return "annual";
  if (a.hadOutOfRange && a.recheckDays > 0 && age >= a.recheckDays)
    return "recheck";
  return null;
}
