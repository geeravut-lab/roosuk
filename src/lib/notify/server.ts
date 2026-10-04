import "server-only";
import { PLANS } from "@/config/plans";
import { getConfiguredSiteUrl } from "@/lib/env";
import { dict, isLang, type Lang } from "@/lib/i18n/dict";
import { addDays, bangkokDate } from "@/lib/health/dates";
import { computeStreak } from "@/lib/health/streak";
import { sweepOrphanFiles } from "@/lib/files/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLineMessage } from "./flex";
import {
  DELIVER_BATCH,
  deliverQueued,
  pushToLine,
  type DeliverDeps,
  type DeliverSummary,
  type QueueRow,
} from "./deliver";
import {
  checkinReminderNotice,
  planExpiringNotice,
  trialEndingNotice,
} from "./messages";
import { safeHref, type Notice } from "./notice";
import {
  bangkokHour,
  checkinReminderKind,
  daysUntil,
  expiryStage,
  parseRules,
  ruleEnabled,
  ruleNumber,
  type RuleSet,
} from "./rules";

/**
 * Notifications, server side. The one writer of notices: a feature calls
 * notifyUser()/notifyAdmins() and gets the in-app row AND the LINE queue row from
 * the same place — and a failure here is logged, never thrown, because the
 * payment already happened and the message already went (docs/07 rule 3).
 */

async function userLang(userId: string): Promise<Lang> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("language")
    .eq("id", userId)
    .maybeSingle<{ language: string | null }>();
  return isLang(data?.language) ? data.language : "th";
}

/** Notice text in the recipient's own language. */
export async function dictFor(userId: string) {
  const lang = await userLang(userId);
  return { lang, t: dict[lang] };
}

export async function notifyUser(
  userId: string,
  notice: Notice,
): Promise<boolean> {
  try {
    const db = createAdminClient();
    const href = safeHref(notice.href);
    const { data: written, error } = await db
      .from("app_notifications")
      .insert({
        user_id: userId,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        href,
        dedupe_key: notice.dedupeKey ?? null,
      })
      .select("id");
    // 23505: this event was already announced to this user (the key is what makes a rule that runs every
    // 10 minutes say it once). Nothing more to write — not in the inbox, not in the LINE queue.
    if (error?.code === "23505") return true;
    if (error || written?.length !== 1) {
      console.error("[notify] inbox insert failed:", error?.message);
      return false;
    }

    // LINE: only for a linked user whose own switches allow this kind of message.
    const [{ data: link }, { data: prefs }] = await Promise.all([
      db
        .from("line_links")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("notification_prefs")
        .select("line_transactional, line_reminders")
        .eq("user_id", userId)
        .maybeSingle<{
          line_transactional: boolean;
          line_reminders: boolean;
        }>(),
    ]);
    const allowed =
      notice.category === "reminder"
        ? (prefs?.line_reminders ?? false)
        : (prefs?.line_transactional ?? true);
    if (link && allowed) {
      // The text is COPIED into the queue row: it must survive inbox clean-ups.
      const { error: qError } = await db.from("notification_queue").insert({
        user_id: userId,
        notification_id: written[0].id,
        dedupe_key: notice.dedupeKey ?? null,
        title: notice.title,
        body: notice.body,
        href,
        urgent: notice.urgent ?? false,
      });
      // 23505 = already queued under this dedupe key: exactly what the key is for.
      if (qError && qError.code !== "23505")
        console.error("[notify] queue insert failed:", qError.message);
    }
    return true;
  } catch (err) {
    console.error("[notify] failed:", err);
    return false;
  }
}

/** Every admin except whoever caused the event. */
export async function notifyAdmins(
  build: (t: (typeof dict)[Lang], lang: Lang) => Notice,
  exceptUserId?: string,
): Promise<number> {
  try {
    const { data } = await createAdminClient()
      .from("admins")
      .select("user_id")
      .returns<{ user_id: string }[]>();
    const ids = (data ?? [])
      .map((a) => a.user_id)
      .filter((id) => id !== exceptUserId);
    let n = 0;
    for (const id of ids) {
      const { t, lang } = await dictFor(id);
      if (await notifyUser(id, build(t, lang))) n++;
    }
    return n;
  } catch (err) {
    console.error("[notify] admins failed:", err);
    return 0;
  }
}

// ── the scheduled tick ─────────────────────────────────────────────────────
const TICK_BUDGET_MS = 20_000;
const CANDIDATE_LIMIT = 1000;

interface TickCtx {
  now: Date;
  today: string;
  rules: RuleSet;
  overBudget(): boolean;
}

async function checkinReminders(c: TickCtx): Promise<number> {
  const hour = ruleNumber(c.rules, "checkin_reminder", "hour", 19, 23);
  if (bangkokHour(c.now) < hour) return 0;
  const minStreak = ruleNumber(
    c.rules,
    "checkin_reminder",
    "min_streak",
    3,
    365,
  );
  const db = createAdminClient();

  // Only people who turned reminders on AND have LINE linked.
  const { data: prefs } = await db
    .from("notification_prefs")
    .select("user_id")
    .eq("line_reminders", true)
    .limit(CANDIDATE_LIMIT)
    .returns<{ user_id: string }[]>();
  const wanted = (prefs ?? []).map((p) => p.user_id);
  if (wanted.length === 0) return 0;
  const { data: links } = await db
    .from("line_links")
    .select("user_id")
    .in("user_id", wanted)
    .returns<{ user_id: string }[]>();
  const ids = (links ?? []).map((l) => l.user_id);
  if (ids.length === 0) return 0;

  const { data: rows } = await db
    .from("daily_checkins")
    .select("user_id, checkin_date")
    .in("user_id", ids)
    .gte("checkin_date", addDays(c.today, -60))
    .returns<{ user_id: string; checkin_date: string }[]>();
  const byUser = new Map<string, string[]>();
  for (const r of rows ?? [])
    (byUser.get(r.user_id) ?? byUser.set(r.user_id, []).get(r.user_id)!).push(
      r.checkin_date,
    );

  let n = 0;
  for (const id of ids) {
    if (c.overBudget()) break;
    const dates = byUser.get(id) ?? [];
    const streak = computeStreak(dates, c.today);
    const kind = checkinReminderKind({
      bangkokHour: bangkokHour(c.now),
      hour,
      checkedToday: streak.checkedToday,
      streak: streak.current,
      minStreak,
    });
    if (!kind) continue;
    const { t } = await dictFor(id);
    const notice = {
      ...checkinReminderNotice(t, kind, streak.current),
      dedupeKey: `checkin:${c.today}`,
    };
    if (await notifyUser(id, notice)) n++;
  }
  return n;
}

async function expiryNotices(
  c: TickCtx,
  rule: "trial_ending" | "plan_expiring",
): Promise<number> {
  const first = ruleNumber(c.rules, rule, "days_first", 3, 60);
  const second = ruleNumber(c.rules, rule, "days_second", 1, 60);
  const horizon = new Date(
    c.now.getTime() + (Math.max(first, second) + 2) * 86_400_000,
  ).toISOString();
  const db = createAdminClient();
  const col = rule === "trial_ending" ? "trial_ends_at" : "plan_expires_at";

  let q = db
    .from("profiles")
    .select("id, plan_tier, plan_expires_at, trial_ends_at")
    .gt(col, c.now.toISOString())
    .lt(col, horizon)
    .limit(CANDIDATE_LIMIT);
  q = rule === "plan_expiring" ? q.in("plan_tier", ["gold", "premium"]) : q;
  const { data } = await q.returns<
    {
      id: string;
      plan_tier: string;
      plan_expires_at: string | null;
      trial_ends_at: string | null;
    }[]
  >();

  let n = 0;
  for (const p of data ?? []) {
    if (c.overBudget()) break;
    const endsAt = new Date(
      (rule === "trial_ending" ? p.trial_ends_at : p.plan_expires_at) as string,
    );
    // A trial that a paid plan already outlives is not "ending".
    if (
      rule === "trial_ending" &&
      p.plan_expires_at &&
      new Date(p.plan_expires_at) > endsAt
    )
      continue;
    const daysLeft = daysUntil(endsAt, c.now);
    if (!expiryStage(daysLeft, first, second)) continue;
    const { t, lang } = await dictFor(p.id);
    const notice =
      rule === "trial_ending"
        ? trialEndingNotice(t, lang, daysLeft as number, endsAt)
        : planExpiringNotice(
            t,
            lang,
            t[`planName_${p.plan_tier as "gold" | "premium"}` as const] ??
              PLANS[p.plan_tier as "gold"].id,
            daysLeft as number,
            endsAt,
          );
    if (await notifyUser(p.id, notice)) n++;
  }
  return n;
}

async function expireQueue(c: TickCtx): Promise<number> {
  const hours = ruleNumber(c.rules, "queue_expire", "hours", 24, 24 * 30);
  const cutoff = new Date(c.now.getTime() - hours * 3_600_000).toISOString();
  const { data } = await createAdminClient()
    .from("notification_queue")
    .update({ status: "skipped", last_error: "expired" })
    .eq("status", "queued")
    .lt("created_at", cutoff)
    .select("id");
  return data?.length ?? 0;
}

async function cleanupOld(c: TickCtx): Promise<number> {
  const days = ruleNumber(c.rules, "cleanup_old", "days", 90, 3650);
  const cutoff = new Date(c.now.getTime() - days * 86_400_000).toISOString();
  const db = createAdminClient();
  const [a, b] = await Promise.all([
    db
      .from("app_notifications")
      .delete()
      .not("read_at", "is", null)
      .lt("created_at", cutoff)
      .select("id"),
    db
      .from("notification_queue")
      .delete()
      .in("status", ["sent", "skipped", "blocked", "failed"])
      .lt("created_at", cutoff)
      .select("id"),
  ]);
  // Kept files whose report/meal was deleted or never attached.
  const files = await sweepOrphanFiles(c.now).catch((err) => {
    console.error("[tick] orphan file sweep failed:", err);
    return 0;
  });
  return (a.data?.length ?? 0) + (b.data?.length ?? 0) + files;
}

function lineDeps(now: Date): DeliverDeps {
  const db = createAdminClient();
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim() || null;
  const base =
    getConfiguredSiteUrl() ?? process.env.URL ?? "https://roosuk.netlify.app";
  const liffId = process.env.LINE_LIFF_ID?.trim() || undefined;
  const monthStart = `${bangkokDate(now).slice(0, 7)}-01T00:00:00+07:00`;

  return {
    token,
    now: () => now,
    async settings() {
      const { data } = await db
        .from("notification_settings")
        .select("line_monthly_cap, line_reserve, halted_until")
        .maybeSingle<{
          line_monthly_cap: number;
          line_reserve: number;
          halted_until: string | null;
        }>();
      return {
        monthlyCap: data?.line_monthly_cap ?? 200,
        reserve: data?.line_reserve ?? 20,
        haltedUntil: data?.halted_until ? new Date(data.halted_until) : null,
      };
    },
    async sentThisMonth() {
      const { count } = await db
        .from("notification_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", monthStart);
      return count ?? 0;
    },
    async fetchDue(limit) {
      const { data } = await db
        .from("notification_queue")
        .select("id, user_id, title, body, href, urgent, attempts")
        .eq("status", "queued")
        .order("urgent", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(limit)
        .returns<QueueRow[]>();
      return data ?? [];
    },
    async lineUserIds(userIds) {
      const { data } = await db
        .from("line_links")
        .select("user_id, line_sub")
        .in("user_id", userIds)
        .returns<{ user_id: string; line_sub: string }[]>();
      return new Map((data ?? []).map((l) => [l.user_id, l.line_sub]));
    },
    async push(to, row, retryKey) {
      const { t } = await dictFor(row.user_id);
      const message = buildLineMessage(row, {
        baseUrl: base,
        liffId,
        openLabel: t.notifOpenApp,
      });
      return pushToLine(token as string, to, message, retryKey);
    },
    async update(id, patch) {
      await db
        .from("notification_queue")
        .update({
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
          ...(patch.lastError !== undefined
            ? { last_error: patch.lastError }
            : {}),
          ...(patch.sentAt !== undefined
            ? { sent_at: patch.sentAt?.toISOString() ?? null }
            : {}),
        })
        .eq("id", id);
    },
    async halt(until, reason) {
      await db
        .from("notification_settings")
        .update({
          halted_until: until.toISOString(),
          halted_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
    },
    async log(code, message) {
      await db.from("ai_events").insert({
        provider: "line",
        task: "config",
        status: "error",
        error_code: code,
        message,
      });
    },
  };
}

export interface TickSummary {
  rules: Record<string, number>;
  line: DeliverSummary;
  stoppedEarlyAt?: string;
}

/**
 * One scheduled run: every enabled rule writes what is due into the queue, then
 * the queue is sent. Each rule records its result so a rule that quietly stops
 * finding anything is visible; -1 means "switched off", 0 "ran, found nothing".
 */
export async function runTick(now = new Date()): Promise<TickSummary> {
  const db = createAdminClient();
  const started = Date.now();
  const { data: tick } = await db.from("cron_ticks").insert({}).select("id");

  let rules: RuleSet;
  try {
    const { data, error } = await db
      .from("automation_rules")
      .select("key, enabled, params")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    rules = parseRules(data);
  } catch (err) {
    console.warn("[rules] could not load, using code defaults:", err);
    rules = parseRules(null);
  }

  const ctx: TickCtx = {
    now,
    today: bangkokDate(now),
    rules,
    overBudget: () => Date.now() - started > TICK_BUDGET_MS,
  };
  const steps: [string, () => Promise<number>][] = [
    ["checkin_reminder", () => checkinReminders(ctx)],
    ["trial_ending", () => expiryNotices(ctx, "trial_ending")],
    ["plan_expiring", () => expiryNotices(ctx, "plan_expiring")],
    ["queue_expire", () => expireQueue(ctx)],
    ["cleanup_old", () => cleanupOld(ctx)],
  ];

  const summary: Record<string, number> = {};
  let stoppedEarlyAt: string | undefined;
  for (const [key, step] of steps) {
    if (ctx.overBudget()) {
      stoppedEarlyAt = key;
      break;
    }
    if (!ruleEnabled(rules, key)) {
      summary[key] = -1;
      continue;
    }
    try {
      summary[key] = await step();
    } catch (err) {
      console.error(`[tick] rule ${key} failed:`, err);
      summary[key] = 0;
      continue;
    }
    await db
      .from("automation_rules")
      .update({ last_run_at: now.toISOString(), last_count: summary[key] })
      .eq("key", key);
  }

  const line = await deliverQueued(lineDeps(now), DELIVER_BATCH);
  const result: TickSummary = {
    rules: summary,
    line,
    ...(stoppedEarlyAt ? { stoppedEarlyAt } : {}),
  };
  if (tick?.[0])
    await db
      .from("cron_ticks")
      .update({ finished_at: new Date().toISOString(), summary: result })
      .eq("id", tick[0].id);
  return result;
}
