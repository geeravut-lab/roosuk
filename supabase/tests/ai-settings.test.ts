import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ('a@x.com') returning id`,
    )
  ).rows[0].id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("ai_settings", () => {
  it("starts with exactly one empty row, and can never have another", async () => {
    await actAs(db, null, "service_role");
    const rows = (
      await db.query(
        `select route_overrides, model_overrides from public.ai_settings`,
      )
    ).rows;
    expect(rows).toEqual([{ route_overrides: {}, model_overrides: {} }]);
    expect(
      await isRejected(
        db,
        `insert into public.ai_settings (id) values (false)`,
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `insert into public.ai_settings (id) values (true)`),
    ).toBe(true);
  });

  it("only accepts JSON objects for the overrides", async () => {
    await actAs(db, null, "service_role");
    expect(
      await isRejected(
        db,
        `update public.ai_settings set route_overrides = '[]'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.ai_settings set model_overrides = '"x"'`,
      ),
    ).toBe(true);
    await db.query(
      `update public.ai_settings set route_overrides = '{"chat":{"primary":"google"}}', updated_by = $1`,
      [alice],
    );
  });

  it("is invisible to users and anonymous callers", async () => {
    for (const [who, role] of [
      [alice, "authenticated"],
      [null, "anon"],
    ] as const) {
      await actAs(db, who, role);
      expect(await isRejected(db, `select * from public.ai_settings`)).toBe(
        true,
      );
      expect(
        await isRejected(
          db,
          `update public.ai_settings set route_overrides = '{}'`,
        ),
      ).toBe(true);
    }
  });

  it("keeps the row when the editing admin's account is deleted", async () => {
    await actAsOwner(db);
    const u = (
      await db.query<{ id: string }>(
        `insert into auth.users (email) values ('adm@x.com') returning id`,
      )
    ).rows[0].id;
    await db.query(`update public.ai_settings set updated_by = $1`, [u]);
    await db.query(`delete from auth.users where id = $1`, [u]);
    const row = (
      await db.query<{ updated_by: string | null }>(
        `select updated_by from public.ai_settings`,
      )
    ).rows[0];
    expect(row.updated_by).toBeNull();
  });
});

describe("ai_events", () => {
  it("records only fallbacks and errors, with bounded text", async () => {
    await actAs(db, null, "service_role");
    await db.query(
      `insert into public.ai_events (provider, task, status, error_code, message) values ('google', 'food_scan', 'fallback', '429', 'rate limited')`,
    );
    await db.query(
      `insert into public.ai_events (provider, task, status) values ('anthropic', 'config', 'error')`,
    );
    expect(
      await isRejected(
        db,
        `insert into public.ai_events (provider, task, status) values ('google', 'chat', 'ok')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.ai_events (provider, task, status, message) values ('google', 'chat', 'error', repeat('x', 301))`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.ai_events (provider, task, status) values ('  ', 'chat', 'error')`,
      ),
    ).toBe(true);
  });

  it("is invisible to users and anonymous callers", async () => {
    for (const [who, role] of [
      [alice, "authenticated"],
      [null, "anon"],
    ] as const) {
      await actAs(db, who, role);
      expect(await isRejected(db, `select * from public.ai_events`)).toBe(true);
      expect(
        await isRejected(
          db,
          `insert into public.ai_events (provider, task, status) values ('x', 'y', 'error')`,
        ),
      ).toBe(true);
    }
  });
});
