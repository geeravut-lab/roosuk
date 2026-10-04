import { randomInt } from "node:crypto";
import type { CheckinRow } from "@/lib/health/checkin";
import { addDays } from "@/lib/health/dates";
import { computeHealthScore } from "@/lib/health/score";

/**
 * Corporate plan (basic), the pure side. A company gets seats on a plan until a
 * date; what it may learn about its people is limited to anonymous group figures
 * — only from employees who opted in, and only once enough of them did that no one
 * can be picked out (MIN_GROUP).
 */
export const MIN_GROUP = 5;

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A join code: 7 letters/digits without look-alikes (read aloud and typed). */
export function newCompanyCode(): string {
  return Array.from(
    { length: 7 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
}

export function cleanCompanyCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[2-9A-HJ-NP-Z]{6,10}$/.test(v) ? v : null;
}

export interface CompanyInput {
  name: string;
  seats: number;
  tier: "gold" | "premium";
  validUntil: string;
  note: string | null;
  active: boolean;
}

export type CompanyField = "name" | "seats" | "tier" | "validUntil";

export function parseCompanyForm(
  get: (k: string) => unknown,
  today: string,
): { ok: true; value: CompanyInput } | { ok: false; field: CompanyField } {
  const name =
    typeof get("name") === "string"
      ? (get("name") as string).replace(/\s+/g, " ").trim()
      : "";
  if (!name || name.length > 100) return { ok: false, field: "name" };
  const seatsRaw = String(get("seats") ?? "").trim();
  const seats = /^\d{1,6}$/.test(seatsRaw) ? Number(seatsRaw) : 0;
  if (seats < 1 || seats > 100000) return { ok: false, field: "seats" };
  const tier = get("tier");
  if (tier !== "gold" && tier !== "premium")
    return { ok: false, field: "tier" };
  const until = String(get("validUntil") ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(until) ||
    Number.isNaN(Date.parse(`${until}T00:00:00Z`)) ||
    until < today ||
    until > addDays(today, 365 * 5)
  )
    return { ok: false, field: "validUntil" };
  const note =
    typeof get("note") === "string"
      ? (get("note") as string).trim().slice(0, 300)
      : "";
  return {
    ok: true,
    value: {
      name,
      seats,
      tier,
      validUntil: until,
      note: note || null,
      active: get("active") === "on",
    },
  };
}

/** The grant lasts to the end of the last valid day, Bangkok time. */
export function grantEnd(validUntil: string): string {
  return new Date(`${validUntil}T23:59:59+07:00`).toISOString();
}

export interface GroupStats {
  participants: number;
  /** share of participants with at least one check-in in the last 7 days, 0–100 */
  activePercent: number;
  /** average of each participant's own score (last 7 days), over those who have one; null with none */
  avgScore: number | null;
}

/**
 * Anonymous group figures, or null when fewer than MIN_GROUP people opted in —
 * then the company sees only that the group is too small to report on.
 */
export function companyStats(
  people: readonly { checkins: readonly CheckinRow[] }[],
  today: string,
): GroupStats | null {
  if (people.length < MIN_GROUP) return null;
  const from = addDays(today, -6);
  let active = 0;
  const scores: number[] = [];
  for (const p of people) {
    const week = p.checkins.filter(
      (c) => c.checkin_date >= from && c.checkin_date <= today,
    );
    if (week.length > 0) active++;
    const s = computeHealthScore([...p.checkins], today).overall;
    if (s !== null) scores.push(s);
  }
  return {
    participants: people.length,
    activePercent: Math.round((active / people.length) * 100),
    avgScore: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
  };
}
