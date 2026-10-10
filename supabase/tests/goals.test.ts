import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;
let goal: string;

const today = "(now() at time zone 'Asia/Bangkok')::date";

beforeAll(async () => {
  db = await createTestDb();
  const mk = async (email: string) =>
    (
      await db.query<{ id: string }>(
        "insert into auth.users (email) values ($1) returning id",
        [email],
      )
    ).rows[0].id;
  alice = await mk("a@x.com");
  bob = await mk("b@x.com");
  goal = (
    await db.query<{ id: string }>(
      `insert into public.user_goals (user_id, kind, params, started_on, ends_on)
       values ($1, 'weight', '{"direction":"lose"}', ${today}, ${today} + 28) returning id`,
      [alice],
    )
  ).rows[0].id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("weight_logs", () => {
  it("a person logs and corrects their own weight, within the last two months", async () => {
    await actAs(db, alice);
    await db.query(
      `insert into public.weight_logs (user_id, logged_on, weight_kg) values ($1, ${today}, 71.5)`,
      [alice],
    );
    await db.query(
      `update public.weight_logs set weight_kg = 71.0 where logged_on = ${today}`,
    );
    const r = await db.query<{ weight_kg: string }>(
      "select weight_kg from public.weight_logs",
    );
    expect(r.rows.map((x) => Number(x.weight_kg))).toEqual([71]);
  });

  it("rejects the future, old history, nonsense weights and other people's rows", async () => {
    await actAs(db, alice);
    for (const [on, kg] of [
      [`${today} + 1`, 70],
      [`${today} - 61`, 70],
      [`${today} - 3`, 10],
      [`${today} - 3`, 400],
    ] as const)
      expect(
        await isRejected(
          db,
          `insert into public.weight_logs (user_id, logged_on, weight_kg) values ('${alice}', ${on}, ${kg})`,
        ),
      ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.weight_logs (user_id, logged_on, weight_kg) values ('${bob}', ${today} - 2, 60)`,
      ),
    ).toBe(true);
    await actAs(db, bob);
    expect(
      (await db.query("select * from public.weight_logs")).rows,
    ).toHaveLength(0);
    await db.query("delete from public.weight_logs");
    await actAs(db, alice);
    expect(
      (await db.query("select * from public.weight_logs")).rows,
    ).toHaveLength(1);
  });

  it("the date cannot be changed afterwards (only the weight)", async () => {
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `update public.weight_logs set logged_on = ${today} - 5`,
      ),
    ).toBe(true);
  });
});

describe("goals and programs are written by the server", () => {
  it("a person reads their own goals and cannot create, edit or read another's", async () => {
    await actAs(db, alice);
    expect(
      (await db.query("select id from public.user_goals")).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `insert into public.user_goals (user_id, kind, params, started_on, ends_on) values ('${alice}', 'sleep', '{}', ${today}, ${today})`,
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `update public.user_goals set status = 'completed'`),
    ).toBe(true);
    await actAs(db, bob);
    expect(
      (await db.query("select id from public.user_goals")).rows,
    ).toHaveLength(0);
  });

  it("one live goal per kind (and per condition), but a finished one does not block a new one", async () => {
    await actAsOwner(db);
    const dup = async (kind: string, params: string) =>
      isRejected(
        db,
        `insert into public.user_goals (user_id, kind, params, started_on, ends_on) values ('${alice}', '${kind}', '${params}', ${today}, ${today} + 14)`,
      );
    expect(await dup("weight", "{}")).toBe(true);
    expect(await dup("condition", '{"condition":"gout"}')).toBe(false);
    expect(await dup("condition", '{"condition":"gout"}')).toBe(true);
    expect(await dup("condition", '{"condition":"diabetes"}')).toBe(false);
    await db.query(
      `update public.user_goals set status = 'completed', ended_at = now() where kind = 'weight'`,
    );
    expect(await dup("weight", "{}")).toBe(false);
  });

  it("programs are readable by the owner only and never writable by them", async () => {
    await actAsOwner(db);
    await db.query(
      `insert into public.goal_programs (goal_id, user_id, version, source, valid_from, valid_to, targets, plan)
       values ($1, $2, 1, 'template', ${today}, ${today} + 28, '{}', '{}')`,
      [goal, alice],
    );
    await actAs(db, alice);
    expect(
      (await db.query("select id from public.goal_programs")).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `insert into public.goal_programs (goal_id, user_id, version, source, valid_from, valid_to, targets, plan) values ('${goal}', '${alice}', 2, 'ai', ${today}, ${today}, '{}', '{}')`,
      ),
    ).toBe(true);
    await actAs(db, bob);
    expect(
      (await db.query("select id from public.goal_programs")).rows,
    ).toHaveLength(0);
  });
});

describe("goal_task_checks", () => {
  it("ticks only today, only on one's own live goal, and can untick today", async () => {
    await actAs(db, alice);
    // the weight goal above was completed, so use a live one
    await actAsOwner(db);
    const live = (
      await db.query<{ id: string }>(
        `insert into public.user_goals (user_id, kind, params, started_on, ends_on) values ($1, 'sleep', '{}', ${today}, ${today} + 14) returning id`,
        [alice],
      )
    ).rows[0].id;
    await actAs(db, alice);
    await db.query(
      `insert into public.goal_task_checks (user_id, goal_id, task_date, task_key) values ($1, $2, ${today}, 't1')`,
      [alice, live],
    );
    expect(
      await isRejected(
        db,
        `insert into public.goal_task_checks (user_id, goal_id, task_date, task_key) values ('${alice}', '${live}', ${today} - 1, 't2')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.goal_task_checks (user_id, goal_id, task_date, task_key) values ('${alice}', '${goal}', ${today}, 't1')`,
      ),
    ).toBe(true); // that goal is completed
    await actAs(db, bob);
    expect(
      await isRejected(
        db,
        `insert into public.goal_task_checks (user_id, goal_id, task_date, task_key) values ('${bob}', '${live}', ${today}, 't1')`,
      ),
    ).toBe(true); // not Bob's goal
    await actAs(db, alice);
    await db.query(
      `delete from public.goal_task_checks where task_key = 't1' and task_date = ${today}`,
    );
    expect(
      (await db.query("select * from public.goal_task_checks")).rows,
    ).toHaveLength(0);
  });
});

describe("profile height and meal slot", () => {
  it("height is writable by the owner within a plausible range; meal slot is a fixed list", async () => {
    await actAs(db, alice);
    await db.query(
      `insert into public.health_profiles (user_id, height_cm) values ($1, 160)`,
      [alice],
    );
    expect(
      await isRejected(db, `update public.health_profiles set height_cm = 50`),
    ).toBe(true);
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `insert into public.meal_logs (user_id, meal_date, status, items, kcal, protein_g, carbs_g, fat_g, confirmed_at, meal_type)
         values ('${alice}', ${today}, 'confirmed', '[{"name":"x"}]', 100, 1, 1, 1, now(), 'brunch')`,
      ),
    ).toBe(true);
    await db.query(
      `insert into public.meal_logs (user_id, meal_date, status, items, kcal, protein_g, carbs_g, fat_g, confirmed_at, meal_type)
       values ($1, ${today}, 'confirmed', '[{"name":"x"}]', 100, 1, 1, 1, now(), 'lunch')`,
      [alice],
    );
  });
});
