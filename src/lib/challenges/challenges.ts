import { daysBetween } from "@/lib/health/dates";

/**
 * Challenge templates. Each one is a goal about SHOWING UP — days with a
 * check-in, days a meal was logged — never about weight, body shape or calories.
 * The keys are the ones the database allows (a test compares the lists).
 */
export const CHALLENGE_TEMPLATES = {
  streak7: { metric: "checkin_days", target: 7, days: 7 },
  days10of14: { metric: "checkin_days", target: 10, days: 14 },
  meals7of14: { metric: "meal_days", target: 7, days: 14 },
} as const satisfies Record<
  string,
  { metric: "checkin_days" | "meal_days"; target: number; days: number }
>;
export type ChallengeTemplate = keyof typeof CHALLENGE_TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(
  CHALLENGE_TEMPLATES,
) as ChallengeTemplate[];

export function isTemplate(v: unknown): v is ChallengeTemplate {
  return typeof v === "string" && Object.hasOwn(CHALLENGE_TEMPLATES, v);
}

export type ChallengeMode = "solo" | "friend";
export const isMode = (v: unknown): v is ChallengeMode =>
  v === "solo" || v === "friend";

export type Phase = "active" | "done" | "ended";

/** A challenge is done once its participant completed it; otherwise active until its last day, then ended. */
export function phaseOf(a: {
  completedAt: string | null;
  endsOn: string;
  today: string;
}): Phase {
  if (a.completedAt) return "done";
  return a.today <= a.endsOn ? "active" : "ended";
}

/** Whole days left including today (0 once it is over). */
export function daysLeft(endsOn: string, today: string): number {
  return Math.max(0, daysBetween(today, endsOn) + 1);
}

export const progressPercent = (have: number, target: number) =>
  target <= 0
    ? 0
    : Math.max(0, Math.min(100, Math.round((have / target) * 100)));

/** The join link a person shares with a friend. */
export const joinPath = (code: string) =>
  `/challenges?join=${encodeURIComponent(code)}`;
