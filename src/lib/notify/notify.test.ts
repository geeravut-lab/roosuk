import { describe, expect, it, vi } from "vitest";
import { dict } from "@/lib/i18n/dict";
import {
  DELIVER_BATCH,
  HALT_HOURS,
  MAX_ATTEMPTS,
  deliverQueued,
  pushToLine,
  type DeliverDeps,
  type QueueRow,
} from "./deliver";
import { appOpenUrl, buildLineMessage } from "./flex";
import {
  checkinReminderNotice,
  paymentPaidNotice,
  paymentRejectedNotice,
  planExpiringNotice,
  trialEndingNotice,
} from "./messages";
import { noticeBody, parseNoticeBody, safeHref } from "./notice";
import {
  bangkokHour,
  checkinReminderKind,
  daysUntil,
  expiryStage,
  parseRules,
  ruleEnabled,
  ruleNumber,
} from "./rules";

describe("notice text", () => {
  it("round-trips a summary and labelled rows", () => {
    const body = noticeBody("ชำระเงินเรียบร้อย", [
      ["ใช้ได้ถึง", "3 พ.ย. 2569"],
      ["เลขอ้างอิง", "SLIP-1"],
    ]);
    expect(parseNoticeBody(body)).toEqual([
      { label: null, value: "ชำระเงินเรียบร้อย" },
      { label: "ใช้ได้ถึง", value: "3 พ.ย. 2569" },
      { label: "เลขอ้างอิง", value: "SLIP-1" },
    ]);
  });
  it("keeps an ordinary sentence containing a colon whole", () => {
    expect(
      parseNoticeBody(
        "หมายเหตุสำคัญมากที่ควรอ่านก่อนใช้งานระบบ: โปรดอ่านให้ครบ",
      ),
    ).toEqual([
      {
        label: null,
        value: "หมายเหตุสำคัญมากที่ควรอ่านก่อนใช้งานระบบ: โปรดอ่านให้ครบ",
      },
    ]);
  });
  it("drops empty lines", () => {
    expect(noticeBody("", [["a", "b"]])).toBe("a: b");
    expect(parseNoticeBody("\n\n")).toEqual([]);
  });
  it("accepts only in-app paths as links", () => {
    expect(safeHref("/subscription")).toBe("/subscription");
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "subscription",
      "",
      null,
      undefined,
    ])
      expect(safeHref(bad as string | null)).toBeNull();
    expect(safeHref("/" + "x".repeat(300))).toBeNull();
  });
});

describe("LINE card", () => {
  const opts = { baseUrl: "https://roosuk.netlify.app/", openLabel: "เปิดแอป" };
  it("answers what/when on its own and carries the details in altText", () => {
    const m = buildLineMessage(
      {
        title: "ชำระเงินเรียบร้อย",
        body: noticeBody("เปิดสิทธิ์ Gold แล้ว", [
          ["ใช้ได้ถึง", "3 พ.ย. 2569"],
        ]),
        href: "/subscription",
      },
      opts,
    );
    expect(m.type).toBe("flex");
    expect(m.altText).toBe(
      "ชำระเงินเรียบร้อย — เปิดสิทธิ์ Gold แล้ว · ใช้ได้ถึง 3 พ.ย. 2569",
    );
    expect(JSON.stringify(m.contents)).toContain("ใช้ได้ถึง");
  });
  it("bounds every text so LINE never rejects the card", () => {
    const long = "ก".repeat(2000);
    const m = buildLineMessage(
      {
        title: long,
        body: Array.from({ length: 20 }, (_, i) => `ป้าย${i}: ${long}`).join(
          "\n",
        ),
        href: null,
      },
      opts,
    );
    expect(m.altText.length).toBeLessThanOrEqual(400);
    const parts = (m.contents as { body: { contents: unknown[] } }).body
      .contents;
    expect(parts.length).toBeLessThanOrEqual(9); // title + at most 8 rows
    expect(JSON.stringify(m.contents)).not.toContain("ก".repeat(301));
  });
  it("opens the phone's browser, uses LIFF when configured, and never an external path", () => {
    expect(appOpenUrl("https://roosuk.netlify.app/", "/subscription")).toBe(
      "https://roosuk.netlify.app/subscription?openExternalBrowser=1",
    );
    expect(appOpenUrl("https://x.app", "/a?b=1")).toBe(
      "https://x.app/a?b=1&openExternalBrowser=1",
    );
    expect(appOpenUrl("https://x.app", "/today", "1234-abcd")).toBe(
      "https://liff.line.me/1234-abcd/today",
    );
    expect(appOpenUrl("https://x.app", "https://evil.example")).toBe(
      "https://x.app/today?openExternalBrowser=1",
    );
    expect(appOpenUrl("https://x.app", null)).toBe(
      "https://x.app/today?openExternalBrowser=1",
    );
  });
});

describe("rules", () => {
  it("turns on by default, reads numbers tolerantly, and falls back to the code default", () => {
    const rules = parseRules([
      {
        key: "a",
        enabled: false,
        params: { hour: 21, bad: "x", neg: -1, big: 99999 },
      },
      { key: "b", enabled: true, params: "junk" },
    ]);
    expect(ruleEnabled(rules, "a")).toBe(false);
    expect(ruleEnabled(rules, "b")).toBe(true);
    expect(ruleEnabled(rules, "missing")).toBe(true); // a new rule ships working
    expect(ruleNumber(rules, "a", "hour", 19)).toBe(21);
    for (const p of ["bad", "neg", "big", "nope"])
      expect(ruleNumber(rules, "a", p, 7)).toBe(7);
    expect(ruleNumber(rules, "b", "hour", 19)).toBe(19);
    expect(ruleNumber(parseRules(null), "a", "hour", 19)).toBe(19);
  });
  it("reads the hour in Bangkok, not UTC", () => {
    expect(bangkokHour(new Date("2026-10-10T12:00:00Z"))).toBe(19);
    expect(bangkokHour(new Date("2026-10-10T17:30:00Z"))).toBe(0);
  });
  it("reminds only after the hour, only without a check-in, and mentions a streak only when one is worth keeping", () => {
    const base = {
      bangkokHour: 20,
      hour: 19,
      checkedToday: false,
      streak: 5,
      minStreak: 3,
    };
    expect(checkinReminderKind(base)).toBe("streak");
    expect(checkinReminderKind({ ...base, streak: 2 })).toBe("plain");
    expect(checkinReminderKind({ ...base, streak: 0, minStreak: 0 })).toBe(
      "plain",
    );
    expect(checkinReminderKind({ ...base, bangkokHour: 18 })).toBeNull();
    expect(checkinReminderKind({ ...base, checkedToday: true })).toBeNull();
  });
  it("counts whole Bangkok days to an end date and picks the warning stage", () => {
    const now = new Date("2026-10-10T08:00:00Z"); // 15:00 on the 10th in Bangkok
    expect(daysUntil("2026-10-13T08:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-10-10T16:00:00Z", now)).toBe(0); // 23:00 the same Bangkok day
    expect(daysUntil("2026-10-10T17:30:00Z", now)).toBe(1); // 00:30 the next Bangkok day
    expect(daysUntil("2026-10-09T08:00:00Z", now)).toBeNull();
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("nonsense", now)).toBeNull();
    expect(expiryStage(3, 3, 1)).toBe("first");
    expect(expiryStage(1, 3, 1)).toBe("second");
    expect(expiryStage(2, 3, 1)).toBeNull();
    expect(expiryStage(null, 3, 1)).toBeNull();
  });
});

describe("notice builders", () => {
  const t = dict.th;
  it("write in the recipient's language with a dedupe key where one reminder per event is wanted", () => {
    const paid = paymentPaidNotice(
      t,
      "th",
      "pay-1",
      "Gold",
      new Date("2026-11-03T00:00:00Z"),
    );
    expect(paid).toMatchObject({
      kind: "payment_paid",
      category: "transactional",
      urgent: true,
      href: "/subscription/pay/pay-1",
      dedupeKey: "payment:pay-1:paid",
    });
    expect(paid.body).toContain("Gold");
    expect(paymentPaidNotice(dict.en, "en", "p", "Gold", null).title).toBe(
      "Payment complete",
    );
    const trial = trialEndingNotice(
      t,
      "th",
      3,
      new Date("2026-10-13T08:00:00Z"),
    );
    expect(trial.dedupeKey).toBe("trial:3");
    expect(trial.title).toContain("3");
    expect(
      planExpiringNotice(
        t,
        "th",
        "Premium",
        1,
        new Date("2026-10-11T00:00:00Z"),
      ).dedupeKey,
    ).toMatch(/^plan:2026-10-11:1$/);
    expect(paymentRejectedNotice(t, "p", "ไม่พบยอด").body).toContain(
      "ไม่พบยอด",
    );
    expect(checkinReminderNotice(t, "streak", 7).title).toContain("7");
    expect(checkinReminderNotice(t, "plain", 0)).toMatchObject({
      category: "reminder",
      href: "/today/checkin",
    });
  });
});

// ── the sender: every branch of the error table in docs/07 ──────────────────
const NOW = new Date("2026-10-10T12:00:00Z");
const row = (id: string, o: Partial<QueueRow> = {}): QueueRow => ({
  id,
  user_id: `u-${id}`,
  title: "t",
  body: "b",
  href: null,
  urgent: false,
  attempts: 0,
  ...o,
});

function harness(
  rows: QueueRow[],
  opts: {
    token?: string | null;
    sent?: number;
    cap?: number;
    reserve?: number;
    halted?: Date | null;
    results?: Record<string, { status: number; body?: string }>;
    unlinked?: string[];
  } = {},
) {
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const halts: { until: Date; reason: string }[] = [];
  const logs: string[] = [];
  const pushes: string[] = [];
  const deps: DeliverDeps = {
    token: opts.token === undefined ? "tok" : opts.token,
    now: () => NOW,
    settings: async () => ({
      monthlyCap: opts.cap ?? 200,
      reserve: opts.reserve ?? 20,
      haltedUntil: opts.halted ?? null,
    }),
    sentThisMonth: async () => opts.sent ?? 0,
    fetchDue: async (limit) => rows.slice(0, limit),
    lineUserIds: async (ids) =>
      new Map(
        ids
          .filter((i) => !(opts.unlinked ?? []).includes(i))
          .map((i) => [i, `L-${i}`]),
      ),
    push: async (to, r, key) => {
      pushes.push(`${to}|${key}`);
      return opts.results?.[r.id] ?? { status: 200 };
    },
    update: async (id, patch) => void updates.push({ id, patch }),
    halt: async (until, reason) => void halts.push({ until, reason }),
    log: async (code) => void logs.push(code),
  };
  return { deps, updates, halts, logs, pushes };
}

describe("deliverQueued", () => {
  it("does nothing without a token, and while halted", async () => {
    const a = harness([row("1")], { token: null });
    expect((await deliverQueued(a.deps)).stopped).toBe("no_token");
    expect(a.pushes).toEqual([]);
    const b = harness([row("1")], { halted: new Date(NOW.getTime() + 60_000) });
    expect((await deliverQueued(b.deps)).stopped).toBe("halted");
    expect(b.pushes).toEqual([]);
  });
  it("sends, marks sent, and uses the row id as the retry key", async () => {
    const h = harness([row("1"), row("2")]);
    const s = await deliverQueued(h.deps);
    expect(s).toMatchObject({ sent: 2, stopped: null });
    expect(h.pushes).toEqual(["L-u-1|1", "L-u-2|2"]);
    expect(h.updates[0]).toEqual({
      id: "1",
      patch: { status: "sent", attempts: 1, lastError: null, sentAt: NOW },
    });
  });
  it("counts a 409 as delivered", async () => {
    const h = harness([row("1")], { results: { "1": { status: 409 } } });
    expect((await deliverQueued(h.deps)).sent).toBe(1);
  });
  it("skips users with no LINE link without pushing", async () => {
    const h = harness([row("1")], { unlinked: ["u-1"] });
    expect(await deliverQueued(h.deps)).toMatchObject({ skipped: 1, sent: 0 });
    expect(h.pushes).toEqual([]);
    expect(h.updates[0].patch).toMatchObject({
      status: "skipped",
      lastError: "not_linked",
    });
  });
  it("blocks (never retries) a user id LINE refuses with 400", async () => {
    const h = harness([row("1"), row("2")], {
      results: { "1": { status: 400 } },
    });
    const s = await deliverQueued(h.deps);
    expect(s).toMatchObject({ blocked: 1, sent: 1 });
    expect(h.updates[0].patch).toMatchObject({
      status: "blocked",
      lastError: "target",
    });
  });
  it("halts everything for 6 hours on 401/403 and leaves the row queued", async () => {
    for (const status of [401, 403]) {
      const h = harness([row("1"), row("2")], { results: { "1": { status } } });
      const s = await deliverQueued(h.deps);
      expect(s.stopped).toBe("auth");
      expect(h.pushes).toHaveLength(1);
      expect(h.updates).toEqual([]);
      expect(h.halts[0].until.getTime() - NOW.getTime()).toBe(
        HALT_HOURS * 3_600_000,
      );
      expect(h.logs).toEqual([String(status)]);
    }
  });
  it("stops on LINE's monthly quota 429, but retries an ordinary 429", async () => {
    const m = harness([row("1"), row("2")], {
      results: {
        "1": { status: 429, body: "You have reached your monthly limit" },
      },
    });
    expect((await deliverQueued(m.deps)).stopped).toBe("monthly_quota");
    expect(m.updates[0].patch).toMatchObject({
      status: "skipped",
      lastError: "monthly_quota",
    });
    expect(m.pushes).toHaveLength(1);
    const r = harness([row("1")], {
      results: { "1": { status: 429, body: "rate" } },
    });
    expect(await deliverQueued(r.deps)).toMatchObject({
      retrying: 1,
      stopped: null,
    });
  });
  it("retries 5xx and network failures, then gives up after MAX_ATTEMPTS", async () => {
    const h = harness(
      [row("1"), row("2", { attempts: MAX_ATTEMPTS - 1 }), row("3")],
      {
        results: {
          "1": { status: 503 },
          "2": { status: 500 },
          "3": { status: 0 },
        },
      },
    );
    const s = await deliverQueued(h.deps);
    expect(s).toMatchObject({ retrying: 2, failed: 1 });
    expect(h.updates.find((u) => u.id === "1")!.patch).toEqual({
      attempts: 1,
      lastError: "503",
    });
    expect(h.updates.find((u) => u.id === "2")!.patch).toMatchObject({
      status: "failed",
      attempts: MAX_ATTEMPTS,
    });
    expect(h.updates.find((u) => u.id === "3")!.patch.lastError).toBe(
      "network",
    );
  });
  it("holds the reserve back from reminders but lets urgent messages use it", async () => {
    // cap 10, reserve 3, already sent 7: reminders may not go; an urgent one still can (until 10)
    const h = harness(
      [
        row("u1", { urgent: true }),
        row("u2", { urgent: true }),
        row("u3", { urgent: true }),
        row("u4", { urgent: true }),
        row("r1"),
      ],
      { cap: 10, reserve: 3, sent: 7 },
    );
    const s = await deliverQueued(h.deps);
    expect(s.sent).toBe(3);
    expect(s.stopped).toBe("quota");
    expect(h.pushes.map((p) => p.split("|")[1])).toEqual(["u1", "u2", "u3"]);
    const r = harness([row("r1")], { cap: 10, reserve: 3, sent: 7 });
    expect((await deliverQueued(r.deps)).stopped).toBe("quota");
    expect(r.pushes).toEqual([]);
  });
  it("never sends more than the batch size and does nothing on an empty queue", async () => {
    const many = Array.from({ length: DELIVER_BATCH + 10 }, (_, i) =>
      row(String(i)),
    );
    const h = harness(many);
    expect((await deliverQueued(h.deps)).sent).toBe(DELIVER_BATCH);
    expect(await deliverQueued(harness([]).deps)).toMatchObject({
      sent: 0,
      stopped: null,
    });
  });
});

describe("pushToLine", () => {
  it("posts one flex message with the bearer token and retry key, and maps the status", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    const r = await pushToLine(
      "tok",
      "Uabc",
      { type: "flex" },
      "key-1",
      fetchMock as unknown as typeof fetch,
    );
    expect(r.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect((init.headers as Record<string, string>)["X-Line-Retry-Key"]).toBe(
      "key-1",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      to: "Uabc",
      messages: [{ type: "flex" }],
    });
  });
  it("returns the error body for non-200s and status 0 for a network failure, never throwing", async () => {
    const bad = vi.fn(
      async () => new Response("monthly limit", { status: 429 }),
    );
    expect(
      await pushToLine("t", "U", {}, "k", bad as unknown as typeof fetch),
    ).toEqual({ status: 429, body: "monthly limit" });
    const boom = vi.fn(async () => {
      throw new Error("down");
    });
    expect(
      await pushToLine("t", "U", {}, "k", boom as unknown as typeof fetch),
    ).toEqual({ status: 0 });
  });
});
