import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

const ITEMS = `'[{"name":"ผัดไทย","servings":1}]'::jsonb`;

async function newUser(email: string): Promise<string> {
  await actAsOwner(db);
  return (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
  ).rows[0].id;
}

async function addMeal(user: string, over = ""): Promise<string> {
  await actAs(db, null, "service_role");
  return (
    await db.query<{ id: string }>(
      `insert into public.meal_logs (user_id, meal_date, items, kcal, protein_g, carbs_g, fat_g ${over ? ", " + over.split("=")[0] : ""})
       values ($1, '2026-10-10', ${ITEMS}, 600, 22, 80, 21 ${over ? ", " + over.split("=")[1] : ""}) returning id`,
      [user],
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

describe("meal_logs", () => {
  it("lets users read and delete only their own meals, never write them", async () => {
    const a = await addMeal(alice);
    await addMeal(bob);

    await actAs(db, alice);
    expect(
      (await db.query(`select id from public.meal_logs`)).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `insert into public.meal_logs (user_id, meal_date, items, kcal, protein_g, carbs_g, fat_g) values ('${alice}', '2026-10-10', ${ITEMS}, 1, 1, 1, 1)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.meal_logs set kcal = 1 where id = '${a}'`,
      ),
    ).toBe(true);

    await actAs(db, bob);
    expect(
      (
        await db.query(
          `delete from public.meal_logs where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(0);
    await actAs(db, alice);
    expect(
      (
        await db.query(
          `delete from public.meal_logs where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("denies anonymous access", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.meal_logs`)).toBe(true);
  });

  it("validates items, numbers and the confirmed status", async () => {
    await actAs(db, null, "service_role");
    const bad = (cols: string, vals: string) =>
      isRejected(
        db,
        `insert into public.meal_logs (user_id, meal_date, ${cols}) values ('${alice}', '2026-10-10', ${vals})`,
      );
    expect(
      await bad(
        "items, kcal, protein_g, carbs_g, fat_g",
        `'[]'::jsonb, 1, 1, 1, 1`,
      ),
    ).toBe(true);
    expect(
      await bad(
        "items, kcal, protein_g, carbs_g, fat_g",
        `'{"a":1}'::jsonb, 1, 1, 1, 1`,
      ),
    ).toBe(true);
    expect(
      await bad(
        "items, kcal, protein_g, carbs_g, fat_g",
        `${ITEMS}, -1, 1, 1, 1`,
      ),
    ).toBe(true);
    expect(
      await bad(
        "items, kcal, protein_g, carbs_g, fat_g",
        `${ITEMS}, 1, -1, 1, 1`,
      ),
    ).toBe(true);
    expect(
      await bad(
        "items, kcal, protein_g, carbs_g, fat_g, status",
        `${ITEMS}, 1, 1, 1, 1, 'confirmed'`,
      ),
    ).toBe(true);
    expect(
      await bad(
        "items, kcal, protein_g, carbs_g, fat_g, status",
        `${ITEMS}, 1, 1, 1, 1, 'weird'`,
      ),
    ).toBe(true);
  });

  it("cascades when the account is deleted", async () => {
    const u = await newUser("gone@x.com");
    await addMeal(u);
    await actAsOwner(db);
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (await db.query(`select 1 from public.meal_logs where user_id = $1`, [u]))
        .rows,
    ).toHaveLength(0);
  });
});

describe("refund_usage", () => {
  const consume = (user: string) =>
    db.query(
      `select public.consume_usage($1, 'foodSnap', '2026-10-01', '2026-10-01', 3, null)`,
      [user],
    );
  const used = async (user: string) =>
    (
      await db.query<{ used: number }>(
        `select used from public.ai_usage where user_id = $1 and feature = 'foodSnap'`,
        [user],
      )
    ).rows[0]?.used;

  it("gives back one use, never below zero, and only to the service role", async () => {
    const u = await newUser("refund@x.com");
    await actAs(db, null, "service_role");
    await consume(u);
    await consume(u);
    expect(await used(u)).toBe(2);
    await db.query(`select public.refund_usage($1, 'foodSnap', '2026-10-01')`, [
      u,
    ]);
    expect(await used(u)).toBe(1);
    await db.query(`select public.refund_usage($1, 'foodSnap', '2026-10-01')`, [
      u,
    ]);
    await db.query(`select public.refund_usage($1, 'foodSnap', '2026-10-01')`, [
      u,
    ]);
    expect(await used(u)).toBe(0);
    // unknown feature/month: no row, no error
    await db.query(
      `select public.refund_usage($1, 'labImport', '2026-10-01')`,
      [u],
    );

    await actAs(db, u);
    expect(
      await isRejected(
        db,
        `select public.refund_usage('${u}', 'foodSnap', '2026-10-01')`,
      ),
    ).toBe(true);
    await actAs(db, null, "anon");
    expect(
      await isRejected(
        db,
        `select public.refund_usage('${u}', 'foodSnap', '2026-10-01')`,
      ),
    ).toBe(true);
  });
});
