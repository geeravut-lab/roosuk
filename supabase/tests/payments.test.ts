import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;
let admin: string;

async function newUser(email: string): Promise<string> {
  await actAsOwner(db);
  return (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
  ).rows[0].id;
}

async function newPayment(
  user: string | null,
  over: Partial<{
    tier: string;
    period: string;
    status: string;
    ref: string;
  }> = {},
): Promise<string> {
  await actAs(db, null, "service_role");
  const r = await db.query<{ id: string }>(
    `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id, status, payer_ref)
     values ($1, $2, $3, 89, '0812345678', $4, $5) returning id`,
    [
      user,
      over.tier ?? "premium",
      over.period ?? "monthly",
      over.status ?? "review",
      over.ref ?? "ref-1",
    ],
  );
  return r.rows[0].id;
}

async function confirm(payment: string) {
  await actAs(db, null, "service_role");
  const r = await db.query<{ r: Record<string, unknown> }>(
    "select public.confirm_payment($1, $2) as r",
    [payment, admin],
  );
  return r.rows[0].r;
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await newUser("a@x.com");
  bob = await newUser("b@x.com");
  admin = await newUser("admin@x.com");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("payments RLS", () => {
  it("lets a user read only their own payments and ledger", async () => {
    const pa = await newPayment(alice);
    await newPayment(bob);
    await confirm(pa);

    await actAs(db, alice);
    const own = await db.query("select id from public.payments");
    expect(own.rows).toHaveLength(1);
    const subs = await db.query("select id from public.user_subscriptions");
    expect(subs.rows).toHaveLength(1);

    await actAs(db, bob);
    expect(
      (await db.query("select id from public.user_subscriptions")).rows,
    ).toHaveLength(0);
  });

  it("never lets a user write payments, subscriptions or call confirm_payment", async () => {
    const p = await newPayment(alice);
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id) values ($1,'gold','monthly',1,'0812345678')`,
        [alice],
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.payments set status = 'paid' where id = $1`,
        [p],
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `delete from public.payments where id = $1`, [p]),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.user_subscriptions (user_id, plan_tier, period, starts_at, ends_at) values ($1,'gold','monthly',now(),now()+interval '1 day')`,
        [alice],
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `select public.confirm_payment($1, $2)`, [p, alice]),
    ).toBe(true);
  });

  it("denies anonymous readers", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, "select id from public.payments")).toBe(true);
  });
});

describe("payments constraints", () => {
  it("requires a payer reference once a payment leaves draft", async () => {
    await actAs(db, null, "service_role");
    expect(
      await isRejected(
        db,
        `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id, status) values ($1,'gold','monthly',49,'0812345678','review')`,
        [alice],
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id, status, payer_ref) values ($1,'gold','monthly',49,'0812345678','review','   ')`,
        [alice],
      ),
    ).toBe(true);
  });

  it("allows a single open draft per user", async () => {
    await actAsOwner(db);
    const u = await newUser("draft@x.com");
    await newPayment(u, { status: "draft", ref: undefined as never });
    expect(
      await isRejected(
        db,
        `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id) values ($1,'gold','monthly',49,'0812345678')`,
        [u],
      ),
    ).toBe(true);
  });

  it("validates the PromptPay id and the amount", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set promptpay_id = '12345'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set promptpay_id = '08123abc78'`,
      ),
    ).toBe(true);
    await db.query(
      `update public.platform_settings set promptpay_id = '0812345678'`,
    );
    await db.query(`update public.platform_settings set promptpay_id = null`);
    expect(
      await isRejected(
        db,
        `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id) values ($1,'gold','monthly',0,'0812345678')`,
        [alice],
      ),
    ).toBe(true);
  });
});

describe("confirm_payment", () => {
  it("marks paid, writes the ledger and sets the plan, once", async () => {
    const u = await newUser("c1@x.com");
    const p = await newPayment(u, { tier: "gold", period: "monthly" });

    const out = await confirm(p);
    expect(out).toMatchObject({ ok: true, granted: true, plan_tier: "gold" });

    await actAsOwner(db);
    const prof = (
      await db.query<{ plan_tier: string; days: number }>(
        `select plan_tier, round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days from public.profiles where id = $1`,
        [u],
      )
    ).rows[0];
    expect(prof.plan_tier).toBe("gold");
    expect(prof.days).toBeGreaterThanOrEqual(28);
    expect(prof.days).toBeLessThanOrEqual(31);

    const pay = (
      await db.query<{
        status: string;
        paid_at: string | null;
        reviewed_by: string;
      }>(
        `select status, paid_at, reviewed_by from public.payments where id = $1`,
        [p],
      )
    ).rows[0];
    expect(pay.status).toBe("paid");
    expect(pay.paid_at).not.toBeNull();
    expect(pay.reviewed_by).toBe(admin);

    // A second confirm (double click) must not extend the plan again.
    expect(await confirm(p)).toMatchObject({
      ok: false,
      reason: "not_in_review",
    });
    const subs = await db.query(
      `select id from public.user_subscriptions where user_id = $1`,
      [u],
    );
    expect(subs.rows).toHaveLength(1);
  });

  it("gives a yearly payment a year", async () => {
    const u = await newUser("c2@x.com");
    const p = await newPayment(u, { tier: "premium", period: "yearly" });
    await confirm(p);
    await actAsOwner(db);
    const days = (
      await db.query<{ days: number }>(
        `select round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days from public.profiles where id = $1`,
        [u],
      )
    ).rows[0].days;
    expect(days).toBeGreaterThanOrEqual(364);
    expect(days).toBeLessThanOrEqual(366);
  });

  it("extends a live plan of the same tier from its expiry, but restarts when the tier changes", async () => {
    const u = await newUser("c3@x.com");
    await confirm(
      await newPayment(u, { tier: "gold", period: "monthly", ref: "r1" }),
    );
    await confirm(
      await newPayment(u, { tier: "gold", period: "monthly", ref: "r2" }),
    );

    await actAsOwner(db);
    let days = (
      await db.query<{ days: number }>(
        `select round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days from public.profiles where id = $1`,
        [u],
      )
    ).rows[0].days;
    expect(days).toBeGreaterThanOrEqual(58);

    await confirm(
      await newPayment(u, { tier: "premium", period: "monthly", ref: "r3" }),
    );
    await actAsOwner(db);
    const prof = (
      await db.query<{ plan_tier: string; days: number }>(
        `select plan_tier, round(extract(epoch from (plan_expires_at - now())) / 86400)::int as days from public.profiles where id = $1`,
        [u],
      )
    ).rows[0];
    expect(prof.plan_tier).toBe("premium");
    days = prof.days;
    expect(days).toBeLessThanOrEqual(31);
  });

  it("only confirms payments that are under review", async () => {
    const u = await newUser("c4@x.com");
    for (const status of ["draft", "rejected", "cancelled", "paid"]) {
      const p = await newPayment(u, { status, ref: "r" });
      expect(await confirm(p)).toMatchObject({
        ok: false,
        reason: "not_in_review",
      });
    }
    expect(await confirm("00000000-0000-0000-0000-000000000000")).toMatchObject(
      { ok: false, reason: "not_found" },
    );
  });

  it("records money from a deleted account without granting anything", async () => {
    const u = await newUser("c5@x.com");
    const p = await newPayment(u);
    await actAsOwner(db);
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(await confirm(p)).toMatchObject({ ok: true, granted: false });
    await actAsOwner(db);
    const row = (
      await db.query<{ status: string; user_id: string | null }>(
        `select status, user_id from public.payments where id = $1`,
        [p],
      )
    ).rows[0];
    expect(row).toEqual({ status: "paid", user_id: null });
  });
});
