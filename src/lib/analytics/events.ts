import { z } from "zod";

/**
 * Usage analytics, the pure side. The names of events are decided HERE, in
 * code: the database only checks their shape, and a typo cannot invent a new
 * event. An event never carries content (no answers, values, food or text).
 */
export const EVENTS = [
  "active", // once per user per day, from the signed-in layout
  "quiz_completed", // public quiz; user is null when not signed in
  "signup", // first time the user finishes consent
  "paywall_viewed",
  "order_created",
  "payment_reported",
  "subscribed",
  "food_scanned",
  "lab_scanned",
  "body_scanned",
  "lab_explained",
  "report_generated",
  "vault_uploaded",
  "passport_created",
  "passport_revoked",
  "agent_used",
  "insight_explained",
  "barcode_scanned",
  "voice_used",
  "ask_sent",
  "checkin_done",
  "lead_created",
  "share_made", // detail = what was shared: quiz | lab | food
] as const;
export type ProductEvent = (typeof EVENTS)[number];

export function isProductEvent(v: unknown): v is ProductEvent {
  return typeof v === "string" && (EVENTS as readonly string[]).includes(v);
}

/** A short, safe tag for an event (letters, digits, underscore); anything else is dropped. */
export function cleanDetail(v: unknown): string | null {
  return typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v) ? v : null;
}

const count = z.coerce.number().int().min(0).catch(0);

const schema = z.object({
  days: count,
  dau: count,
  wau: count,
  mau: count,
  daily: z.array(z.object({ day: z.string(), active: count })).catch([]),
  events: z
    .array(z.object({ event: z.string(), total: count, users: count }))
    .catch([]),
  funnel: z
    .object({
      quiz: count,
      signup: count,
      scan: count,
      paywall: count,
      order: count,
      subscribed: count,
    })
    .catch({
      quiz: 0,
      signup: 0,
      scan: 0,
      paywall: 0,
      order: 0,
      subscribed: 0,
    }),
  retention: z
    .object({
      d1_cohort: count,
      d1_back: count,
      d7_cohort: count,
      d7_back: count,
    })
    .catch({ d1_cohort: 0, d1_back: 0, d7_cohort: 0, d7_back: 0 }),
});

export type Analytics = z.infer<typeof schema>;

/** The jsonb from admin_analytics(), validated; null if it is not that shape at all. */
export function parseAnalytics(value: unknown): Analytics | null {
  const r = schema.safeParse(value);
  return r.success ? r.data : null;
}

export const FUNNEL_STEPS = [
  "quiz",
  "signup",
  "scan",
  "paywall",
  "order",
  "subscribed",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export interface FunnelRow {
  step: FunnelStep;
  count: number;
  /** Share of the previous step (null for the first). */
  ofPrevious: number | null;
  /** Share of the first step, for the bar width. */
  ofFirst: number;
}

const pct = (a: number, b: number) =>
  b > 0 ? Math.round((a / b) * 1000) / 10 : null;

/** Steps with their conversion. Not a strict cohort funnel, so a step can exceed the one before it: shown as-is, capped for the bar. */
export function buildFunnel(f: Analytics["funnel"]): FunnelRow[] {
  const top = Math.max(f.quiz, f.signup, 1);
  return FUNNEL_STEPS.map((step, i) => ({
    step,
    count: f[step],
    ofPrevious: i === 0 ? null : pct(f[step], f[FUNNEL_STEPS[i - 1]]),
    ofFirst: Math.min(100, Math.round((f[step] / top) * 100)),
  }));
}

export function retentionRate(back: number, cohort: number): number | null {
  return pct(back, cohort);
}
