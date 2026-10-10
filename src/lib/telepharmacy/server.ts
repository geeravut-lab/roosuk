import "server-only";
import { createHash } from "node:crypto";
import { dict, type ErrorKey, type Lang } from "@/lib/i18n/dict";
import { bangkokDate } from "@/lib/health/dates";
import { isKycVerified } from "@/lib/ekyc/server";
import { dictFor, notifyUser } from "@/lib/notify/server";
import { buildSnapshot, type PassportSnapshot } from "@/lib/passport/passport";
import { loadSnapshotInput } from "@/lib/passport/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  consultMissedNotice,
  consultReminderNotice,
  consultWaitingNotice,
  followUpNotice,
} from "./notices";
import {
  LIVE_STATUSES,
  inOpeningHours,
  isOfferedSlot,
  parseTeleSettings,
  pickText,
  type ConsultStatus,
  type RecordInput,
  type RequestInput,
  type SuggestedProduct,
  type TeleSettings,
} from "./telepharmacy";
import {
  accessKeyMatches,
  hashAccessKey,
  joinUrl,
  makeRoom,
  newAccessKey,
  videoConfigured,
} from "./video";
import { featureEnabled } from "@/lib/flags/server";

const db = () => createAdminClient();

/** The admin's settings. Unreadable settings mean the service is OFF. */
export async function loadTeleSettings(): Promise<TeleSettings> {
  try {
    const { data, error } = await db()
      .from("telepharmacy_settings")
      .select("*")
      .maybeSingle<Record<string, unknown>>();
    if (error) throw error;
    return parseTeleSettings(data);
  } catch (err) {
    console.warn(
      "[telepharmacy] could not read settings, treating as off:",
      err,
    );
    return parseTeleSettings(null);
  }
}

/** Feature flag AND the admin's own switch. */
export async function teleOpen(settings?: TeleSettings): Promise<boolean> {
  if (!(await featureEnabled("telepharmacy"))) return false;
  return (settings ?? (await loadTeleSettings())).enabled;
}

const REASON_ERROR: Record<string, ErrorKey> = {
  off: "err_tele_off",
  kyc: "err_kyc_required",
  closed: "err_tele_closed",
  busy_user: "err_tele_busy_user",
  queue_full: "err_tele_queue_full",
  none_available: "err_tele_none_available",
  bad_slot: "err_tele_slot",
  too_soon: "err_tele_slot",
  too_far: "err_tele_slot",
  taken: "err_tele_slot_taken",
  too_many: "err_tele_too_many",
};
export const reasonError = (r: unknown): ErrorKey =>
  REASON_ERROR[String(r)] ?? "err_save_failed";

// ── the sweep ───────────────────────────────────────────────────────────────
/**
 * Give up on calls nobody took and close ones that ran over, and tell the customers
 * whose call was given up. Called by the scheduled tick AND whenever the queue is read,
 * because the tick only runs every ten minutes and a wait is measured in minutes.
 */
export async function sweepConsults(now = new Date()): Promise<number> {
  const { data, error } = await db().rpc("sweep_consults", {
    p_now: now.toISOString(),
  });
  if (error) {
    console.error("[telepharmacy] sweep failed:", error.message);
    return 0;
  }
  const r = (data ?? {}) as {
    missed?: {
      id: string;
      patient_id: string | null;
      mode: "instant" | "scheduled";
    }[];
    ended?: number;
    offline?: number;
  };
  for (const m of r.missed ?? []) {
    if (!m.patient_id) continue;
    const { t } = await dictFor(m.patient_id);
    await notifyUser(m.patient_id, consultMissedNotice(t, m.id, m.mode));
  }
  return (r.missed?.length ?? 0) + (r.ended ?? 0);
}

// ── what the customer sees before asking ────────────────────────────────────
export interface Availability {
  open: boolean;
  /** somebody could take a call right now */
  available: boolean;
  waiting: number;
}

export async function loadAvailability(
  settings: TeleSettings,
  now = new Date(),
): Promise<Availability> {
  await sweepConsults(now);
  const open = inOpeningHours(settings, now);
  const [count, waiting] = await Promise.all([
    db().rpc("consult_available_count", { p_now: now.toISOString() }),
    db()
      .from("consults")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting"),
  ]);
  const n = typeof count.data === "number" ? count.data : 0;
  return {
    open,
    available:
      settings.enabled &&
      settings.instantEnabled &&
      open &&
      n > 0 &&
      (waiting.count ?? 0) < settings.maxWaiting,
    waiting: waiting.count ?? 0,
  };
}

/** Taken slots, keyed by ISO instant, for the picker. */
export async function loadTakenSlots(
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const { data } = await db()
    .from("consults")
    .select("scheduled_at")
    .eq("mode", "scheduled")
    .in("status", ["booked", "accepted", "done"])
    .gte("scheduled_at", from.toISOString())
    .lte("scheduled_at", to.toISOString())
    .limit(5000)
    .returns<{ scheduled_at: string }[]>();
  const m = new Map<string, number>();
  for (const r of data ?? []) {
    const k = new Date(r.scheduled_at).toISOString();
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// ── asking for a consultation ───────────────────────────────────────────────
export interface HistoryItem {
  at: string;
  pharmacist: string;
  advice: string;
  products: string[];
  followUpOn: string | null;
  followUpOutcome: string | null;
}

export interface ConsultSnapshot {
  v: 1;
  takenAt: string;
  health: PassportSnapshot | null;
  history: HistoryItem[];
}

/** What the person agreed to share, frozen now: nothing else is ever read. */
async function buildConsultSnapshot(
  userId: string,
  items: RequestInput["consentItems"],
  now: Date,
): Promise<ConsultSnapshot | null> {
  const sections: ("profile" | "labs")[] = [];
  if (items.share_profile) sections.push("profile");
  if (items.share_labs) sections.push("labs");
  let health: PassportSnapshot | null = null;
  if (sections.length > 0)
    health = buildSnapshot(await loadSnapshotInput(sections, bangkokDate(now)));
  let history: HistoryItem[] = [];
  if (items.share_history) {
    const { data } = await db()
      .from("consult_records")
      .select(
        "service_at, pharmacist_name, advice, products, follow_up_on, follow_up_outcome",
      )
      .eq("patient_id", userId)
      .not("finalized_at", "is", null)
      .order("service_at", { ascending: false })
      .limit(3)
      .returns<
        {
          service_at: string;
          pharmacist_name: string;
          advice: string;
          products: SuggestedProduct[];
          follow_up_on: string | null;
          follow_up_outcome: string | null;
        }[]
      >();
    history = (data ?? []).map((r) => ({
      at: r.service_at,
      pharmacist: r.pharmacist_name,
      advice: r.advice.slice(0, 600),
      products: r.products.map((p) => p.name),
      followUpOn: r.follow_up_on,
      followUpOutcome: r.follow_up_outcome,
    }));
  }
  if (!health && history.length === 0) return null;
  return { v: 1, takenAt: now.toISOString(), health, history };
}

export type StartResult =
  { ok: true; id: string; key: string } | { ok: false; error: ErrorKey };

/**
 * Open a consult, instant or booked. The database function decides (hours, queue,
 * who is free, the slot); this prepares what it needs: the room, the access key (only
 * its hash is stored), the exact consent text accepted, and the snapshot of what the
 * person chose to share.
 */
export async function startConsult(args: {
  userId: string;
  name: string;
  lang: Lang;
  input: RequestInput;
  now?: Date;
}): Promise<StartResult> {
  const now = args.now ?? new Date();
  const mode = args.input.slot ? "scheduled" : "instant";
  const settings = await loadTeleSettings();
  if (!(await teleOpen(settings))) return { ok: false, error: "err_tele_off" };
  if (mode === "instant" && !settings.instantEnabled)
    return { ok: false, error: "err_tele_off" };
  if (mode === "scheduled" && !settings.scheduledEnabled)
    return { ok: false, error: "err_tele_off" };
  if (settings.requireKycForConsult && !(await isKycVerified(args.userId)))
    return { ok: false, error: "err_kyc_required" };
  if (!videoConfigured(settings.videoProvider))
    return { ok: false, error: "err_tele_video_unavailable" };
  if (mode === "scheduled") {
    if (!isOfferedSlot(settings, now, args.input.slot as string))
      return { ok: false, error: "err_tele_slot" };
  } else if (!inOpeningHours(settings, now)) {
    return { ok: false, error: "err_tele_closed" };
  }

  let productName: string | null = null;
  if (args.input.productId) {
    const { data } = await db()
      .from("shop_products")
      .select("name_th, name_en, active")
      .eq("id", args.input.productId)
      .maybeSingle<{
        name_th: string;
        name_en: string | null;
        active: boolean;
      }>();
    if (!data?.active) return { ok: false, error: "err_invalid_input" };
    productName = (
      args.lang === "en" && data.name_en ? data.name_en : data.name_th
    ).slice(0, 120);
  }

  // the text the person was shown, kept by its hash
  const consentText = pickText(
    args.lang,
    { th: settings.consentTextTh, en: settings.consentTextEn },
    dict[args.lang].teleConsentDraft,
  );
  const consentHash = createHash("sha256")
    .update(`${settings.consentVersion}\n${args.lang}\n${consentText}`)
    .digest("hex");
  await db()
    .from("telepharmacy_consent_texts")
    .upsert(
      {
        text_hash: consentHash,
        version: settings.consentVersion,
        lang: args.lang,
        body: consentText.slice(0, 6000),
      },
      { onConflict: "text_hash", ignoreDuplicates: true },
    );

  const snapshot = await buildConsultSnapshot(
    args.userId,
    args.input.consentItems,
    now,
  );
  const sections = [
    ...(args.input.consentItems.share_profile ? ["profile"] : []),
    ...(args.input.consentItems.share_labs ? ["labs"] : []),
    ...(args.input.consentItems.share_history ? ["history"] : []),
  ];
  const { room } = makeRoom(settings.videoProvider);
  const key = newAccessKey();
  const common = {
    p_patient: args.userId,
    p_patient_name: args.name.slice(0, 80) || "—",
    p_topic: args.input.topic,
    p_product: args.input.productId,
    p_product_name: productName,
    p_intake: args.input.intake,
    p_shared: sections,
    p_snapshot: snapshot,
    p_consent_version: settings.consentVersion,
    p_consent_hash: consentHash,
    p_consent_items: args.input.consentItems,
    p_room: room,
    p_key_hash: hashAccessKey(key),
    p_provider: settings.videoProvider,
    p_now: now.toISOString(),
  };
  const { data, error } =
    mode === "scheduled"
      ? await db().rpc("book_consult_slot", {
          ...common,
          p_at: new Date(args.input.slot as string).toISOString(),
        })
      : await db().rpc("request_instant_consult", common);
  if (error) {
    console.error("[telepharmacy] start failed:", error.message);
    return { ok: false, error: "err_save_failed" };
  }
  const r = data as { ok: boolean; reason?: string; id?: string };
  if (!r.ok || !r.id) return { ok: false, error: reasonError(r.reason) };
  if (mode === "instant") await notifyFreePharmacists(r.id, now);
  return { ok: true, id: r.id, key };
}

/** "A customer is waiting" to the pharmacists who could take it — no topic, no name. */
async function notifyFreePharmacists(consultId: string, now: Date) {
  const { data } = await db()
    .from("pharmacists")
    .select("user_id")
    .eq("online", true)
    .eq("license_verified", true)
    .is("active_consult_id", null)
    .gt("last_seen", new Date(now.getTime() - 120_000).toISOString())
    .limit(50)
    .returns<{ user_id: string }[]>();
  for (const p of data ?? []) {
    const { t } = await dictFor(p.user_id);
    await notifyUser(p.user_id, consultWaitingNotice(t, consultId));
  }
}

// ── the customer's own consults ─────────────────────────────────────────────
export interface PatientConsult {
  id: string;
  mode: "instant" | "scheduled";
  status: ConsultStatus;
  scheduled_at: string | null;
  created_at: string;
  accepted_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  pharmacist_name: string | null;
  pharmacist_license_no: string | null;
  topic: string;
  product_name: string | null;
  consent_version: string;
}
const CONSULT_COLS =
  "id, mode, status, scheduled_at, created_at, accepted_at, ended_at, duration_sec, pharmacist_name, pharmacist_license_no, topic, product_name, consent_version";

export interface PatientRecord {
  consult_id: string;
  service_at: string;
  duration_sec: number | null;
  pharmacist_name: string;
  license_no: string | null;
  advice: string;
  refer_doctor: boolean;
  products: SuggestedProduct[];
  follow_up_on: string | null;
  follow_up_note: string | null;
  follow_up_outcome: string | null;
  follow_up_reply: string | null;
  follow_up_done_at: string | null;
}
const RECORD_COLS =
  "consult_id, service_at, duration_sec, pharmacist_name, license_no, advice, refer_doctor, products, follow_up_on, follow_up_note, follow_up_outcome, follow_up_reply, follow_up_done_at";

export async function loadPatientConsults(
  userId: string,
): Promise<PatientConsult[]> {
  const { data } = await db()
    .from("consults")
    .select(CONSULT_COLS)
    .eq("patient_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<PatientConsult[]>();
  return data ?? [];
}

export async function loadPatientRecords(
  userId: string,
): Promise<Map<string, PatientRecord>> {
  const { data } = await db()
    .from("consult_records")
    .select(RECORD_COLS)
    .eq("patient_id", userId)
    .not("finalized_at", "is", null)
    .limit(100)
    .returns<PatientRecord[]>();
  return new Map((data ?? []).map((r) => [r.consult_id, r]));
}

export interface AccessEntry {
  at: string;
  role: string;
  action: string;
  consultId: string;
}
/** Who opened this person's records, newest first. */
export async function loadAccessLog(userId: string): Promise<AccessEntry[]> {
  const { data } = await db()
    .from("consult_access_log")
    .select("consult_id, actor_role, action, at")
    .eq("patient_id", userId)
    .order("at", { ascending: false })
    .limit(30)
    .returns<
      { consult_id: string; actor_role: string; action: string; at: string }[]
    >();
  return (data ?? []).map((r) => ({
    at: r.at,
    role: r.actor_role,
    action: r.action,
    consultId: r.consult_id,
  }));
}

export async function logAccess(
  consultId: string,
  actorId: string,
  role: "pharmacist" | "patient" | "admin" | "system",
  action: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db().rpc("consult_log_access", {
    p_consult: consultId,
    p_actor: actorId,
    p_role: role,
    p_action: action,
    p_meta: meta,
  });
  if (error) console.error("[telepharmacy] access log failed:", error.message);
}

/** The customer withdraws before it starts. */
export async function cancelConsult(
  userId: string,
  consultId: string,
): Promise<ErrorKey | null> {
  const { data, error } = await db().rpc("cancel_consult", {
    p_patient: userId,
    p_consult: consultId,
  });
  if (error) return "err_save_failed";
  return data === "ok" ? null : "err_tele_state";
}

/** A new access key for a consult that is still live (the old one is gone). Only the signed-in owner can ask. */
export async function rekeyConsult(
  userId: string,
  consultId: string,
): Promise<string | null> {
  const key = newAccessKey();
  const { data, error } = await db()
    .from("consults")
    .update({ access_key_hash: hashAccessKey(key) })
    .eq("id", consultId)
    .eq("patient_id", userId)
    .in("status", [...LIVE_STATUSES])
    .select("id");
  return !error && data?.length === 1 ? key : null;
}

export interface ConsultStatusView {
  status: ConsultStatus;
  pharmacistName: string | null;
  /** only for the owner holding the key, once a pharmacist has taken the call */
  joinUrl: string | null;
  needsKey: boolean;
}

/** What the waiting screen asks every few seconds. The link is given only to the owner who holds the key. */
export async function consultStatusFor(
  userId: string,
  consultId: string,
  key: unknown,
  name: string,
): Promise<ConsultStatusView | null> {
  await sweepConsults();
  const { data } = await db()
    .from("consults")
    .select("status, pharmacist_name, room_name, access_key_hash, provider")
    .eq("id", consultId)
    .eq("patient_id", userId)
    .maybeSingle<{
      status: ConsultStatus;
      pharmacist_name: string | null;
      room_name: string;
      access_key_hash: string;
      provider: "jitsi" | "jaas" | "custom";
    }>();
  if (!data) return null;
  const keyOk = accessKeyMatches(key, data.access_key_hash);
  let url: string | null = null;
  if (data.status === "accepted" && keyOk) {
    url = joinUrl({
      provider: data.provider,
      room: data.room_name,
      role: "patient",
      name,
    });
  }
  return {
    status: data.status,
    pharmacistName: data.pharmacist_name,
    joinUrl: url,
    needsKey: !keyOk && LIVE_STATUSES.includes(data.status),
  };
}

// ── the pharmacist ──────────────────────────────────────────────────────────
export interface PharmacistRow {
  user_id: string;
  display_name: string;
  license_no: string | null;
  license_verified: boolean;
  online: boolean;
  last_seen: string | null;
  active_consult_id: string | null;
}

export async function loadPharmacist(
  userId: string,
): Promise<PharmacistRow | null> {
  const { data } = await db()
    .from("pharmacists")
    .select(
      "user_id, display_name, license_no, license_verified, online, last_seen, active_consult_id",
    )
    .eq("user_id", userId)
    .maybeSingle<PharmacistRow>();
  return data;
}

export async function pharmacistCanServe(userId: string): Promise<boolean> {
  const { data } = await db().rpc("pharmacist_can_serve", { p_user: userId });
  return data === true;
}

export interface QueueItem {
  id: string;
  mode: "instant" | "scheduled";
  status: ConsultStatus;
  patient_name: string | null;
  topic: string;
  product_name: string | null;
  scheduled_at: string | null;
  created_at: string;
}
const QUEUE_COLS =
  "id, mode, status, patient_name, topic, product_name, scheduled_at, created_at";

export async function loadQueue(
  now = new Date(),
): Promise<{ waiting: QueueItem[]; today: QueueItem[] }> {
  await sweepConsults(now);
  const day = bangkokDate(now);
  const start = new Date(`${day}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const [w, b] = await Promise.all([
    db()
      .from("consults")
      .select(QUEUE_COLS)
      .eq("status", "waiting")
      .order("created_at", { ascending: true })
      .limit(50)
      .returns<QueueItem[]>(),
    db()
      .from("consults")
      .select(QUEUE_COLS)
      .eq("status", "booked")
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(100)
      .returns<QueueItem[]>(),
  ]);
  return { waiting: w.data ?? [], today: b.data ?? [] };
}

export interface PharmacistConsult extends PatientConsult {
  patient_name: string | null;
  intake: { medicines?: string; allergies?: string };
  shared_sections: string[];
  snapshot: ConsultSnapshot | null;
  room_name: string;
  provider: "jitsi" | "jaas" | "custom";
  consent_items: Record<string, boolean>;
}

/** Everything about ONE consult, for the pharmacist who owns it. Reading it is logged. */
export async function loadConsultForPharmacist(
  userId: string,
  consultId: string,
  logIt = true,
): Promise<PharmacistConsult | null> {
  const { data } = await db()
    .from("consults")
    .select(
      `${CONSULT_COLS}, patient_name, intake, shared_sections, snapshot, room_name, provider, consent_items`,
    )
    .eq("id", consultId)
    .eq("pharmacist_id", userId)
    .maybeSingle<PharmacistConsult>();
  if (!data) return null;
  if (logIt) await logAccess(consultId, userId, "pharmacist", "open_context");
  return data;
}

export async function claimConsult(
  userId: string,
  consultId: string,
): Promise<{ ok: true } | { ok: false; error: ErrorKey }> {
  const { data, error } = await db().rpc("claim_consult", {
    p_pharmacist: userId,
    p_consult: consultId,
  });
  if (error) return { ok: false, error: "err_save_failed" };
  const r = data as { ok: boolean; reason?: string };
  if (r.ok) {
    await logAccess(consultId, userId, "pharmacist", "claim");
    return { ok: true };
  }
  const map: Record<string, ErrorKey> = {
    taken: "err_tele_taken",
    busy: "err_tele_busy",
    not_allowed: "err_tele_not_allowed",
    not_pharmacist: "err_forbidden",
    not_found: "err_tele_state",
    too_early: "err_tele_too_early",
    expired: "err_tele_state",
  };
  return { ok: false, error: map[r.reason ?? ""] ?? "err_save_failed" };
}

export async function endConsult(
  userId: string,
  consultId: string,
): Promise<ErrorKey | null> {
  const { data, error } = await db().rpc("end_consult", {
    p_actor: userId,
    p_consult: consultId,
    p_reason: "completed",
  });
  if (error) return "err_save_failed";
  if (data === "ok") {
    await logAccess(consultId, userId, "pharmacist", "end");
    return null;
  }
  return data === "forbidden" ? "err_forbidden" : "err_tele_state";
}

export interface RecordRow extends PatientRecord {
  id: string;
  finalized_at: string | null;
}

export async function loadRecordFor(
  consultId: string,
  pharmacistId: string,
): Promise<RecordRow | null> {
  const { data } = await db()
    .from("consult_records")
    .select(`id, finalized_at, ${RECORD_COLS}`)
    .eq("consult_id", consultId)
    .eq("pharmacist_id", pharmacistId)
    .maybeSingle<RecordRow>();
  return data;
}

/**
 * Save the pharmacist's record, as a draft or final. Only the pharmacist of the call;
 * only while it is accepted or done; never after it is final (the database refuses too).
 * Finalising needs advice and a call that has ended.
 */
export async function saveRecord(args: {
  pharmacistId: string;
  consultId: string;
  input: RecordInput;
  finalize: boolean;
}): Promise<ErrorKey | null> {
  const { pharmacistId, consultId, input, finalize } = args;
  const c = await loadConsultForPharmacist(pharmacistId, consultId, false);
  if (!c || (c.status !== "accepted" && c.status !== "done"))
    return "err_tele_state";
  if (finalize && (c.status !== "done" || input.advice.length === 0))
    return c.status !== "done"
      ? "err_tele_end_first"
      : "err_tele_advice_required";
  const existing = await loadRecordFor(consultId, pharmacistId);
  if (existing?.finalized_at) return "err_tele_record_final";
  const now = new Date().toISOString();
  const fields = {
    advice: input.advice,
    refer_doctor: input.referDoctor,
    products: input.products,
    follow_up_on: input.followUpOn,
    follow_up_note: input.followUpNote,
    duration_sec: c.duration_sec,
    ...(finalize ? { finalized_at: now } : {}),
  };
  const { data, error } = existing
    ? await db()
        .from("consult_records")
        .update(fields)
        .eq("id", existing.id)
        .is("finalized_at", null)
        .select("id")
    : await db()
        .from("consult_records")
        .insert({
          consult_id: consultId,
          patient_id: await patientOf(consultId),
          pharmacist_id: pharmacistId,
          pharmacist_name: c.pharmacist_name ?? "—",
          license_no: c.pharmacist_license_no,
          service_at: c.accepted_at ?? c.created_at,
          // the history as it was shared, copied once: the record never reads the person's data again
          patient_context: {
            intake: c.intake,
            shared: c.shared_sections,
            snapshot: c.snapshot,
          },
          ...fields,
        })
        .select("id");
  if (error || data?.length !== 1) {
    console.error("[telepharmacy] saving the record failed:", error?.message);
    return "err_save_failed";
  }
  await logAccess(
    consultId,
    pharmacistId,
    "pharmacist",
    finalize ? "finalize_record" : "save_record",
  );
  return null;
}

async function patientOf(consultId: string): Promise<string | null> {
  const { data } = await db()
    .from("consults")
    .select("patient_id")
    .eq("id", consultId)
    .maybeSingle<{ patient_id: string | null }>();
  return data?.patient_id ?? null;
}

/** The link the pharmacist opens, only for the call they hold. */
export async function pharmacistJoinUrl(
  userId: string,
  consultId: string,
  name: string,
): Promise<string | null> {
  const c = await loadConsultForPharmacist(userId, consultId, false);
  if (!c || c.status !== "accepted") return null;
  await logAccess(consultId, userId, "pharmacist", "join_link");
  return joinUrl({
    provider: c.provider,
    room: c.room_name,
    role: "pharmacist",
    name,
  });
}

export interface HistoryRow {
  id: string;
  status: ConsultStatus;
  mode: "instant" | "scheduled";
  created_at: string;
  accepted_at: string | null;
  duration_sec: number | null;
  recordFinal: boolean;
}

export async function loadPharmacistHistory(
  userId: string,
): Promise<HistoryRow[]> {
  const { data } = await db()
    .from("consults")
    .select("id, status, mode, created_at, accepted_at, duration_sec")
    .eq("pharmacist_id", userId)
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<Omit<HistoryRow, "recordFinal">[]>();
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: recs } = await db()
    .from("consult_records")
    .select("consult_id")
    .in(
      "consult_id",
      rows.map((r) => r.id),
    )
    .not("finalized_at", "is", null)
    .returns<{ consult_id: string }[]>();
  const final = new Set((recs ?? []).map((r) => r.consult_id));
  return rows.map((r) => ({ ...r, recordFinal: final.has(r.id) }));
}

// ── scheduled reminders (from the tick) ─────────────────────────────────────
/** A reminder to each customer whose booked time is close; once per booking. */
export async function sendConsultReminders(
  minutesBefore: number,
  now = new Date(),
): Promise<number> {
  const until = new Date(now.getTime() + minutesBefore * 60_000).toISOString();
  const { data } = await db()
    .from("consults")
    .select("id, patient_id, scheduled_at")
    .eq("mode", "scheduled")
    .eq("status", "booked")
    .is("reminded_at", null)
    .gt("scheduled_at", now.toISOString())
    .lte("scheduled_at", until)
    .limit(200)
    .returns<
      { id: string; patient_id: string | null; scheduled_at: string }[]
    >();
  let n = 0;
  for (const c of data ?? []) {
    if (!c.patient_id) continue;
    const { t, lang } = await dictFor(c.patient_id);
    await notifyUser(
      c.patient_id,
      consultReminderNotice(t, lang, c.id, new Date(c.scheduled_at)),
    );
    const { data: upd } = await db()
      .from("consults")
      .update({ reminded_at: now.toISOString() })
      .eq("id", c.id)
      .is("reminded_at", null)
      .select("id");
    if (upd?.length === 1) n++;
  }
  return n;
}

/** On the day the pharmacist chose, ask the person how the medicine use is going; once per record. */
export async function sendFollowUpNotices(now = new Date()): Promise<number> {
  const today = bangkokDate(now);
  const { data } = await db()
    .from("consult_records")
    .select("id, consult_id, patient_id")
    .not("finalized_at", "is", null)
    .lte("follow_up_on", today)
    .is("follow_up_notified_at", null)
    .not("patient_id", "is", null)
    .limit(200)
    .returns<{ id: string; consult_id: string; patient_id: string }[]>();
  let n = 0;
  for (const r of data ?? []) {
    const { t } = await dictFor(r.patient_id);
    await notifyUser(r.patient_id, followUpNotice(t, r.consult_id));
    const { data: upd } = await db()
      .from("consult_records")
      .update({ follow_up_notified_at: now.toISOString() })
      .eq("id", r.id)
      .is("follow_up_notified_at", null)
      .select("id");
    if (upd?.length === 1) n++;
  }
  return n;
}
