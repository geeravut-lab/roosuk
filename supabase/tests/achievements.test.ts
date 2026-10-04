import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test')`,
  );
});
afterAll(() => db.close());

const award = async (u: string) => {
  await actAsOwner(db);
  const r = await db.query<{ a: string[] }>(
    `select public.award_achievements('${u}') as a`,
  );
  return r.rows[0].a;
};
const checkin = (u: string, date: string) =>
  db.query(
    `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition)
     values ('${u}', '${date}', 3, 2, 4, 4, 3)`,
  );

describe("award_achievements", () => {
  it("awards nothing without history", async () => {
    expect(await award(A)).toEqual([]);
  });

  it("counts the LONGEST run of consecutive days, a gap restarts it, and re-running adds nothing", async () => {
    await actAsOwner(db);
    for (const d of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05"])
      await checkin(A, d);
    expect(await award(A)).toEqual(["checkin_first", "streak_3"]);
    expect(await award(A)).toEqual([]);
    for (const d of ["2026-09-06", "2026-09-07", "2026-09-08"])
      await checkin(A, d); // 5-8 = 4 days: still not 7
    expect(await award(A)).toEqual([]);
    await checkin(A, "2026-09-04"); // closes the gap: 1..8 = 8 days
    expect(await award(A)).toEqual(["streak_7"]);
  });

  it("is per person", async () => {
    expect(await award(B)).toEqual([]);
  });

  it("rewards only what was done: lab on two dates, profile, quiz", async () => {
    await actAsOwner(db);
    await db.query(
      `insert into public.lab_reports (user_id, status, collected_on, confirmed_at, items, model)
       values ('${B}', 'confirmed', '2026-09-01', now(), '[{"name":"x"}]', 'm'),
              ('${B}', 'confirmed', '2026-09-01', now(), '[{"name":"x"}]', 'm'),
              ('${B}', 'draft', '2026-08-01', null, '[{"name":"x"}]', 'm')`,
    );
    expect(await award(B)).toEqual(["lab_first"]); // same date twice + a draft: no "two dates"
    await db.query(
      `insert into public.lab_reports (user_id, status, collected_on, confirmed_at, items, model)
       values ('${B}', 'confirmed', '2026-09-20', now(), '[{"name":"x"}]', 'm')`,
    );
    expect(await award(B)).toEqual(["lab_two_dates"]);
  });
});

describe("user_achievements access", () => {
  it("a person reads their own rows only, and cannot write, edit or delete any", async () => {
    await actAs(db, A);
    const mine = await db.query<{ user_id: string }>(
      `select distinct user_id from public.user_achievements`,
    );
    expect(mine.rows).toEqual([{ user_id: A }]);
    expect(
      await isRejected(
        db,
        `insert into public.user_achievements (user_id, key, earned_on) values ('${A}', 'streak_30', '2026-09-01')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.user_achievements set earned_on = '2020-01-01'`,
      ),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.user_achievements`)).toBe(
      true,
    );
    expect(
      await isRejected(db, `select public.award_achievements('${A}')`),
    ).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.user_achievements`)).toBe(
      true,
    );
  });

  it("rejects a key outside the catalogue", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `insert into public.user_achievements (user_id, key, earned_on) values ('${A}', 'lose_5kg', '2026-09-01')`,
      ),
    ).toBe(true);
  });
});
