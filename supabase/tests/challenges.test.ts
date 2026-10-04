import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TODAY = "2026-10-14";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test'), ('${C}', 'c@x.test')`,
  );
});
afterAll(() => db.close());

const rpc = async <T>(sql: string) => {
  await actAsOwner(db);
  return (await db.query<{ r: T }>(`select ${sql} as r`)).rows[0].r;
};
const start = (
  u: string,
  template = "streak7",
  mode = "solo",
  metric = "checkin_days",
  target = 7,
  days = 7,
  today = TODAY,
) =>
  rpc<{ ok: boolean; reason?: string; id?: string; code?: string | null }>(
    `public.start_challenge('${u}', '${template}', '${mode}', '${metric}', ${target}, ${days}, '${today}')`,
  );
const checkins = async (u: string, from: string, n: number) => {
  await actAsOwner(db);
  await db.exec(
    Array.from(
      { length: n },
      (_, i) =>
        `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ('${u}', '${from}'::date + ${i}, 3, 2, 4, 4, 3) on conflict do nothing;`,
    ).join("\n"),
  );
};
const evaluate = (u: string, today = TODAY) =>
  rpc<{ challenge: string; amount: number }[]>(
    `public.evaluate_challenges('${u}', '${today}')`,
  );
const balance = async (u: string) => {
  await actAsOwner(db);
  return Number(
    (
      await db.query<{ s: string }>(
        `select coalesce(sum(amount_thb),0) as s from public.reward_ledger where user_id = '${u}'`,
      )
    ).rows[0].s,
  );
};

describe("starting", () => {
  it("a solo challenge has a window, no code, and the starter in it; a friend one gets a code", async () => {
    const s = await start(A);
    expect(s.ok).toBe(true);
    expect(s.code).toBeNull();
    await actAsOwner(db);
    const c = (
      await db.query(
        `select starts_on::text, ends_on::text, target, mode from public.challenges where id = '${s.id}'`,
      )
    ).rows[0];
    expect(c).toEqual({
      starts_on: TODAY,
      ends_on: "2026-10-20",
      target: 7,
      mode: "solo",
    });
    const f = await start(A, "days10of14", "friend", "checkin_days", 10, 14);
    expect(f.ok).toBe(true);
    expect(f.code).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
  });

  it("one open challenge per template, and at most three open", async () => {
    expect(await start(A)).toMatchObject({ ok: false, reason: "duplicate" });
    expect((await start(A, "meals7of14", "solo", "meal_days", 7, 14)).ok).toBe(
      true,
    ); // third
    await actAsOwner(db);
    const open = await db.query(
      `select count(*)::int as n from public.challenge_participants p join public.challenges c on c.id = p.challenge_id where p.user_id = '${A}' and p.completed_at is null and c.ends_on >= '${TODAY}'`,
    );
    expect(open.rows[0]).toEqual({ n: 3 });
  });

  it("refuses nonsense windows and unknown templates", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `select public.start_challenge('${B}', 'streak7', 'solo', 'checkin_days', 30, 7, '${TODAY}')`,
      ),
    ).toBe(true); // target > window
    expect(
      await isRejected(
        db,
        `select public.start_challenge('${B}', 'lose_weight', 'solo', 'checkin_days', 5, 7, '${TODAY}')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `select public.start_challenge('${B}', 'streak7', 'solo', 'weight_kg', 5, 7, '${TODAY}')`,
      ),
    ).toBe(true);
  });
});

describe("joining a friend's challenge", () => {
  let code = "";
  let id = "";
  it("a friend joins once, early, as the second person", async () => {
    await actAsOwner(db);
    const c = (
      await db.query<{ id: string; invite_code: string }>(
        `select id, invite_code from public.challenges where mode = 'friend' and created_by = '${A}'`,
      )
    ).rows[0];
    code = c.invite_code;
    id = c.id;
    const join = (u: string, today = TODAY, c = code) =>
      rpc<{ ok: boolean; reason?: string }>(
        `public.join_challenge('${u}', '${c}', '${today}')`,
      );
    expect(await join(A)).toMatchObject({ ok: false, reason: "already" });
    expect(await join(B, TODAY, "ZZZZZZZ")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await join(B, "2026-10-17")).toMatchObject({
      ok: false,
      reason: "late",
    });
    expect(
      await join(B, "2026-10-15", ` ${code.toLowerCase()} `),
    ).toMatchObject({ ok: true });
    expect(await join(C, "2026-10-15")).toMatchObject({
      ok: false,
      reason: "full",
    });
  });

  it("people see only the challenges they take part in", async () => {
    await actAs(db, C);
    expect(
      (await db.query(`select 1 from public.challenges`)).rows.length,
    ).toBe(0);
    await actAs(db, B);
    expect(
      (await db.query<{ id: string }>(`select id from public.challenges`)).rows,
    ).toEqual([{ id }]);
    expect(
      (await db.query(`select 1 from public.challenge_participants`)).rows
        .length,
    ).toBe(1);
    expect(
      await isRejected(
        db,
        `insert into public.challenge_participants (challenge_id, user_id) values ('${id}', '${B}')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.challenge_participants set completed_at = now()`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `select public.evaluate_challenges('${B}', '${TODAY}')`,
      ),
    ).toBe(true);
  });
});

describe("finishing", () => {
  it("reaching the target inside the window completes it once and pays the admin's amount once", async () => {
    await checkins(A, TODAY, 6);
    expect(await evaluate(A)).toEqual([]); // 6 of 7
    await checkins(A, "2026-10-20", 1);
    const done = await evaluate(A);
    expect(done).toHaveLength(1);
    expect(done[0].amount).toBe(15);
    expect(await balance(A)).toBe(15);
    expect(await evaluate(A)).toEqual([]); // completed already
    expect(await balance(A)).toBe(15);
  });

  it("days outside the window do not count, and each friend finishes on their own", async () => {
    await checkins(B, "2026-10-01", 14); // before the window starts
    expect(await evaluate(B, "2026-10-16")).toEqual([]);
    await checkins(B, TODAY, 10);
    const done = await evaluate(B, "2026-10-23");
    expect(done).toHaveLength(1);
    expect(await balance(B)).toBe(15);
    // A has 10 days too, in the same friend challenge
    await checkins(A, TODAY, 10);
    expect((await evaluate(A)).length).toBe(1);
  });

  it("the monthly cap stops the reward, not the completion", async () => {
    await actAsOwner(db);
    await db.exec(
      `update public.platform_settings set challenge_max_rewards_per_month = 2`,
    );
    // A already earned 2 this month (streak7 + days10of14)
    const meals = (
      await rpc<{ id: string }>(
        `(select jsonb_build_object('id', c.id) from public.challenges c join public.challenge_participants p on p.challenge_id = c.id where p.user_id = '${A}' and c.metric = 'meal_days')`,
      )
    ).id;
    await actAsOwner(db);
    await db.exec(
      Array.from(
        { length: 7 },
        (_, i) =>
          `insert into public.meal_logs (user_id, status, confirmed_at, meal_date, items, kcal, protein_g, carbs_g, fat_g, model) values ('${A}', 'confirmed', now(), '${TODAY}'::date + ${i}, '[{"name":"x"}]', 500, 1, 1, 1, 'm');`,
      ).join("\n"),
    );
    const capped = await evaluate(A);
    expect(capped).toEqual([{ challenge: meals, amount: 0 }]); // completed, but this month's reward cap was used
    expect(await balance(A)).toBe(30);
    await db.exec(
      `update public.platform_settings set challenge_max_rewards_per_month = 4`,
    );
  });
});
