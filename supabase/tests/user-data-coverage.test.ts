import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INTERNAL_USER_REFERENCES,
  OWNED_TABLES,
} from "../../src/config/user-data";
import { actAs, createTestDb } from "./helpers";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Every foreign key from public.* to auth.users, with what happens to the row when the user is deleted. */
async function userReferences() {
  const r = await db.query<{ t: string; c: string; del: string }>(`
    select cl.relname as t, a.attname as c, co.confdeltype as del
      from pg_constraint co
      join pg_class cl on cl.oid = co.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = co.conrelid and a.attnum = any (co.conkey)
     where co.contype = 'f' and n.nspname = 'public'
       and co.confrelid = 'auth.users'::regclass`);
  return r.rows.map((x) => ({
    ref: `${x.t}.${x.c}`,
    table: x.t,
    column: x.c,
    del: x.del,
  }));
}

describe("the user-data list covers the whole database", () => {
  it("accounts for every column that references a user — a new feature cannot escape export or deletion", async () => {
    const owned = new Set(OWNED_TABLES.map((t) => `${t.table}.${t.column}`));
    const internal = new Set(INTERNAL_USER_REFERENCES);
    const missing = (await userReferences())
      .map((r) => r.ref)
      .filter((ref) => !owned.has(ref) && !internal.has(ref));
    expect(
      missing,
      `These tables reference auth.users but are neither in OWNED_TABLES nor INTERNAL_USER_REFERENCES (src/config/user-data.ts): ${missing.join(", ")}. Add them so "download my data" and "delete my account" cover them.`,
    ).toEqual([]);
  });

  it("has no stale entries: every listed table and column exists and points at a user", async () => {
    const real = new Set((await userReferences()).map((r) => r.ref));
    for (const t of OWNED_TABLES)
      expect(real, `${t.table}.${t.column}`).toContain(
        `${t.table}.${t.column}`,
      );
    for (const ref of INTERNAL_USER_REFERENCES)
      expect(real, ref).toContain(ref);
    expect(new Set(OWNED_TABLES.map((t) => t.table)).size).toBe(
      OWNED_TABLES.length,
    );
  });

  it("states the truth about deletion: 'erased' tables cascade, 'retained' ones are detached (set null)", async () => {
    const byRef = new Map((await userReferences()).map((r) => [r.ref, r.del]));
    for (const t of OWNED_TABLES)
      expect(byRef.get(`${t.table}.${t.column}`), t.table).toBe(
        t.onDelete === "erased" ? "c" : "n",
      );
    for (const ref of INTERNAL_USER_REFERENCES)
      expect(byRef.get(ref), ref).toBe("n");
  });

  it("only omits columns that exist", async () => {
    for (const t of OWNED_TABLES)
      for (const col of t.omit ?? []) {
        const r = await db.query(
          `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
          [t.table, col],
        );
        expect(r.rows.length, `${t.table}.${col}`).toBe(1);
      }
  });

  it("lets a signed-in user count the tables marked countable (RLS select), so the deletion preview is honest", async () => {
    const id = (
      await db.query<{ id: string }>(
        `insert into auth.users (email) values ('c@x.com') returning id`,
      )
    ).rows[0].id;
    await actAs(db, id);
    for (const t of OWNED_TABLES.filter((x) => x.countable))
      await expect(
        db.query(`select count(*) from public.${t.table}`),
        t.table,
      ).resolves.toBeTruthy();
  });

  it("deleting a user erases the erased tables and keeps (detached) the retained ones — end to end", async () => {
    const owner = async (sql: string, params: unknown[] = []) =>
      db.query(sql, params);
    await db.exec("reset role");
    const u = (
      await owner(
        `insert into auth.users (email) values ('del@x.com') returning id`,
      )
    ).rows[0] as { id: string };
    await owner(
      `insert into public.daily_checkins (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition) values ($1, '2026-10-10', 1,1,1,1,1)`,
      [u.id],
    );
    await owner(
      `insert into public.payments (user_id, plan_tier, period, amount, promptpay_id, status, payer_ref) values ($1, 'gold', 'monthly', 49, '0812345678', 'paid', 'r')`,
      [u.id],
    );
    await owner(
      `insert into public.privacy_audit_log (user_id, action) values ($1, 'data_export')`,
      [u.id],
    );
    await owner(`delete from auth.users where id = $1`, [u.id]);
    expect(
      (
        await owner(`select 1 from public.daily_checkins where user_id = $1`, [
          u.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (await owner(`select user_id from public.payments where payer_ref = 'r'`))
        .rows,
    ).toEqual([{ user_id: null }]);
    expect(
      (
        await owner(
          `select user_id from public.privacy_audit_log where action = 'data_export' and user_id is null`,
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  });
});
