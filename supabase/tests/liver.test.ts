import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DIGEST = "a".repeat(64);

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test')`,
  );
});
afterAll(() => db.close());

/** The server's call: engine result in, three rows out, atomically. */
const record = (
  u: string,
  level = 1,
  urgency = "none",
  hepB = "negative",
  hepC = "negative",
) =>
  `select public.record_liver_assessment('${u}', ${level}::smallint, '${urgency}', 1.25, 0.4, 'liver-l1-test',
     '{"redFlags":[]}'::jsonb, '{"v":1,"level":${level}}'::jsonb, '${DIGEST}', '${hepB}', '${hepC}') as id`;

describe("record_liver_assessment", () => {
  it("writes the assessment, the audit entry and the hepatitis status in one go", async () => {
    await actAsOwner(db);
    const id = (await db.query<{ id: string }>(record(A))).rows[0].id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const a = await db.query<{ level: number; fib4: string; user_id: string }>(
      `select level, fib4, user_id from public.liver_assessments where id = '${id}'`,
    );
    expect(a.rows[0]).toMatchObject({ level: 1, fib4: "1.25", user_id: A });
    const log = await db.query<{
      assessment_id: string;
      event: string;
      inputs_digest: string;
    }>(
      `select assessment_id, event, inputs_digest from public.liver_audit_log where user_id = '${A}'`,
    );
    expect(log.rows).toEqual([
      { assessment_id: id, event: "assessed", inputs_digest: DIGEST },
    ]);
    const hep = await db.query(
      `select hep_b, hep_c from public.liver_hepatitis_status where user_id = '${A}'`,
    );
    expect(hep.rows).toEqual([{ hep_b: "negative", hep_c: "negative" }]);
  });

  it("keeps the latest hepatitis status on file", async () => {
    await actAsOwner(db);
    await db.query(record(A, 2, "none", "positive", "never_tested"));
    const hep = await db.query(
      `select hep_b, hep_c from public.liver_hepatitis_status where user_id = '${A}'`,
    );
    expect(hep.rows).toEqual([{ hep_b: "positive", hep_c: "never_tested" }]);
  });

  it("rolls everything back when any row is invalid (no half-written audit trail)", async () => {
    await actAsOwner(db);
    const before = (
      await db.query<{ n: string }>(
        `select count(*) as n from public.liver_assessments where user_id = '${B}'`,
      )
    ).rows[0].n;
    await expect(
      db.query(
        `select public.record_liver_assessment('${B}', 1::smallint, 'none', null, null, 'v',
           '{}'::jsonb, '{}'::jsonb, 'not-a-digest', 'unknown', 'unknown')`,
      ),
    ).rejects.toThrow();
    // an invalid hepatitis value fails the whole call too
    await expect(db.query(record(B, 1, "none", "maybe"))).rejects.toThrow();
    const after = (
      await db.query<{ n: string }>(
        `select count(*) as n from public.liver_assessments where user_id = '${B}'`,
      )
    ).rows[0].n;
    expect(after).toBe(before);
    const audit = await db.query(
      `select 1 from public.liver_audit_log where user_id = '${B}'`,
    );
    expect(audit.rows).toEqual([]);
  });

  it("level and urgency must agree: emergency and soon exist only at level 3", async () => {
    await actAsOwner(db);
    await expect(db.query(record(B, 1, "emergency"))).rejects.toThrow();
    await expect(db.query(record(B, 3, "none"))).rejects.toThrow();
    await expect(db.query(record(B, 4, "none"))).rejects.toThrow();
    await db.query(record(B, 3, "emergency"));
    await db.query(record(B, 3, "soon"));
  });

  it("refuses the 21st check in 24 hours (returns null, writes nothing)", async () => {
    await actAsOwner(db);
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.exec(
      `insert into auth.users (id, email) values ('${C}', 'c@x.test')`,
    );
    for (let i = 0; i < 20; i++) {
      const r = await db.query<{ id: string | null }>(record(C));
      expect(r.rows[0].id).not.toBeNull();
    }
    expect(
      (await db.query<{ id: string | null }>(record(C))).rows[0].id,
    ).toBeNull();
    const n = await db.query<{ n: string }>(
      `select count(*) as n from public.liver_assessments where user_id = '${C}'`,
    );
    expect(Number(n.rows[0].n)).toBe(20);
  });

  it("is callable by the server only", async () => {
    await actAs(db, A);
    expect(await isRejected(db, record(A))).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, record(A))).toBe(true);
    await actAs(db, null, "service_role");
    await db.query(record(A));
    await actAsOwner(db);
  });
});

describe("liver_assessments and liver_audit_log: people read their own, nothing else", () => {
  it("a person sees only their own rows", async () => {
    await actAs(db, A);
    const a = await db.query<{ user_id: string }>(
      `select distinct user_id from public.liver_assessments`,
    );
    expect(a.rows).toEqual([{ user_id: A }]);
    const l = await db.query<{ user_id: string }>(
      `select distinct user_id from public.liver_audit_log`,
    );
    expect(l.rows).toEqual([{ user_id: A }]);
    const h = await db.query<{ user_id: string }>(
      `select user_id from public.liver_hepatitis_status`,
    );
    expect(h.rows).toEqual([{ user_id: A }]);
  });

  it("a person cannot write, forge, edit or delete — anything", async () => {
    await actAs(db, A);
    for (const sql of [
      `insert into public.liver_assessments (user_id, level, urgency, engine_version, answers, result)
         values ('${A}', 0, 'none', 'x', '{}', '{}')`,
      `update public.liver_assessments set level = 0`,
      `delete from public.liver_assessments`,
      `insert into public.liver_audit_log (user_id, assessment_id, event, level, urgency, engine_version, inputs_digest)
         values ('${A}', gen_random_uuid(), 'assessed', 0, 'none', 'x', '${DIGEST}')`,
      `update public.liver_audit_log set level = 0`,
      `delete from public.liver_audit_log`,
      `insert into public.liver_hepatitis_status (user_id, hep_b) values ('${B}', 'negative')`,
      `update public.liver_hepatitis_status set hep_b = 'negative'`,
      `delete from public.liver_hepatitis_status`,
    ])
      expect(await isRejected(db, sql), sql).toBe(true);
    await actAs(db, null, "anon");
    for (const t of [
      "liver_assessments",
      "liver_audit_log",
      "liver_hepatitis_status",
    ])
      expect(await isRejected(db, `select * from public.${t}`), t).toBe(true);
    await actAsOwner(db);
  });

  it("even the server role cannot edit or delete an assessment or an audit row", async () => {
    await actAs(db, null, "service_role");
    for (const sql of [
      `update public.liver_assessments set level = 0`,
      `delete from public.liver_assessments`,
      `update public.liver_audit_log set level = 0`,
      `delete from public.liver_audit_log`,
      `truncate public.liver_audit_log`,
    ])
      expect(await isRejected(db, sql), sql).toBe(true);
    await actAsOwner(db);
  });

  it("an edit is refused by a trigger even for the table owner (append-only)", async () => {
    await actAsOwner(db);
    await expect(
      db.query(`update public.liver_assessments set level = 0`),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query(`update public.liver_audit_log set level = 0`),
    ).rejects.toThrow(/append-only/);
  });
});

describe("liver_hepatitis_status", () => {
  it("one row per person, known values only, written by the server", async () => {
    await actAs(db, null, "service_role");
    await db.exec(
      `update public.liver_hepatitis_status set hep_b = 'vaccinated', hep_b_tested_on = '2026-01-05' where user_id = '${A}'`,
    );
    const r = await db.query(
      `select hep_b, hep_b_tested_on::text as on from public.liver_hepatitis_status where user_id = '${A}'`,
    );
    expect(r.rows).toEqual([{ hep_b: "vaccinated", on: "2026-01-05" }]);
    expect(
      await isRejected(
        db,
        `update public.liver_hepatitis_status set hep_c = 'vaccinated' where user_id = '${A}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.liver_hepatitis_status (user_id) values ('${A}')`,
      ),
    ).toBe(true); // duplicate primary key
    await actAsOwner(db);
  });
});

describe("a new assessment and the hepatitis test date", () => {
  it("keeps the date while the status is unchanged and clears it when the status changes", async () => {
    await actAsOwner(db);
    // currently hep_b = vaccinated with a date (set above)
    await db.query(record(B, 1, "none", "vaccinated", "negative"));
    await db.exec(
      `update public.liver_hepatitis_status set hep_b_tested_on = '2026-01-05' where user_id = '${B}'`,
    );
    await db.query(record(B, 1, "none", "vaccinated", "negative"));
    let r = await db.query(
      `select hep_b_tested_on::text as on from public.liver_hepatitis_status where user_id = '${B}'`,
    );
    expect(r.rows).toEqual([{ on: "2026-01-05" }]);
    await db.query(record(B, 1, "none", "negative", "negative"));
    r = await db.query(
      `select hep_b_tested_on::text as on from public.liver_hepatitis_status where user_id = '${B}'`,
    );
    expect(r.rows).toEqual([{ on: null }]);
  });
});

describe("deleting an account", () => {
  it("erases the assessments, their audit trail and the hepatitis status with it", async () => {
    await actAsOwner(db);
    await db.exec(`delete from auth.users where id = '${A}'`);
    for (const t of [
      "liver_assessments",
      "liver_audit_log",
      "liver_hepatitis_status",
    ]) {
      const r = await db.query(
        `select 1 from public.${t} where user_id = '${A}'`,
      );
      expect(r.rows, t).toEqual([]);
    }
    // someone else's rows are untouched
    const b = await db.query(
      `select 1 from public.liver_assessments where user_id = '${B}'`,
    );
    expect(b.rows.length).toBeGreaterThan(0);
  });
});
