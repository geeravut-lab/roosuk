import { z } from "zod";
import { addDays, bangkokDate } from "@/lib/health/dates";

/**
 * Wearable data, the pure side: what a reading may be, which plan may store it,
 * and how a sender's raw row becomes a safe row. Nothing here touches the network
 * or the database. Weight is stored for the person's own record and never turned
 * into a goal, a score or a badge (CLAUDE.md: consistency, never body shape).
 */
export const SOURCES = [
  "apple_health",
  "health_connect",
  "csv",
  "manual",
  "api",
] as const;
export type Source = (typeof SOURCES)[number];

/** Sources that need the person's own, separate consent before they may send. `manual` is the person typing. */
export const CONSENT_SOURCES = [
  "apple_health",
  "health_connect",
  "csv",
  "api",
] as const satisfies readonly Source[];
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}
export function isConsentSource(v: unknown): v is ConsentSource {
  return (
    typeof v === "string" && (CONSENT_SOURCES as readonly string[]).includes(v)
  );
}

export type WearableTier = "none" | "basic" | "full";

export interface TypeSpec {
  unit: string;
  min: number;
  max: number;
  /** the lowest plan that may store it */
  tier: Exclude<WearableTier, "none">;
}

export const OBS_TYPES = {
  steps: { unit: "count", min: 0, max: 100_000, tier: "basic" },
  heart_rate: { unit: "bpm", min: 20, max: 250, tier: "basic" },
  resting_heart_rate: { unit: "bpm", min: 20, max: 200, tier: "basic" },
  sleep_minutes: { unit: "min", min: 0, max: 1440, tier: "basic" },
  weight_kg: { unit: "kg", min: 20, max: 400, tier: "full" },
  bp_systolic: { unit: "mmHg", min: 50, max: 260, tier: "full" },
  bp_diastolic: { unit: "mmHg", min: 30, max: 160, tier: "full" },
  blood_glucose: { unit: "mg/dL", min: 20, max: 800, tier: "full" },
  spo2: { unit: "%", min: 50, max: 100, tier: "full" },
} as const satisfies Record<string, TypeSpec>;
export type ObsType = keyof typeof OBS_TYPES;
export const OBS_TYPE_KEYS = Object.keys(OBS_TYPES) as ObsType[];

export function isObsType(v: unknown): v is ObsType {
  return typeof v === "string" && v in OBS_TYPES;
}

export function tierAllows(tier: WearableTier, type: ObsType): boolean {
  if (tier === "none") return false;
  return tier === "full" || OBS_TYPES[type].tier === "basic";
}

/** A row from a sender: what it is, its number, when. Everything else is optional. */
export const rawObservation = z.object({
  type: z.string(),
  value: z.coerce.number(),
  start: z.string().min(8).max(40),
  end: z.string().min(8).max(40).optional(),
  device: z.string().max(60).optional(),
  external_id: z.string().min(1).max(120).optional(),
});
export type RawObservation = z.infer<typeof rawObservation>;

export interface ObservationRow {
  type: ObsType;
  value: number;
  unit: string;
  start_at: string;
  end_at: string | null;
  source: Source;
  device: string | null;
  external_id: string;
}

export type RejectReason =
  "shape" | "type" | "plan" | "range" | "date" | "future" | "old";

const KEEP_YEARS = 5;

/** `2026-10-01` alone means the start of that day in Bangkok. */
function toIso(v: string): string | null {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+07:00` : v;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function normalizeObservation(
  raw: unknown,
  source: Source,
  tier: WearableTier,
  now: Date,
): { ok: true; row: ObservationRow } | { ok: false; reason: RejectReason } {
  const p = rawObservation.safeParse(raw);
  if (!p.success || !Number.isFinite(p.data.value))
    return { ok: false, reason: "shape" };
  const r = p.data;
  if (!isObsType(r.type)) return { ok: false, reason: "type" };
  if (!tierAllows(tier, r.type)) return { ok: false, reason: "plan" };
  const spec = OBS_TYPES[r.type];
  if (r.value < spec.min || r.value > spec.max)
    return { ok: false, reason: "range" };
  const start = toIso(r.start);
  const end = r.end ? toIso(r.end) : null;
  if (!start || (r.end && !end) || (end && end < start))
    return { ok: false, reason: "date" };
  // a day of slack for clocks and time zones, no more
  if (Date.parse(start) > now.getTime() + 86_400_000)
    return { ok: false, reason: "future" };
  if (
    bangkokDate(new Date(start)) < addDays(bangkokDate(now), -365 * KEEP_YEARS)
  )
    return { ok: false, reason: "old" };
  return {
    ok: true,
    row: {
      type: r.type,
      value: Math.round(r.value * 100) / 100,
      unit: spec.unit,
      start_at: start,
      end_at: end,
      source,
      device: r.device?.trim() || null,
      external_id: r.external_id?.trim() || `${r.type}:${start}`,
    },
  };
}

export interface BatchResult {
  accepted: number;
  rejected: number;
  reasons: Partial<Record<RejectReason, number>>;
}

export const MAX_BATCH = 1000;

/** Splits a batch into rows to store and a tally of why the rest was turned away. */
export function normalizeBatch(
  rows: readonly unknown[],
  source: Source,
  tier: WearableTier,
  now: Date,
): { rows: ObservationRow[]; result: BatchResult } {
  const out: ObservationRow[] = [];
  const reasons: BatchResult["reasons"] = {};
  const seen = new Set<string>();
  let rejected = 0;
  for (const raw of rows.slice(0, MAX_BATCH)) {
    const n = normalizeObservation(raw, source, tier, now);
    if (!n.ok) {
      rejected++;
      reasons[n.reason] = (reasons[n.reason] ?? 0) + 1;
    } else if (!seen.has(n.row.external_id)) {
      // the same thing twice in one batch is one row (an upsert cannot touch a row twice)
      seen.add(n.row.external_id);
      out.push(n.row);
    }
  }
  const over = Math.max(0, rows.length - MAX_BATCH);
  if (over) {
    rejected += over;
    reasons.shape = (reasons.shape ?? 0) + over;
  }
  return { rows: out, result: { accepted: out.length, rejected, reasons } };
}

/** The Authorization header of the ingestion API: `Bearer rsk_<43 chars>`. */
export const TOKEN_PREFIX = "rsk_";
export function parseBearer(header: string | null): string | null {
  const m = /^Bearer (rsk_[A-Za-z0-9_-]{43})$/.exec(header?.trim() ?? "");
  return m ? m[1].slice(TOKEN_PREFIX.length) : null;
}
