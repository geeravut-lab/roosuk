import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

type Result = {
  allowed: boolean;
  reason: string;
  used: number;
  month_total: number;
};

async function consume(
  user: string,
  feature: string,
  month: string,
  windowStart: string,
  limit: number | null,
  cap: number | null,
): Promise<Result> {
  await actAs(db, null, "service_role");
  const out = await db.query<{ r: Result }>(
    "select public.consume_usage($1, $2, $3::date, $4::date, $5, $6) as r",
    [user, feature, month, windowStart, limit, cap],
  );
  return out.rows[0].r;
}

beforeAll(async () => {
  db = await createTestDb();
  alice = (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ('a@x.com') returning id`,
    )
  ).rows[0].id;
  bob = (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ('b@x.com') returning id`,
    )
  ).rows[0].id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("plan columns and settings defaults", () => {
  it("start as free with no trial, and the settings row carries the owner's prices", async () => {
    await actAsOwner(db);
    const p = (
      await db.query<Record<string, unknown>>(
        "select plan_tier, plan_expires_at, trial_started_at, trial_ends_at, ai_suspended from public.profiles where id = $1",
        [alice],
      )
    ).rows[0];
    expect(p).toEqual({
      plan_tier: "free",
      plan_expires_at: null,
      trial_started_at: null,
      trial_ends_at: null,
      ai_suspended: false,
    });

    const s = (
      await db.query<Record<string, number>>(
        "select trial_days, price_gold_monthly, price_gold_yearly, price_premium_monthly, price_premium_yearly from public.platform_settings",
      )
    ).rows[0];
    expect(s).toEqual({
      trial_days: 14,
      price_gold_monthly: 49,
      price_gold_yearly: 490,
      price_premium_monthly: 89,
      price_premium_yearly: 890,
    });
  });

  it("cannot be changed by the user — not the plan, the trial, nor the suspension flag", async () => {
    await actAs(db, alice);
    for (const sql of [
      `update public.profiles set plan_tier = 'premium' where id = '${alice}'`,
      `update public.profiles set plan_expires_at = now() + interval '1 year' where id = '${alice}'`,
      `update public.profiles set trial_ends_at = now() + interval '1 year' where id = '${alice}'`,
      `update public.profiles set ai_suspended = false where id = '${alice}'`,
    ]) {
      expect(await isRejected(db, sql), sql).toBe(true);
    }
    expect(
      (
        await db.query(
          "update public.profiles set language = 'en' where id = $1 returning id",
          [alice],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("reject invalid values", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `update public.profiles set plan_tier = 'platinum' where id = '${alice}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set trial_days = -1`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set price_gold_monthly = -5`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set plan_overrides = '[]'`,
      ),
    ).toBe(true);
  });
});

describe("consume_usage", () => {
  const MONTH = "2026-10-01";

  it("allows up to the limit, then refuses and stops counting", async () => {
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await consume(alice, "aiChat", MONTH, MONTH, 3, null));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].reason).toBe("quota_exhausted");
    expect(results[2].used).toBe(3);
    await actAsOwner(db);
    expect(
      (
        await db.query<{ used: number }>(
          "select used from public.ai_usage where user_id = $1 and feature = 'aiChat'",
          [alice],
        )
      ).rows[0].used,
    ).toBe(3);
  });

  it("counts unlimited usage too", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (await consume(alice, "foodSnap", MONTH, MONTH, null, null)).allowed,
      ).toBe(true);
    await actAsOwner(db);
    expect(
      (
        await db.query<{ used: number }>(
          "select used from public.ai_usage where user_id = $1 and feature = 'foodSnap'",
          [alice],
        )
      ).rows[0].used,
    ).toBe(5);
  });

  it("applies a multi-month window: used in October still counts in November, resets in January", async () => {
    expect(
      (await consume(alice, "healthQuiz", "2026-10-01", "2026-10-01", 1, null))
        .allowed,
    ).toBe(true);
    // November is inside the Oct–Dec window
    const nov = await consume(
      alice,
      "healthQuiz",
      "2026-11-01",
      "2026-10-01",
      1,
      null,
    );
    expect(nov.allowed).toBe(false);
    expect(nov.reason).toBe("quota_exhausted");
    // January starts a new window
    expect(
      (await consume(alice, "healthQuiz", "2027-01-01", "2027-01-01", 1, null))
        .allowed,
    ).toBe(true);
  });

  it("enforces the fair-use cap across all features, and 0/null means no cap", async () => {
    const m = "2026-12-01";
    expect((await consume(bob, "aiChat", m, m, null, 2)).allowed).toBe(true);
    expect((await consume(bob, "foodSnap", m, m, null, 2)).allowed).toBe(true);
    const blocked = await consume(bob, "labImport", m, m, null, 2);
    expect(blocked).toMatchObject({
      allowed: false,
      reason: "fair_use",
      month_total: 2,
    });
    expect((await consume(bob, "labImport", m, m, null, 0)).allowed).toBe(true);
    expect((await consume(bob, "labImport", m, m, null, null)).allowed).toBe(
      true,
    );
  });

  it("a limit of 0 refuses everything", async () => {
    expect(
      (await consume(bob, "agent", "2026-10-01", "2026-10-01", 0, null))
        .allowed,
    ).toBe(false);
  });

  it("rejects dates that are not the first of a month, and a window starting in the future", async () => {
    await actAs(db, null, "service_role");
    const call = (month: string, ws: string) =>
      db.query(
        "select public.consume_usage($1, 'aiChat', $2::date, $3::date, 1, null)",
        [alice, month, ws],
      );
    await expect(call("2026-10-15", "2026-10-01")).rejects.toThrow(
      /first day of a month/,
    );
    await expect(call("2026-10-01", "2026-09-15")).rejects.toThrow(
      /first day of a month/,
    );
    await expect(call("2026-10-01", "2026-11-01")).rejects.toThrow(
      /must not be after/,
    );
  });
});

describe("access control on usage data", () => {
  it("signed-in users cannot call the gate or write counters, only read their own", async () => {
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `select public.consume_usage('${alice}', 'aiChat', '2026-10-01', '2026-10-01', null, null)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.ai_usage (user_id, feature, period_start, used) values ('${alice}', 'aiChat', '2026-10-01', 0)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.ai_usage set used = 0 where user_id = '${alice}'`,
      ),
    ).toBe(true);
    const own = (
      await db.query<{ user_id: string }>("select user_id from public.ai_usage")
    ).rows;
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((r) => r.user_id === alice)).toBe(true);
  });

  it("anonymous visitors can neither call nor read", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, "select * from public.ai_usage")).toBe(true);
    expect(
      await isRejected(
        db,
        `select public.consume_usage('${alice}', 'aiChat', '2026-10-01', '2026-10-01', null, null)`,
      ),
    ).toBe(true);
  });

  it("deleting a user removes their counters", async () => {
    await actAsOwner(db);
    await db.query("delete from auth.users where id = $1", [bob]);
    expect(
      (
        await db.query("select 1 from public.ai_usage where user_id = $1", [
          bob,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});

describe("plan_specs (admin-edited plan details)", () => {
  it("is an empty object by default, must stay an object, and users cannot write it", async () => {
    await actAsOwner(db);
    const row = (
      await db.query<{ plan_specs: unknown }>(
        "select plan_specs from public.platform_settings",
      )
    ).rows[0];
    expect(row.plan_specs).toEqual({});
    expect(
      await isRejected(
        db,
        "update public.platform_settings set plan_specs = '[]'::jsonb",
      ),
    ).toBe(true);
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set plan_specs = '{"gold":{"vaultMaxFiles":99}}'::jsonb`,
      ),
    ).toBe(true);
  });
});

describe("brand (admin-set app name and pictures)", () => {
  it("is an empty object by default, must stay an object, and users cannot write it", async () => {
    await actAsOwner(db);
    const row = (
      await db.query<{ brand: unknown }>(
        "select brand from public.platform_settings",
      )
    ).rows[0];
    expect(row.brand).toEqual({});
    expect(
      await isRejected(
        db,
        "update public.platform_settings set brand = '[]'::jsonb",
      ),
    ).toBe(true);
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set brand = '{"name_en":"X"}'::jsonb`,
      ),
    ).toBe(true);
  });
});
