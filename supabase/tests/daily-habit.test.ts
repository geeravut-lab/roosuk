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

const today = async () =>
  (await db.query<{ d: string }>(`select public.bangkok_today()::text as d`))
    .rows[0].d;

const insertCheckin = (user: string, date: string) =>
  `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition)
   values ('${user}', '${date}', 3, 2, 4, 4, 3)`;

beforeAll(async () => {
  db = await createTestDb();
  alice = await newUser("a@x.com");
  bob = await newUser("b@x.com");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("bangkok_today", () => {
  it("is the Bangkok calendar day (UTC+7)", async () => {
    const r = await db.query<{ ok: boolean }>(
      `select public.bangkok_today() = (now() + interval '7 hours')::date as ok`,
    );
    expect(r.rows[0].ok).toBe(true);
  });
});

describe("daily_checkins", () => {
  it("lets a user record and correct today's check-in, and read only their own", async () => {
    const d = await today();
    await actAs(db, alice);
    await db.query(insertCheckin(alice, d));
    await db.query(
      `update public.daily_checkins set mood = 5 where user_id = $1 and checkin_date = $2`,
      [alice, d],
    );
    expect(
      (
        await db.query<{ mood: number }>(
          `select mood from public.daily_checkins`,
        )
      ).rows,
    ).toEqual([{ mood: 5 }]);

    await actAs(db, bob);
    expect(
      (await db.query(`select 1 from public.daily_checkins`)).rows,
    ).toHaveLength(0);
  });

  it("refuses back-dated or future check-ins and check-ins for someone else", async () => {
    const d = await today();
    await actAs(db, bob);
    expect(await isRejected(db, insertCheckin(bob, "2020-01-01"))).toBe(true);
    expect(await isRejected(db, insertCheckin(bob, "2999-01-01"))).toBe(true);
    expect(await isRejected(db, insertCheckin(alice, d))).toBe(true);
  });

  it("refuses out-of-range answers and a second row for the same day", async () => {
    const d = await today();
    await actAs(db, bob);
    expect(
      await isRejected(
        db,
        `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ('${bob}', '${d}', 5, 2, 4, 4, 3)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ('${bob}', '${d}', 3, 2, 6, 4, 3)`,
      ),
    ).toBe(true);
    await db.query(insertCheckin(bob, d));
    expect(await isRejected(db, insertCheckin(bob, d))).toBe(true);
  });

  it("makes earlier days read-only history (but erasable), and never lets a user move a row", async () => {
    await actAsOwner(db);
    const u = await newUser("hist@x.com");
    await actAsOwner(db);
    await db.query(
      `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition)
       values ($1, public.bangkok_today() - 3, 3, 3, 3, 3, 3)`,
      [u],
    );
    await actAs(db, u);
    const upd = await db.query(
      `update public.daily_checkins set mood = 1 where user_id = $1 returning 1`,
      [u],
    );
    expect(upd.rows).toHaveLength(0); // RLS hides the old row from UPDATE
    // owner/date columns cannot be updated at all (column grants)
    await db.query(insertCheckin(u, await today()));
    expect(
      await isRejected(
        db,
        `update public.daily_checkins set checkin_date = checkin_date - 1 where user_id = '${u}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.daily_checkins set user_id = '${alice}' where user_id = '${u}'`,
      ),
    ).toBe(true);
    const del = await db.query(
      `delete from public.daily_checkins where user_id = $1 and checkin_date < public.bangkok_today() returning 1`,
      [u],
    );
    expect(del.rows).toHaveLength(1);
  });

  it("denies anonymous access and cascades on account deletion", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.daily_checkins`)).toBe(
      true,
    );
    await actAsOwner(db);
    const u = await newUser("gone@x.com");
    await actAsOwner(db);
    await db.query(
      `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ($1, public.bangkok_today(), 1, 1, 1, 1, 1)`,
      [u],
    );
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (
        await db.query(
          `select 1 from public.daily_checkins where user_id = $1`,
          [u],
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe("action_completions", () => {
  it("lets a user tick and untick today's actions for themselves only", async () => {
    const d = await today();
    await actAs(db, alice);
    await db.query(
      `insert into public.action_completions (user_id, action_date, action_key) values ($1, $2, 'move_walk')`,
      [alice, d],
    );
    expect(
      (await db.query(`select action_key from public.action_completions`)).rows,
    ).toEqual([{ action_key: "move_walk" }]);
    // twice is refused (primary key), not silently doubled
    expect(
      await isRejected(
        db,
        `insert into public.action_completions (user_id, action_date, action_key) values ('${alice}', '${d}', 'move_walk')`,
      ),
    ).toBe(true);

    await actAs(db, bob);
    expect(
      (await db.query(`select 1 from public.action_completions`)).rows,
    ).toHaveLength(0);
    expect(
      await isRejected(
        db,
        `insert into public.action_completions (user_id, action_date, action_key) values ('${alice}', '${d}', 'eat_veg')`,
      ),
    ).toBe(true);
    const del = await db.query(
      `delete from public.action_completions where user_id = $1 returning 1`,
      [alice],
    );
    expect(del.rows).toHaveLength(0); // bob cannot untick alice's

    await actAs(db, alice);
    const own = await db.query(
      `delete from public.action_completions where user_id = $1 and action_date = $2 returning 1`,
      [alice, d],
    );
    expect(own.rows).toHaveLength(1);
  });

  it("refuses other days, empty keys and updates", async () => {
    const d = await today();
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `insert into public.action_completions (user_id, action_date, action_key) values ('${alice}', '2020-01-01', 'move_walk')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.action_completions (user_id, action_date, action_key) values ('${alice}', '${d}', '  ')`,
      ),
    ).toBe(true);
    await db.query(
      `insert into public.action_completions (user_id, action_date, action_key) values ($1, $2, 'eat_water')`,
      [alice, d],
    );
    expect(
      await isRejected(
        db,
        `update public.action_completions set action_key = 'x' where user_id = '${alice}'`,
      ),
    ).toBe(true);
  });

  it("keeps past ticks (cannot be unticked) and denies anon", async () => {
    await actAsOwner(db);
    const u = await newUser("past@x.com");
    await actAsOwner(db);
    await db.query(
      `insert into public.action_completions (user_id, action_date, action_key) values ($1, public.bangkok_today() - 1, 'move_walk')`,
      [u],
    );
    await actAs(db, u);
    const del = await db.query(
      `delete from public.action_completions where user_id = $1 returning 1`,
      [u],
    );
    expect(del.rows).toHaveLength(0);
    await actAs(db, null, "anon");
    expect(
      await isRejected(db, `select 1 from public.action_completions`),
    ).toBe(true);
  });
});
