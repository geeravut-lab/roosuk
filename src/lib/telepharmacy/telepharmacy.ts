import { addDays } from "@/lib/health/dates";

/**
 * Telepharmacy, the pure side: the admin's settings, opening hours and the slot
 * grid, and how the forms of the three people involved (customer, pharmacist, admin)
 * become validated values. The database re-checks the hours and the slots; this file
 * only decides what to OFFER and what a form may carry.
 */
export const VIDEO_PROVIDERS = ["jitsi", "jaas", "custom"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];
export const isVideoProvider = (v: unknown): v is VideoProvider =>
  typeof v === "string" && (VIDEO_PROVIDERS as readonly string[]).includes(v);

export const TOPICS = [
  "general",
  "medicine_use",
  "side_effects",
  "product_choice",
  "other",
] as const;
export type Topic = (typeof TOPICS)[number];
export const isTopic = (v: unknown): v is Topic =>
  typeof v === "string" && (TOPICS as readonly string[]).includes(v);

export type ConsultStatus =
  "waiting" | "booked" | "accepted" | "done" | "missed" | "cancelled";

/** Statuses that still need somebody to do something. */
export const LIVE_STATUSES: readonly ConsultStatus[] = [
  "waiting",
  "booked",
  "accepted",
];

export interface TeleSettings {
  enabled: boolean;
  instantEnabled: boolean;
  scheduledEnabled: boolean;
  /** 0 = Sunday … 6 = Saturday, Bangkok time */
  openDays: number[];
  openFrom: string;
  openTo: string;
  slotMinutes: number;
  slotCapacity: number;
  bookingDaysAhead: number;
  bookingMinLeadMinutes: number;
  maxActiveBookings: number;
  waitTimeoutSec: number;
  maxWaiting: number;
  maxCallMinutes: number;
  videoProvider: VideoProvider;
  consentVersion: string;
  consentTextTh: string;
  consentTextEn: string;
  disclaimerTh: string;
  disclaimerEn: string;
  requireKycForConsult: boolean;
  requireKycForPharmacist: boolean;
  retentionDays: number;
}

/** Fail closed: with nothing readable the service is OFF and every identity check is ON. */
export const DEFAULT_TELE_SETTINGS: TeleSettings = {
  enabled: false,
  instantEnabled: true,
  scheduledEnabled: true,
  openDays: [1, 2, 3, 4, 5, 6],
  openFrom: "09:00",
  openTo: "20:00",
  slotMinutes: 20,
  slotCapacity: 1,
  bookingDaysAhead: 14,
  bookingMinLeadMinutes: 60,
  maxActiveBookings: 3,
  waitTimeoutSec: 180,
  maxWaiting: 3,
  maxCallMinutes: 30,
  videoProvider: "jitsi",
  consentVersion: "draft-1",
  consentTextTh: "",
  consentTextEn: "",
  disclaimerTh: "",
  disclaimerEn: "",
  requireKycForConsult: true,
  requireKycForPharmacist: true,
  retentionDays: 1825,
};

const num = (v: unknown, fb: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const txt = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
export const hhmm = (v: unknown, fb: string): string => {
  const m = /^(\d{2}):(\d{2})/.exec(typeof v === "string" ? v : "");
  return m ? `${m[1]}:${m[2]}` : fb;
};

/** Tolerant: a column from a migration not applied yet falls back to its default. */
export function parseTeleSettings(
  row: Record<string, unknown> | null | undefined,
): TeleSettings {
  const d = DEFAULT_TELE_SETTINGS;
  if (!row) return d;
  const days = Array.isArray(row.open_days)
    ? row.open_days
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : d.openDays;
  return {
    enabled: bool(row.enabled, d.enabled),
    instantEnabled: bool(row.instant_enabled, d.instantEnabled),
    scheduledEnabled: bool(row.scheduled_enabled, d.scheduledEnabled),
    openDays: [...new Set(days)].sort(),
    openFrom: hhmm(row.open_from, d.openFrom),
    openTo: hhmm(row.open_to, d.openTo),
    slotMinutes: num(row.slot_minutes, d.slotMinutes),
    slotCapacity: num(row.slot_capacity, d.slotCapacity),
    bookingDaysAhead: num(row.booking_days_ahead, d.bookingDaysAhead),
    bookingMinLeadMinutes: num(
      row.booking_min_lead_minutes,
      d.bookingMinLeadMinutes,
    ),
    maxActiveBookings: num(row.max_active_bookings, d.maxActiveBookings),
    waitTimeoutSec: num(row.wait_timeout_sec, d.waitTimeoutSec),
    maxWaiting: num(row.max_waiting, d.maxWaiting),
    maxCallMinutes: num(row.max_call_minutes, d.maxCallMinutes),
    videoProvider: isVideoProvider(row.video_provider)
      ? row.video_provider
      : d.videoProvider,
    consentVersion:
      txt(row.consent_version, d.consentVersion) || d.consentVersion,
    consentTextTh: txt(row.consent_text_th, ""),
    consentTextEn: txt(row.consent_text_en, ""),
    disclaimerTh: txt(row.disclaimer_th, ""),
    disclaimerEn: txt(row.disclaimer_en, ""),
    requireKycForConsult: bool(
      row.require_kyc_for_consult,
      d.requireKycForConsult,
    ),
    requireKycForPharmacist: bool(
      row.require_kyc_for_pharmacist,
      d.requireKycForPharmacist,
    ),
    retentionDays: num(row.retention_days, d.retentionDays),
  };
}

/** The consent/disclaimer as written by the admin, else the draft shipped in the dictionary. */
export function pickText(
  lang: "th" | "en",
  admin: { th: string; en: string },
  draft: string,
): string {
  const own = lang === "en" ? admin.en : admin.th;
  return own.trim() || draft;
}

// ── the admin form ──────────────────────────────────────────────────────────
export type TeleField =
  | "openDays"
  | "openFrom"
  | "openTo"
  | "slotMinutes"
  | "slotCapacity"
  | "bookingDaysAhead"
  | "bookingMinLeadMinutes"
  | "maxActiveBookings"
  | "waitTimeoutSec"
  | "maxWaiting"
  | "maxCallMinutes"
  | "videoProvider"
  | "consentVersion"
  | "consentText"
  | "disclaimer"
  | "retentionDays";

const INT_RANGES: [TeleField, string, number, number][] = [
  ["slotMinutes", "slot_minutes", 10, 120],
  ["slotCapacity", "slot_capacity", 1, 20],
  ["bookingDaysAhead", "booking_days_ahead", 1, 60],
  ["bookingMinLeadMinutes", "booking_min_lead_minutes", 0, 1440],
  ["maxActiveBookings", "max_active_bookings", 1, 10],
  ["waitTimeoutSec", "wait_timeout_sec", 30, 1800],
  ["maxWaiting", "max_waiting", 1, 50],
  ["maxCallMinutes", "max_call_minutes", 5, 180],
  ["retentionDays", "retention_days", 30, 36500],
];

/**
 * The admin form → table columns. A number outside its range is an error, never
 * silently clamped. If the consent text changed, the version label MUST change too
 * (a record says which text the person accepted, so a text cannot be edited under
 * an old label).
 */
export function parseTeleForm(
  get: (key: string) => unknown,
  previous: TeleSettings,
):
  | { ok: true; columns: Record<string, unknown> }
  | { ok: false; field: TeleField } {
  const on = (k: string) => get(k) === "on";
  const s = (k: string) =>
    typeof get(k) === "string" ? (get(k) as string) : "";
  const columns: Record<string, unknown> = {
    enabled: on("enabled"),
    instant_enabled: on("instantEnabled"),
    scheduled_enabled: on("scheduledEnabled"),
    require_kyc_for_consult: on("requireKycForConsult"),
    require_kyc_for_pharmacist: on("requireKycForPharmacist"),
  };
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => on(`day${d}`));
  columns.open_days = days;
  const from = /^\d{2}:\d{2}$/.test(s("openFrom")) ? s("openFrom") : null;
  const to = /^\d{2}:\d{2}$/.test(s("openTo")) ? s("openTo") : null;
  if (!from) return { ok: false, field: "openFrom" };
  if (!to || to <= from) return { ok: false, field: "openTo" };
  columns.open_from = from;
  columns.open_to = to;
  for (const [field, col, lo, hi] of INT_RANGES) {
    const raw = s(field).trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < lo || n > hi)
      return { ok: false, field };
    columns[col] = n;
  }
  const provider = s("videoProvider");
  if (!isVideoProvider(provider)) return { ok: false, field: "videoProvider" };
  columns.video_provider = provider;
  const version = s("consentVersion").trim();
  if (version.length < 1 || version.length > 40)
    return { ok: false, field: "consentVersion" };
  const cth = s("consentTextTh").trim();
  const cen = s("consentTextEn").trim();
  const dth = s("disclaimerTh").trim();
  const den = s("disclaimerEn").trim();
  if (cth.length > 4000 || cen.length > 4000)
    return { ok: false, field: "consentText" };
  if (dth.length > 1500 || den.length > 1500)
    return { ok: false, field: "disclaimer" };
  const textChanged =
    cth !== previous.consentTextTh.trim() ||
    cen !== previous.consentTextEn.trim();
  if (textChanged && version === previous.consentVersion)
    return { ok: false, field: "consentVersion" };
  Object.assign(columns, {
    consent_version: version,
    consent_text_th: cth,
    consent_text_en: cen,
    disclaimer_th: dth,
    disclaimer_en: den,
  });
  return { ok: true, columns };
}

// ── hours and slots ─────────────────────────────────────────────────────────
const minutesOf = (hhmmStr: string) => {
  const [h, m] = hhmmStr.split(":").map(Number);
  return h * 60 + m;
};
const BANGKOK_MS = 7 * 3_600_000;

/** Bangkok wall-clock parts of an instant. */
export function bangkokParts(now: Date): {
  date: string;
  minutes: number;
  dow: number;
} {
  const local = new Date(now.getTime() + BANGKOK_MS);
  return {
    date: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    dow: local.getUTCDay(),
  };
}

/** Is the service open at this instant (the same rule the database applies)? */
export function inOpeningHours(s: TeleSettings, now: Date): boolean {
  const p = bangkokParts(now);
  return (
    s.openDays.includes(p.dow) &&
    p.minutes >= minutesOf(s.openFrom) &&
    p.minutes < minutesOf(s.openTo)
  );
}

export interface Slot {
  /** the instant, ISO with the Bangkok offset */
  at: string;
  date: string;
  time: string;
  full: boolean;
}

/**
 * Every bookable slot from now to the booking horizon. `taken` counts the people
 * already holding each instant (key = the ISO string `at`); a slot at capacity is
 * returned as `full` so the picker can show it greyed out rather than hide it.
 */
export function generateSlots(
  s: TeleSettings,
  now: Date,
  taken: ReadonlyMap<string, number> = new Map(),
): Slot[] {
  const out: Slot[] = [];
  const earliest = now.getTime() + s.bookingMinLeadMinutes * 60_000;
  const today = bangkokParts(now).date;
  const open = minutesOf(s.openFrom);
  const close = minutesOf(s.openTo);
  for (let i = 0; i <= s.bookingDaysAhead; i++) {
    const date = addDays(today, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!s.openDays.includes(dow)) continue;
    for (let m = open; m + s.slotMinutes <= close; m += s.slotMinutes) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const at = `${date}T${time}:00+07:00`;
      const t = Date.parse(at);
      if (t < earliest || t > now.getTime() + s.bookingDaysAhead * 86_400_000)
        continue;
      out.push({
        at,
        date,
        time,
        full: (taken.get(new Date(t).toISOString()) ?? 0) >= s.slotCapacity,
      });
    }
  }
  return out;
}

/** True when `at` is exactly one of the bookable instants (used to refuse a made-up time before the database does). */
export function isOfferedSlot(s: TeleSettings, now: Date, at: string): boolean {
  const t = Date.parse(at);
  if (Number.isNaN(t)) return false;
  return generateSlots(s, now).some((x) => Date.parse(x.at) === t);
}

// ── the customer's request ──────────────────────────────────────────────────
export const SHARE_KEYS = [
  "share_profile",
  "share_labs",
  "share_history",
] as const;
export type ShareKey = (typeof SHARE_KEYS)[number];

export interface RequestInput {
  topic: Topic;
  productId: string | null;
  intake: { medicines: string; allergies: string };
  consentItems: {
    consult: true;
    record: true;
  } & Record<ShareKey, boolean>;
  slot: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const oneLine = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * The consent modal's form. The two required items (take part in a video consult;
 * let the pharmacist write a record of it) must BOTH be ticked — without them
 * there is no request. Sharing the profile, the lab results or earlier consult
 * records is a separate, optional choice each.
 */
export function parseRequestForm(
  get: (key: string) => unknown,
):
  | { ok: true; value: RequestInput }
  | { ok: false; error: "err_tele_consent" | "err_invalid_input" } {
  if (get("consent_consult") !== "on" || get("consent_record") !== "on")
    return { ok: false, error: "err_tele_consent" };
  const topic = get("topic");
  if (!isTopic(topic)) return { ok: false, error: "err_invalid_input" };
  const product =
    typeof get("productId") === "string" ? (get("productId") as string) : "";
  if (product && !UUID.test(product))
    return { ok: false, error: "err_invalid_input" };
  const slotRaw =
    typeof get("slot") === "string" ? (get("slot") as string) : "";
  return {
    ok: true,
    value: {
      topic,
      productId: product || null,
      intake: {
        medicines: oneLine(get("medicines"), 300),
        allergies: oneLine(get("allergies"), 300),
      },
      consentItems: {
        consult: true,
        record: true,
        share_profile: get("share_profile") === "on",
        share_labs: get("share_labs") === "on",
        share_history: get("share_history") === "on",
      },
      slot: slotRaw || null,
    },
  };
}

// ── the pharmacist's record ─────────────────────────────────────────────────
export interface SuggestedProduct {
  product_id: string | null;
  name: string;
  note: string;
}

export interface RecordInput {
  advice: string;
  referDoctor: boolean;
  products: SuggestedProduct[];
  followUpOn: string | null;
  followUpNote: string | null;
}

export const MAX_SUGGESTED = 5;

/** `today` is a Bangkok date; a follow-up is between tomorrow and a year away. */
export function parseRecordForm(
  get: (key: string) => unknown,
  today: string,
):
  | { ok: true; value: RecordInput }
  | { ok: false; field: "advice" | "products" | "followUpOn" } {
  const advice = (
    typeof get("advice") === "string" ? (get("advice") as string) : ""
  )
    .replace(/\r\n?/g, "\n")
    .trim();
  if (advice.length > 4000) return { ok: false, field: "advice" };
  const products: SuggestedProduct[] = [];
  for (let i = 0; i < MAX_SUGGESTED; i++) {
    const name = oneLine(get(`product_name_${i}`), 120);
    const pid =
      typeof get(`product_id_${i}`) === "string"
        ? (get(`product_id_${i}`) as string)
        : "";
    const note = oneLine(get(`product_note_${i}`), 200);
    if (!name && !pid) continue;
    if (pid && !UUID.test(pid)) return { ok: false, field: "products" };
    if (!name) return { ok: false, field: "products" };
    products.push({ product_id: pid || null, name, note });
  }
  const f =
    typeof get("followUpOn") === "string"
      ? (get("followUpOn") as string).trim()
      : "";
  let followUpOn: string | null = null;
  if (f) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f <= today || f > addDays(today, 365))
      return { ok: false, field: "followUpOn" };
    followUpOn = f;
  }
  const note = oneLine(get("followUpNote"), 500);
  return {
    ok: true,
    value: {
      advice,
      referDoctor: get("referDoctor") === "on",
      products,
      followUpOn,
      followUpNote: note || null,
    },
  };
}

/** The patient's answer to "how did it go?" — a short free text. */
export function parseFollowUpReply(v: unknown): string | null {
  const s = oneLine(v, 500);
  return s || null;
}

// ── csv (admin report) ──────────────────────────────────────────────────────
/** One CSV cell; a leading = + - @ is neutralised so a spreadsheet cannot run it as a formula. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Whole seconds → "m:ss". */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "–";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
