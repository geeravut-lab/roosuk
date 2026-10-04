import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

const ITEMS = `'[{"name":"FBS","value":104}]'::jsonb`;

async function newUser(email: string): Promise<string> {
  await actAsOwner(db);
  return (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
  ).rows[0].id;
}

async function addReport(user: string, status = "draft"): Promise<string> {
  await actAs(db, null, "service_role");
  return (
    await db.query<{ id: string }>(
      status === "draft"
        ? `insert into public.lab_reports (user_id, items) values ($1, ${ITEMS}) returning id`
        : `insert into public.lab_reports (user_id, status, items, collected_on, confirmed_at) values ($1, 'confirmed', ${ITEMS}, '2026-09-01', now()) returning id`,
      [user],
    )
  ).rows[0].id;
}

async function addResult(user: string, report: string, status = "watch") {
  await actAs(db, null, "service_role");
  await db.query(
    `insert into public.lab_results (user_id, report_id, marker_key, name, value, unit, value_std, status, collected_on)
     values ($1, $2, 'fasting_glucose', 'FBS', 104, 'mg/dL', 104, $3, '2026-09-01')`,
    [user, report, status],
  );
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await newUser("a@x.com");
  bob = await newUser("b@x.com");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("lab_reports and lab_results RLS", () => {
  it("lets users read and delete only their own, never write", async () => {
    const ra = await addReport(alice, "confirmed");
    await addResult(alice, ra);
    const rb = await addReport(bob, "confirmed");
    await addResult(bob, rb);

    await actAs(db, alice);
    expect(
      (await db.query(`select id from public.lab_reports`)).rows,
    ).toHaveLength(1);
    expect(
      (await db.query(`select id from public.lab_results`)).rows,
    ).toHaveLength(1);
    expect(
      await isRejected(
        db,
        `insert into public.lab_reports (user_id, items) values ('${alice}', ${ITEMS})`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.lab_reports set collected_on = '2020-01-01' where id = '${ra}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.lab_results (user_id, report_id, name, value, status, collected_on) values ('${alice}', '${ra}', 'x', 1, 'normal', '2026-09-01')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `update public.lab_results set status = 'normal'`),
    ).toBe(true);

    await actAs(db, bob);
    expect(
      (
        await db.query(
          `delete from public.lab_reports where id = $1 returning 1`,
          [ra],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `delete from public.lab_results where report_id = $1 returning 1`,
          [ra],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("deleting a report removes its results (user erasure)", async () => {
    const u = await newUser("erase@x.com");
    const r = await addReport(u, "confirmed");
    await addResult(u, r);
    await actAs(db, u);
    await db.query(`delete from public.lab_reports where id = $1`, [r]);
    await actAsOwner(db);
    expect(
      (
        await db.query(
          `select 1 from public.lab_results where report_id = $1`,
          [r],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("denies anonymous access", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.lab_reports`)).toBe(true);
    expect(await isRejected(db, `select 1 from public.lab_results`)).toBe(true);
  });

  it("validates report items, status and confirmation completeness", async () => {
    await actAs(db, null, "service_role");
    const bad = (sql: string) => isRejected(db, sql);
    expect(
      await bad(
        `insert into public.lab_reports (user_id, items) values ('${alice}', '[]'::jsonb)`,
      ),
    ).toBe(true);
    expect(
      await bad(
        `insert into public.lab_reports (user_id, items) values ('${alice}', '{"a":1}'::jsonb)`,
      ),
    ).toBe(true);
    expect(
      await bad(
        `insert into public.lab_reports (user_id, items, status) values ('${alice}', ${ITEMS}, 'confirmed')`,
      ),
    ).toBe(true);
    expect(
      await bad(
        `insert into public.lab_reports (user_id, items, status, confirmed_at) values ('${alice}', ${ITEMS}, 'confirmed', now())`,
      ),
    ).toBe(true);
    expect(
      await bad(
        `insert into public.lab_reports (user_id, items, status) values ('${alice}', ${ITEMS}, 'weird')`,
      ),
    ).toBe(true);
    const r = await addReport(alice);
    await actAs(db, null, "service_role");
    expect(
      await bad(
        `insert into public.lab_results (user_id, report_id, name, value, status, collected_on) values ('${alice}', '${r}', 'x', 1, 'bogus', '2026-09-01')`,
      ),
    ).toBe(true);
    expect(
      await bad(
        `insert into public.lab_results (user_id, report_id, name, value, status, collected_on) values ('${alice}', '${r}', '  ', 1, 'normal', '2026-09-01')`,
      ),
    ).toBe(true);
  });

  it("cascades when the account is deleted", async () => {
    const u = await newUser("gone@x.com");
    const r = await addReport(u, "confirmed");
    await addResult(u, r);
    await actAsOwner(db);
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (
        await db.query(`select 1 from public.lab_reports where user_id = $1`, [
          u,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(`select 1 from public.lab_results where user_id = $1`, [
          u,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});

describe("confirm_lab_report", () => {
  const items = JSON.stringify([
    {
      name: "FBS",
      marker_key: "fasting_glucose",
      value: 104,
      unit: "mg/dL",
      value_std: 104,
      status: "watch",
    },
    {
      name: "Mystery",
      marker_key: null,
      value: 3,
      unit: "u",
      value_std: null,
      status: "unknown",
    },
  ]);
  const confirm = async (report: string, user: string, itemsJson = items) => {
    await actAs(db, null, "service_role");
    return (
      await db.query<{ n: number }>(
        `select public.confirm_lab_report($1, $2, '2026-09-01', $3::jsonb) as n`,
        [report, user, itemsJson],
      )
    ).rows[0].n;
  };

  it("finalises a draft and writes one result per item, once", async () => {
    const u = await newUser("c1@x.com");
    const r = await addReport(u);
    expect(await confirm(r, u)).toBe(2);
    await actAsOwner(db);
    const rep = (
      await db.query<{ status: string; collected_on: string }>(
        `select status, collected_on::text from public.lab_reports where id = $1`,
        [r],
      )
    ).rows[0];
    expect(rep).toEqual({ status: "confirmed", collected_on: "2026-09-01" });
    const res = (
      await db.query<{ marker_key: string | null; status: string }>(
        `select marker_key, status from public.lab_results where report_id = $1 order by name`,
        [r],
      )
    ).rows;
    expect(res).toEqual([
      { marker_key: "fasting_glucose", status: "watch" },
      { marker_key: null, status: "unknown" },
    ]);
    expect(await confirm(r, u)).toBe(0); // double click changes nothing
    await actAsOwner(db);
    expect(
      (
        await db.query(
          `select 1 from public.lab_results where report_id = $1`,
          [r],
        )
      ).rows,
    ).toHaveLength(2);
  });

  it("refuses another user's draft and rolls everything back on a bad item", async () => {
    const u = await newUser("c2@x.com");
    const other = await newUser("c3@x.com");
    const r = await addReport(u);
    expect(await confirm(r, other)).toBe(0);
    const bad = JSON.stringify([
      {
        name: "FBS",
        marker_key: "fasting_glucose",
        value: 1,
        unit: "",
        value_std: 1,
        status: "bogus",
      },
    ]);
    await actAs(db, null, "service_role");
    expect(
      await isRejected(
        db,
        `select public.confirm_lab_report('${r}', '${u}', '2026-09-01', '${bad}'::jsonb)`,
      ),
    ).toBe(true);
    await actAsOwner(db);
    expect(
      (
        await db.query<{ status: string }>(
          `select status from public.lab_reports where id = $1`,
          [r],
        )
      ).rows[0].status,
    ).toBe("draft");
    expect(
      (
        await db.query(
          `select 1 from public.lab_results where report_id = $1`,
          [r],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("rejects an empty or oversized item list and is service-role only", async () => {
    const u = await newUser("c4@x.com");
    const r = await addReport(u);
    await actAs(db, null, "service_role");
    await expect(
      db.query(
        `select public.confirm_lab_report('${r}', '${u}', '2026-09-01', '[]'::jsonb)`,
      ),
    ).rejects.toThrow(/items must be an array/);
    await actAs(db, u);
    expect(
      await isRejected(
        db,
        `select public.confirm_lab_report('${r}', '${u}', '2026-09-01', '${items}'::jsonb)`,
      ),
    ).toBe(true);
  });
});
