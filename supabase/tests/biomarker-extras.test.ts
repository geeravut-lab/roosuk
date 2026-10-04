import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test')`,
  );
});
afterAll(() => db.close());

const extra = (over: Record<string, string> = {}) => {
  const v: Record<string, string> = {
    key: "'psa'",
    th: "'พีเอสเอ'",
    en: "'PSA'",
    unit: "'ng/mL'",
    normal_hi: "4",
    aliases: "array['psa']",
    source_note: "'lab sheet'",
    ...over,
  };
  return `insert into public.biomarker_extras (${Object.keys(v).join(", ")}) values (${Object.values(v).join(", ")})`;
};

describe("lab_unknown_markers", () => {
  it("counts names across reports without any user or value, and users cannot touch it", async () => {
    await actAsOwner(db);
    await db.query(
      `select public.record_unknown_markers('[{"name":"  PSA  ","unit":"ng/mL"},{"name":"Cystatin   C","unit":"mg/L"},{"name":""}]'::jsonb)`,
    );
    await db.query(
      `select public.record_unknown_markers('[{"name":"psa","unit":"other"}]'::jsonb)`,
    );
    const r = await db.query<{
      normalized_name: string;
      display_name: string;
      times_seen: number;
      unit_sample: string;
    }>(
      `select normalized_name, display_name, times_seen, unit_sample from public.lab_unknown_markers order by normalized_name`,
    );
    expect(r.rows).toEqual([
      {
        normalized_name: "cystatin c",
        display_name: "Cystatin   C",
        times_seen: 1,
        unit_sample: "mg/L",
      },
      {
        normalized_name: "psa",
        display_name: "PSA",
        times_seen: 2,
        unit_sample: "ng/mL",
      },
    ]);
    const cols = (
      await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_name = 'lab_unknown_markers'`,
      )
    ).rows.map((c) => c.column_name);
    expect(cols.join()).not.toMatch(/user|value|report/);
    for (const [id, role] of [
      [A, "authenticated"],
      [null, "anon"],
    ] as const) {
      await actAs(db, id, role);
      expect(
        await isRejected(db, `select * from public.lab_unknown_markers`),
      ).toBe(true);
      expect(
        await isRejected(
          db,
          `select public.record_unknown_markers('[]'::jsonb)`,
        ),
      ).toBe(true);
    }
    await actAsOwner(db);
  });
  it("ignores input that is not a list", async () => {
    expect(
      (
        await db.query<{ n: number }>(
          `select public.record_unknown_markers('{"a":1}'::jsonb) as n`,
        )
      ).rows[0].n,
    ).toBe(0);
  });
});

describe("biomarker_extras", () => {
  it("is closed to users", async () => {
    await actAsOwner(db);
    await db.exec(extra());
    await actAs(db, A);
    expect(await isRejected(db, `select * from public.biomarker_extras`)).toBe(
      true,
    );
    expect(await isRejected(db, extra({ key: "'other'" }))).toBe(true);
  });
  it("only accepts a range that makes sense", async () => {
    await actAsOwner(db);
    for (const bad of [
      { key: "'Bad Key'" },
      { normal_hi: "null" }, // no bound at all
      { normal_lo: "5", normal_hi: "4" },
      { normal_lo: "1", normal_hi: "4", watch_lo: "2" }, // watch narrower than normal
      { normal_hi: "4", watch_hi: "3" },
      { unit: "''" },
      { aliases: "array[]::text[]" },
      { source_note: "'x'" },
      { status: "'live'" },
      { status: "'approved'" }, // approved without a stamp
      { conversions: "'{}'::jsonb" },
    ] as Record<string, string>[])
      expect(
        await isRejected(
          db,
          extra({
            key: "'k_" + Math.random().toString(36).slice(2, 8) + "'",
            ...bad,
          }),
        ),
        JSON.stringify(bad),
      ).toBe(true);
    await db.exec(
      extra({
        key: "'ok_marker'",
        normal_lo: "1",
        normal_hi: "4",
        watch_lo: "0.5",
        watch_hi: "6",
        status: "'approved'",
        approved_at: "now()",
      }),
    );
  });
  it("keeps the record when the admin who approved it is deleted", async () => {
    await db.exec(
      `update public.biomarker_extras set approved_by = '${A}' where key = 'ok_marker'`,
    );
    await db.exec(`delete from auth.users where id = '${A}'`);
    const r = await db.query<{ approved_by: string | null }>(
      `select approved_by from public.biomarker_extras where key = 'ok_marker'`,
    );
    expect(r.rows[0].approved_by).toBeNull();
  });
});
