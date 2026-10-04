import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

const PLAN = `'[1,2,3,4,5,6,7]'::jsonb`;

async function newUser(email: string): Promise<string> {
  await actAsOwner(db);
  return (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
  ).rows[0].id;
}

async function addResult(user: string, over: Record<string, string> = {}) {
  await actAs(db, null, "service_role");
  const v = {
    score: "70",
    chrono: "41",
    delta: "-1",
    levers: `'["sleep"]'::jsonb`,
    plan: PLAN,
    source: "'template'",
    ...over,
  };
  return (
    await db.query<{ id: string }>(
      `insert into public.quiz_results (user_id, answers, score, chrono_age, delta_years, levers, plan, plan_source)
       values ($1, '{}'::jsonb, ${v.score}, ${v.chrono}, ${v.delta}, ${v.levers}, ${v.plan}, ${v.source}) returning id`,
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

describe("quiz_results", () => {
  it("lets users read and delete their own results, never write", async () => {
    const a = await addResult(alice);
    await addResult(bob);
    await actAs(db, alice);
    expect(
      (await db.query(`select id from public.quiz_results`)).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `insert into public.quiz_results (user_id, answers, score, chrono_age, delta_years, levers, plan, plan_source) values ('${alice}', '{}'::jsonb, 1, 1, 0, '[]'::jsonb, ${PLAN}, 'ai')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.quiz_results set score = 100 where id = '${a}'`,
      ),
    ).toBe(true);
    await actAs(db, bob);
    expect(
      (
        await db.query(
          `delete from public.quiz_results where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(0);
    await actAs(db, alice);
    expect(
      (
        await db.query(
          `delete from public.quiz_results where id = $1 returning 1`,
          [a],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("denies anonymous access", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.quiz_results`)).toBe(
      true,
    );
  });

  it("validates ranges, plan length, lever count and plan source", async () => {
    const bad = async (over: Record<string, string>) => {
      try {
        await addResult(alice, over);
        return false;
      } catch (e) {
        return /violates/.test((e as Error).message);
      }
    };
    expect(await bad({ score: "101" })).toBe(true);
    expect(await bad({ delta: "11" })).toBe(true);
    expect(await bad({ delta: "-11" })).toBe(true);
    expect(await bad({ plan: `'[1,2]'::jsonb` })).toBe(true);
    expect(await bad({ plan: `'{"a":1}'::jsonb` })).toBe(true);
    expect(await bad({ levers: `'["a","b","c","d"]'::jsonb` })).toBe(true);
    expect(await bad({ source: "'magic'" })).toBe(true);
  });

  it("cascades when the account is deleted", async () => {
    const u = await newUser("gone@x.com");
    await addResult(u);
    await actAsOwner(db);
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (
        await db.query(`select 1 from public.quiz_results where user_id = $1`, [
          u,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
