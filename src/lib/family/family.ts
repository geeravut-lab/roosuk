import type { CheckinRow } from "@/lib/health/checkin";
import { addDays } from "@/lib/health/dates";
import { computeHealthScore } from "@/lib/health/score";
import { computeStreak } from "@/lib/health/streak";
import { isLineSyntheticEmail } from "@/lib/line/login";

/**
 * Family (Premium +1), the pure side. What one family member may let the other
 * see is a short, fixed menu of SUMMARIES — never meals, labs, photos or values.
 * Each is a separate switch, off until the person turns it on.
 */
export const FAMILY_SCOPES = ["checkin", "score"] as const;
export type FamilyScope = (typeof FAMILY_SCOPES)[number];

export function isFamilyScope(v: unknown): v is FamilyScope {
  return (
    typeof v === "string" && (FAMILY_SCOPES as readonly string[]).includes(v)
  );
}

/** The ticked switches, in the menu's own order; anything unknown is dropped. */
export function parseScopes(
  values: readonly FormDataEntryValue[],
): FamilyScope[] {
  return FAMILY_SCOPES.filter((s) => values.includes(s));
}

export type InviteFailure =
  | "invalid"
  | "revoked"
  | "expired"
  | "used"
  | "own"
  | "in_family"
  | "owner_busy"
  | "full";

/** An invite code as typed (lower case, spaces, a pasted link) → what the database should look up, or null. */
export function cleanInviteCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /([A-Za-z0-9]{6,10})\s*$/.exec(raw.trim());
  const code = m?.[1].toUpperCase() ?? "";
  return /^[A-Z0-9]{6,10}$/.test(code) ? code : null;
}

/** "ge•••@gmail.com": enough to recognise, not enough to read out. LINE-only accounts have no email to show. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || isLineSyntheticEmail(email)) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  return `${local.slice(0, 2)}•••@${domain}`;
}

export interface SharedView {
  checkin?: { checkedToday: boolean; streak: number; daysLast7: number };
  score?: {
    overall: number | null;
    trend: number | null;
    focus: string | null;
  };
}

/** The summaries for exactly the switches that are on — a switch that is off is not even computed. */
export function buildSharedView(
  scopes: readonly FamilyScope[],
  rows: readonly CheckinRow[],
  today: string,
): SharedView {
  const out: SharedView = {};
  if (scopes.includes("checkin")) {
    const s = computeStreak(
      rows.map((r) => r.checkin_date),
      today,
    );
    const from = addDays(today, -6);
    out.checkin = {
      checkedToday: s.checkedToday,
      streak: s.current,
      daysLast7: rows.filter(
        (r) => r.checkin_date >= from && r.checkin_date <= today,
      ).length,
    };
  }
  if (scopes.includes("score")) {
    const h = computeHealthScore([...rows], today);
    out.score = { overall: h.overall, trend: h.trend, focus: h.focus };
  }
  return out;
}
