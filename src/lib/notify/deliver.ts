/**
 * The LINE sender, as a pure function over injected dependencies so every branch
 * of the error table in docs/07 is testable without LINE. It only ever runs from
 * the scheduled tick — never inside a user's request.
 */
export const MAX_ATTEMPTS = 3;
export const HALT_HOURS = 6;
export const DELIVER_BATCH = 20;

export interface QueueRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  href: string | null;
  urgent: boolean;
  attempts: number;
}

export interface LineSettings {
  monthlyCap: number;
  reserve: number;
  haltedUntil: Date | null;
}

export interface PushResult {
  /** HTTP status, or 0 for a network failure / timeout. */
  status: number;
  body?: string;
}

export interface DeliverDeps {
  token: string | null;
  now(): Date;
  settings(): Promise<LineSettings>;
  /** Messages we sent this calendar month (our own log; LINE's counter can lag). */
  sentThisMonth(): Promise<number>;
  /** Oldest first, urgent first. */
  fetchDue(limit: number): Promise<QueueRow[]>;
  lineUserIds(userIds: string[]): Promise<Map<string, string>>;
  push(
    lineUserId: string,
    row: QueueRow,
    retryKey: string,
  ): Promise<PushResult>;
  update(
    id: string,
    patch: {
      status?: "queued" | "sent" | "skipped" | "blocked" | "failed";
      attempts?: number;
      lastError?: string | null;
      sentAt?: Date | null;
    },
  ): Promise<void>;
  halt(until: Date, reason: string): Promise<void>;
  /** Written for the admin page; never contains message text. */
  log(code: string, message: string): Promise<void>;
}

export interface DeliverSummary {
  sent: number;
  skipped: number;
  blocked: number;
  failed: number;
  retrying: number;
  /** Why the run ended early, if it did. */
  stopped: null | "no_token" | "halted" | "quota" | "auth" | "monthly_quota";
}

export async function deliverQueued(
  deps: DeliverDeps,
  batch = DELIVER_BATCH,
): Promise<DeliverSummary> {
  const out: DeliverSummary = {
    sent: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    retrying: 0,
    stopped: null,
  };
  if (!deps.token) return { ...out, stopped: "no_token" };

  const settings = await deps.settings();
  const now = deps.now();
  if (settings.haltedUntil && settings.haltedUntil > now)
    return { ...out, stopped: "halted" };

  let used = await deps.sentThisMonth();
  const rows = await deps.fetchDue(batch);
  if (rows.length === 0) return out;
  const targets = await deps.lineUserIds([
    ...new Set(rows.map((r) => r.user_id)),
  ]);

  for (const row of rows) {
    // Reminders stop `reserve` short of the cap so a payment result can still go out.
    const limit = row.urgent
      ? settings.monthlyCap
      : settings.monthlyCap - settings.reserve;
    if (used >= limit) {
      // Urgent rows come first, so once one is blocked by the cap nothing urgent is behind it.
      out.stopped = "quota";
      break;
    }

    const to = targets.get(row.user_id);
    if (!to) {
      await deps.update(row.id, { status: "skipped", lastError: "not_linked" });
      out.skipped++;
      continue;
    }

    const r = await deps.push(to, row, row.id);
    const attempts = row.attempts + 1;

    if (r.status === 200 || r.status === 409) {
      // 409: LINE already accepted this retry key — it counts as delivered.
      await deps.update(row.id, {
        status: "sent",
        attempts,
        lastError: null,
        sentAt: now,
      });
      out.sent++;
      used++;
    } else if (r.status === 401 || r.status === 403) {
      // The token is dead or revoked: stop everything for a while, tell the admin.
      const until = new Date(now.getTime() + HALT_HOURS * 3_600_000);
      await deps.halt(until, `LINE answered ${r.status}`);
      await deps.log(
        String(r.status),
        "LINE access token rejected; sending halted",
      );
      out.stopped = "auth";
      break;
    } else if (r.status === 400) {
      // This user id cannot receive from this channel (not a friend / blocked): never retry.
      await deps.update(row.id, {
        status: "blocked",
        attempts,
        lastError: "target",
      });
      out.blocked++;
    } else if (r.status === 429 && /monthly/i.test(r.body ?? "")) {
      await deps.update(row.id, {
        status: "skipped",
        attempts,
        lastError: "monthly_quota",
      });
      await deps.log("429", "LINE monthly message allowance reached");
      out.skipped++;
      out.stopped = "monthly_quota";
      break;
    } else {
      // 5xx, a rate limit or a network failure: try again next tick, up to MAX_ATTEMPTS.
      const code = r.status === 0 ? "network" : String(r.status);
      if (attempts >= MAX_ATTEMPTS) {
        await deps.update(row.id, {
          status: "failed",
          attempts,
          lastError: code,
        });
        out.failed++;
      } else {
        await deps.update(row.id, { attempts, lastError: code });
        out.retrying++;
      }
    }
  }
  return out;
}

/** What the LINE Messaging API answers a push with, mapped to our PushResult (never throws). */
export async function pushToLine(
  token: string,
  to: string,
  message: unknown,
  retryKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  try {
    const res = await fetchImpl("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Line-Retry-Key": retryKey,
      },
      body: JSON.stringify({ to, messages: [message] }),
      signal: AbortSignal.timeout(8000),
    });
    return {
      status: res.status,
      body: res.status === 200 ? undefined : (await res.text()).slice(0, 300),
    };
  } catch {
    return { status: 0 };
  }
}
