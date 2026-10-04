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

beforeAll(async () => {
  db = await createTestDb();
  alice = await newUser("a@x.com");
  bob = await newUser("b@x.com");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("health_profiles", () => {
  it("lets a user create, read, change and delete their own profile", async () => {
    await actAs(db, alice);
    await db.query(
      `insert into public.health_profiles (user_id, birth_year, sex, smoking, alcohol, exercise_days, conditions, goals)
       values ($1, 1985, 'female', 'never', 'occasional', 3, '{hypertension}', '{sleep,energy}')`,
      [alice],
    );
    await db.query(
      `update public.health_profiles set exercise_days = 5, goals = '{move}' where user_id = $1`,
      [alice],
    );
    const row = (
      await db.query<{
        exercise_days: number;
        goals: string[];
        updated_at: string;
        created_at: string;
      }>(`select * from public.health_profiles`)
    ).rows;
    expect(row).toHaveLength(1);
    expect(row[0].exercise_days).toBe(5);
    expect(row[0].goals).toEqual(["move"]);
    expect(new Date(row[0].updated_at) >= new Date(row[0].created_at)).toBe(
      true,
    );
    expect(
      (
        await db.query(
          `delete from public.health_profiles where user_id = $1 returning 1`,
          [alice],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("keeps profiles private and unforgeable", async () => {
    await actAs(db, alice);
    await db.query(
      `insert into public.health_profiles (user_id, sex) values ($1, 'female')`,
      [alice],
    );
    await actAs(db, bob);
    expect(
      (await db.query(`select 1 from public.health_profiles`)).rows,
    ).toHaveLength(0);
    expect(
      await isRejected(
        db,
        `insert into public.health_profiles (user_id) values ('${alice}')`,
      ),
    ).toBe(true);
    expect(
      (
        await db.query(
          `update public.health_profiles set sex = 'male' where user_id = $1 returning 1`,
          [alice],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `delete from public.health_profiles where user_id = $1 returning 1`,
          [alice],
        )
      ).rows,
    ).toHaveLength(0);
    // the owner column can never be moved to someone else
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `update public.health_profiles set user_id = '${bob}' where user_id = '${alice}'`,
      ),
    ).toBe(true);
  });

  it("validates values", async () => {
    await actAs(db, bob);
    const bad = (cols: string, vals: string) =>
      isRejected(
        db,
        `insert into public.health_profiles (user_id, ${cols}) values ('${bob}', ${vals})`,
      );
    expect(await bad("birth_year", "1800")).toBe(true);
    expect(await bad("sex", "'robot'")).toBe(true);
    expect(await bad("smoking", "'sometimes'")).toBe(true);
    expect(await bad("alcohol", "'always'")).toBe(true);
    expect(await bad("exercise_days", "8")).toBe(true);
    expect(await bad("conditions", "array_fill('x'::text, array[13])")).toBe(
      true,
    );
    await db.query(
      `insert into public.health_profiles (user_id, birth_year) values ($1, 1990)`,
      [bob],
    );
  });

  it("denies anonymous access and cascades on account deletion", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.health_profiles`)).toBe(
      true,
    );
    const u = await newUser("gone@x.com");
    await actAsOwner(db);
    await db.query(`insert into public.health_profiles (user_id) values ($1)`, [
      u,
    ]);
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (
        await db.query(
          `select 1 from public.health_profiles where user_id = $1`,
          [u],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
