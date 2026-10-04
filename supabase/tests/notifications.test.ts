import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

async function newUser(email: string): Promise<string> {
  await actAsOwner(db);
  return (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
  ).rows[0].id;
}

async function notice(
  user: string,
  kind = "payment_paid",
  href: string | null = "/subscription",
) {
  await actAs(db, null, "service_role");
  return (
    await db.query<{ id: string }>(
      `insert into public.app_notifications (user_id, kind, title, body, href) values ($1, $2, 'ชำระเงินเรียบร้อย', 'x', $3) returning id`,
      [user, kind, href],
    )
  ).rows[0].id;
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await newUser("a@x.com");
  bob = await newUser("b@x.com");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("app_notifications", () => {
  it("lets users read, mark read and delete only their own; never create or edit", async () => {
    const a = await notice(alice);
    await notice(bob);
    await actAs(db, alice);
    expect(
      (await db.query(`select 1 from public.app_notifications`)).rows,
    ).toHaveLength(1);
    await db.query(
      `update public.app_notifications set read_at = now() where id = $1`,
      [a],
    );
    expect(
      (
        await db.query(
          `select 1 from public.app_notifications where read_at is not null`,
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `update public.app_notifications set title = 'forged' where id = '${a}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.app_notifications (user_id, kind, title) values ('${alice}', 'x', 'forged')`,
      ),
    ).toBe(true);
    await actAs(db, bob);
    expect(
      (
        await db.query(
          `update public.app_notifications set read_at = now() where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `delete from public.app_notifications where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(0);
    await actAs(db, alice);
    expect(
      (
        await db.query(
          `delete from public.app_notifications where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("accepts any kind (no enum trap) but only in-app links, never external or protocol-relative ones", async () => {
    await notice(alice, "brand_new_kind_nobody_listed", "/today");
    await actAs(db, null, "service_role");
    const bad = (href: string) =>
      isRejected(
        db,
        `insert into public.app_notifications (user_id, kind, title, href) values ('${alice}', 'k', 't', '${href}')`,
      );
    expect(await bad("https://evil.example")).toBe(true);
    expect(await bad("//evil.example")).toBe(true);
    expect(await bad("javascript:alert(1)")).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.app_notifications (user_id, kind, title) values ('${alice}', '  ', 't')`,
      ),
    ).toBe(true);
    await notice(alice, "no_link", null);
  });

  it("denies anonymous access and cascades with the account", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.app_notifications`)).toBe(
      true,
    );
    const u = await newUser("gone@x.com");
    await notice(u);
    await actAsOwner(db);
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (
        await db.query(
          `select 1 from public.app_notifications where user_id = $1`,
          [u],
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe("notification_queue", () => {
  const queue = (user: string, key: string | null, status = "queued") =>
    db.query(
      `insert into public.notification_queue (user_id, dedupe_key, title, status) values ($1, $2, 'เตือน', $3)`,
      [user, key, status],
    );

  it("is invisible and unwritable for users", async () => {
    await actAs(db, null, "service_role");
    await queue(alice, "x");
    for (const [who, role] of [
      [alice, "authenticated"],
      [null, "anon"],
    ] as const) {
      await actAs(db, who, role);
      expect(
        await isRejected(db, `select 1 from public.notification_queue`),
      ).toBe(true);
      expect(
        await isRejected(
          db,
          `insert into public.notification_queue (user_id, title) values ('${alice}', 'x')`,
        ),
      ).toBe(true);
    }
  });

  it("queues the same dedupe key once per user, but allows unkeyed and other users' rows", async () => {
    await actAs(db, null, "service_role");
    await queue(alice, "checkin:2026-10-10");
    await expect(queue(alice, "checkin:2026-10-10")).rejects.toThrow(
      /duplicate key/,
    );
    await queue(bob, "checkin:2026-10-10");
    await queue(alice, "checkin:2026-10-11");
    await queue(alice, null);
    await queue(alice, null);
  });

  it("validates status, channel and links, and keeps the row's text when the inbox row goes", async () => {
    await actAs(db, null, "service_role");
    expect(
      await isRejected(
        db,
        `insert into public.notification_queue (user_id, title, status) values ('${alice}', 't', 'weird')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.notification_queue (user_id, title, channel) values ('${alice}', 't', 'sms')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.notification_queue (user_id, title, href) values ('${alice}', 't', 'https://evil.example')`,
      ),
    ).toBe(true);
    const n = await notice(alice, "copy_test");
    await actAs(db, null, "service_role");
    const q = (
      await db.query<{ id: string }>(
        `insert into public.notification_queue (user_id, notification_id, title, body) values ($1, $2, 'copied title', 'copied body') returning id`,
        [alice, n],
      )
    ).rows[0].id;
    await db.query(`delete from public.app_notifications where id = $1`, [n]);
    const row = (
      await db.query<{ title: string; notification_id: string | null }>(
        `select title, notification_id from public.notification_queue where id = $1`,
        [q],
      )
    ).rows[0];
    expect(row).toEqual({ title: "copied title", notification_id: null });
  });
});

describe("notification_prefs", () => {
  it("defaults to service messages on and reminders off, and is the user's own row", async () => {
    await actAs(db, alice);
    await db.query(
      `insert into public.notification_prefs (user_id) values ($1)`,
      [alice],
    );
    expect(
      (
        await db.query<{
          line_transactional: boolean;
          line_reminders: boolean;
        }>(
          `select line_transactional, line_reminders from public.notification_prefs`,
        )
      ).rows,
    ).toEqual([{ line_transactional: true, line_reminders: false }]);
    await db.query(
      `update public.notification_prefs set line_reminders = true where user_id = $1`,
      [alice],
    );
    await actAs(db, bob);
    expect(
      (await db.query(`select 1 from public.notification_prefs`)).rows,
    ).toHaveLength(0);
    expect(
      await isRejected(
        db,
        `insert into public.notification_prefs (user_id) values ('${alice}')`,
      ),
    ).toBe(true);
    expect(
      (
        await db.query(
          `update public.notification_prefs set line_reminders = false where user_id = $1 returning 1`,
          [alice],
        )
      ).rows,
    ).toHaveLength(0);
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `update public.notification_prefs set user_id = '${bob}' where user_id = '${alice}'`,
      ),
    ).toBe(true);
  });
});

describe("settings, rules and ticks", () => {
  it("seeds one settings row with sane defaults and the five rules, service-role only", async () => {
    await actAs(db, null, "service_role");
    expect(
      (
        await db.query(
          `select line_monthly_cap, line_reserve, halted_until from public.notification_settings`,
        )
      ).rows,
    ).toEqual([
      { line_monthly_cap: 200, line_reserve: 20, halted_until: null },
    ]);
    expect(
      await isRejected(
        db,
        `insert into public.notification_settings (id) values (false)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.notification_settings set line_monthly_cap = -1`,
      ),
    ).toBe(true);
    const keys = (
      await db.query<{ key: string }>(
        `select key from public.automation_rules order by sort_order`,
      )
    ).rows.map((r) => r.key);
    expect(keys).toEqual([
      "checkin_reminder",
      "trial_ending",
      "plan_expiring",
      "queue_expire",
      "cleanup_old",
    ]);
    expect(
      await isRejected(
        db,
        `update public.automation_rules set params = '[]'::jsonb`,
      ),
    ).toBe(true);
    await actAs(db, alice);
    for (const t of ["notification_settings", "automation_rules", "cron_ticks"])
      expect(await isRejected(db, `select 1 from public.${t}`)).toBe(true);
  });

  it("re-running the seed never overwrites what an admin tuned", async () => {
    await actAs(db, null, "service_role");
    await db.query(
      `update public.automation_rules set enabled = false, params = '{"hour": 21}' where key = 'checkin_reminder'`,
    );
    await actAsOwner(db);
    await db.query(
      `insert into public.automation_rules (key, title, params) values ('checkin_reminder', 'x', '{"hour": 19}') on conflict do nothing`,
    );
    const r = (
      await db.query<{ enabled: boolean; params: { hour: number } }>(
        `select enabled, params from public.automation_rules where key = 'checkin_reminder'`,
      )
    ).rows[0];
    expect(r).toEqual({ enabled: false, params: { hour: 21 } });
  });

  it("records ticks", async () => {
    await actAs(db, null, "service_role");
    await db.query(
      `insert into public.cron_ticks (summary, finished_at) values ('{"checkin_reminder": 3}'::jsonb, now())`,
    );
    expect(
      (await db.query(`select 1 from public.cron_ticks`)).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `insert into public.cron_ticks (summary) values ('[]'::jsonb)`,
      ),
    ).toBe(true);
  });
});
