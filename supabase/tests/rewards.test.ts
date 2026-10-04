import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // referrer
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // referee
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test'), ('${C}', 'c@x.test');
  `);
});
afterAll(() => db.close());

const q = async <T extends object>(sql: string) => {
  await actAsOwner(db);
  return (await db.query<T>(sql)).rows;
};
const balance = async (u: string) =>
  Number(
    (
      await q<{ s: string }>(
        `select coalesce(sum(amount_thb),0) as s from public.reward_ledger where user_id = '${u}'`,
      )
    )[0].s,
  );
const checkins = (u: string, n: number) =>
  db.exec(
    Array.from(
      { length: n },
      (_, i) =>
        `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ('${u}', current_date - ${i}, 3, 2, 4, 4, 3);`,
    ).join("\n"),
  );

describe("referral codes", () => {
  it("makes one code per person, stable, from a readable alphabet", async () => {
    const [{ c: first }] = await q<{ c: string }>(
      `select public.ensure_referral_code('${A}') as c`,
    );
    const [{ c: again }] = await q<{ c: string }>(
      `select public.ensure_referral_code('${A}') as c`,
    );
    expect(first).toBe(again);
    expect(first).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
    const [{ c: other }] = await q<{ c: string }>(
      `select public.ensure_referral_code('${C}') as c`,
    );
    expect(other).not.toBe(first);
  });
});

describe("attach and qualify", () => {
  let code = "";
  it("attaches a young account once, never to themselves, not with a bad code", async () => {
    code = (
      await q<{ c: string }>(`select public.ensure_referral_code('${A}') as c`)
    )[0].c;
    const att = async (u: string, c: string) =>
      (
        await q<{ r: string }>(
          `select public.attach_referral('${u}', '${c}') as r`,
        )
      )[0].r;
    expect(await att(A, code)).toBe("self");
    expect(await att(B, "ZZZZZZZ")).toBe("invalid");
    expect(await att(B, ` ${code.toLowerCase()} `)).toBe("ok");
    expect(await att(B, code)).toBe("already");
    await actAsOwner(db);
    await db.exec(
      `update public.profiles set created_at = now() - interval '30 days' where id = '${C}'`,
    );
    expect(await att(C, code)).toBe("too_late");
  });

  it("pays the referrer only after enough check-in days, once, with the admin's amounts", async () => {
    const qual = async () =>
      (
        await q<{
          r: {
            qualified: boolean;
            referrer?: string;
            referrer_amount?: number;
            referee_amount?: number;
          };
        }>(`select public.qualify_referral('${B}') as r`)
      )[0].r;
    expect((await qual()).qualified).toBe(false); // no check-ins yet
    await actAsOwner(db);
    await checkins(B, 2);
    expect((await qual()).qualified).toBe(false); // 2 < 3
    await db.exec(
      `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ('${B}', current_date - 5, 3, 2, 4, 4, 3)`,
    );
    const r = await qual();
    expect(r).toMatchObject({
      qualified: true,
      referrer: A,
      referrer_amount: 10,
      referee_amount: 0,
    });
    expect(await balance(A)).toBe(10);
    expect(await balance(B)).toBe(0); // referee bonus is off by default
    expect((await qual()).qualified).toBe(false); // already qualified: nothing again
    expect(await balance(A)).toBe(10);
  });

  it("follows the admin's numbers: a referee bonus, a lifetime cap, zero switches it off", async () => {
    await actAsOwner(db);
    await db.exec(
      `update public.platform_settings set reward_referee_thb = 5, reward_referral_thb = 12, referral_max_rewards = 1, referral_min_checkin_days = 1`,
    );
    await db.exec(
      `insert into public.referrals (referee_id, referrer_id) values ('${C}', '${A}')`,
    );
    await checkins(C, 1);
    const [{ r }] = await q<{
      r: { referrer_amount: number; referee_amount: number };
    }>(`select public.qualify_referral('${C}') as r`);
    // A already has one referral reward and the cap is 1: no second one; the referee still gets the bonus
    expect(r).toMatchObject({ referrer_amount: 0, referee_amount: 5 });
    expect(await balance(A)).toBe(10);
    expect(await balance(C)).toBe(5);
    await db.exec(
      `update public.platform_settings set reward_referee_thb = 0, reward_referral_thb = 10, referral_max_rewards = 20, referral_min_checkin_days = 3`,
    );
  });
});

describe("the ledger and spending", () => {
  it("a grant is recorded once per thing it was earned for", async () => {
    await actAsOwner(db);
    const grant = `insert into public.reward_ledger (user_id, kind, amount_thb, ref) values ('${A}', 'challenge_reward', 15, 'ch-1')`;
    await db.exec(grant);
    expect(await isRejected(db, grant)).toBe(true);
    expect(await balance(A)).toBe(25);
  });

  it("signs are enforced: grants add, redemptions subtract", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `insert into public.reward_ledger (user_id, kind, amount_thb) values ('${A}', 'referral_reward', -5)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.reward_ledger (user_id, kind, amount_thb) values ('${A}', 'redeem_subscription', 5)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.reward_ledger (user_id, kind, amount_thb) values ('${A}', 'challenge_reward', 0)`,
      ),
    ).toBe(true);
  });

  it("redeem_credit refuses more than the balance and only for redemption kinds", async () => {
    const red = async (u: string, n: number, kind = "redeem_subscription") =>
      (
        await q<{ r: boolean }>(
          `select public.redeem_credit('${u}', ${n}, '${kind}', 'x') as r`,
        )
      )[0].r;
    expect(await red(A, 26)).toBe(false);
    expect(await red(A, 0)).toBe(false);
    expect(await red(A, 5, "referral_reward")).toBe(false);
    expect(await red(A, 25)).toBe(true);
    expect(await balance(A)).toBe(0);
    expect(await red(A, 1)).toBe(false);
  });

  it("people read their own rows only and cannot write the wallet or the settings", async () => {
    await actAs(db, C);
    const mine = await db.query<{ user_id: string }>(
      `select distinct user_id from public.reward_ledger`,
    );
    expect(mine.rows).toEqual([{ user_id: C }]);
    expect(
      await isRejected(
        db,
        `insert into public.reward_ledger (user_id, kind, amount_thb) values ('${C}', 'admin_adjust', 999)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `update public.reward_ledger set amount_thb = 999`),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.reward_ledger`)).toBe(true);
    expect(
      await isRejected(
        db,
        `select public.redeem_credit('${C}', 1, 'redeem_subscription', 'x')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set reward_referral_thb = 1000`,
      ),
    ).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.reward_ledger`)).toBe(
      true,
    );
  });

  it("a referrer sees their referrals, a stranger does not", async () => {
    await actAs(db, A);
    expect((await db.query(`select 1 from public.referrals`)).rows.length).toBe(
      2,
    );
    await actAs(db, B);
    expect((await db.query(`select 1 from public.referrals`)).rows.length).toBe(
      1,
    );
    expect(
      await isRejected(
        db,
        `insert into public.referrals (referee_id, referrer_id) values ('${B}', '${C}')`,
      ),
    ).toBe(true);
  });
});

describe("paying with credit", () => {
  const pay = async (credit: number) => {
    await actAsOwner(db);
    const r = await db.query<{ id: string }>(
      `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id, credit_applied_thb)
       values ('${C}', 'gold', 'monthly', 39, '0812345678', ${credit}) returning id`,
    );
    return r.rows[0].id;
  };
  const consume = async (id: string) =>
    (
      await q<{ r: boolean }>(
        `select public.consume_payment_credit('${id}') as r`,
      )
    )[0].r;
  const refund = async (id: string) =>
    (
      await q<{ r: boolean }>(
        `select public.refund_payment_credit('${id}') as r`,
      )
    )[0].r;

  it("spends the credit once when reported, and gives it back once when rejected", async () => {
    expect(await balance(C)).toBe(5);
    const id = await pay(5);
    expect(await consume(id)).toBe(true);
    expect(await balance(C)).toBe(0);
    expect(await consume(id)).toBe(true); // a double click spends nothing more
    expect(await balance(C)).toBe(0);
    expect(await refund(id)).toBe(true);
    expect(await balance(C)).toBe(5);
    expect(await refund(id)).toBe(false); // nothing left to give back
    expect(await balance(C)).toBe(5);
    expect(await consume(id)).toBe(true); // re-reported after a rejection: spent again
    expect(await balance(C)).toBe(0);
    await actAsOwner(db);
    await db.exec(
      `update public.payments set status = 'cancelled' where id = '${id}'`,
    );
  });

  it("a payment with more credit than the balance cannot be consumed; no credit means nothing to do", async () => {
    const id = await pay(50);
    expect(await consume(id)).toBe(false);
    expect(await balance(C)).toBe(0);
    await actAsOwner(db);
    await db.exec(
      `update public.payments set status = 'cancelled' where id = '${id}'`,
    );
    const free = await pay(0);
    expect(await consume(free)).toBe(true);
    expect(await refund(free)).toBe(false);
  });
});
