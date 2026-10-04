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

const obs = (
  u: string,
  o: {
    type?: string;
    value?: number;
    unit?: string;
    source?: string;
    ext?: string;
    end?: string;
  } = {},
) =>
  `insert into public.health_observations (user_id, type, value, unit, start_at, end_at, source, external_id)
   values ('${u}', '${o.type ?? "steps"}', ${o.value ?? 8000}, '${o.unit ?? "count"}', '2026-10-01T00:00:00+07', ${o.end ? `'${o.end}'` : "null"}, '${o.source ?? "apple_health"}', '${o.ext ?? "steps:2026-10-01"}')`;

describe("health_observations", () => {
  it("is written by the server only; the same thing from the same source is one row", async () => {
    await actAsOwner(db);
    await db.exec(obs(A));
    await db.exec(obs(B));
    expect(await isRejected(db, obs(A))).toBe(true); // same source + id
    await db.exec(obs(A, { source: "csv" })); // another source: its own row
    await actAs(db, A);
    expect(await isRejected(db, obs(A, { ext: "other" }))).toBe(true); // a person cannot write
    expect(
      await isRejected(db, `update public.health_observations set value = 1`),
    ).toBe(true);
  });

  it("only known types, sources and spans are accepted", async () => {
    await actAsOwner(db);
    for (const bad of [
      obs(A, { type: "mood", ext: "1" }),
      obs(A, { source: "fitbit", ext: "2" }),
      obs(A, { unit: "", ext: "3" }),
      obs(A, { ext: "4", end: "2026-09-01T00:00:00+07" }), // ends before it starts
    ])
      expect(await isRejected(db, bad)).toBe(true);
  });

  it("a person reads and erases only their own", async () => {
    await actAs(db, A);
    expect(
      (
        await db.query(`select user_id from public.health_observations`)
      ).rows.every((r) => (r as { user_id: string }).user_id === A),
    ).toBe(true);
    await db.exec(
      `delete from public.health_observations where source = 'csv'`,
    );
    await actAsOwner(db);
    const left = await db.query<{ n: number }>(
      `select count(*)::int as n from public.health_observations where user_id = '${A}'`,
    );
    expect(left.rows[0].n).toBe(1);
    expect(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from public.health_observations where user_id = '${B}'`,
        )
      ).rows[0].n,
    ).toBe(1);
    await actAs(db, null, "anon");
    expect(
      await isRejected(db, `select * from public.health_observations`),
    ).toBe(true);
  });
});

describe("wearable_sources", () => {
  it("is the person's record of consent: readable by them, written by the server", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.wearable_sources (user_id, source) values ('${A}', 'apple_health')`,
    );
    expect(
      await isRejected(
        db,
        `insert into public.wearable_sources (user_id, source) values ('${A}', 'manual')`,
      ),
    ).toBe(true); // typing a value yourself needs no consent record
    await actAs(db, B);
    expect(
      (await db.query(`select 1 from public.wearable_sources`)).rows,
    ).toHaveLength(0);
    await actAs(db, A);
    expect(
      (await db.query(`select 1 from public.wearable_sources`)).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `update public.wearable_sources set revoked_at = null`,
      ),
    ).toBe(true);
  });
});

describe("ingest_tokens", () => {
  it("never shows the hash to the person", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.ingest_tokens (user_id, token_hash, label) values ('${A}', '${"a".repeat(64)}', 'phone')`,
    );
    await actAs(db, A);
    expect(
      (await db.query(`select id, label from public.ingest_tokens`)).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(db, `select token_hash from public.ingest_tokens`),
    ).toBe(true);
    expect(await isRejected(db, `select * from public.ingest_tokens`)).toBe(
      true,
    );
    await actAs(db, B);
    expect(
      (await db.query(`select id from public.ingest_tokens`)).rows,
    ).toHaveLength(0);
  });
});
