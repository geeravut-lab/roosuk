import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TODAY = "2026-10-20";
let company = "";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test'), ('${C}', 'c@x.test')`,
  );
  company = (
    await db.query<{ id: string }>(
      `insert into public.companies (name, code, seats, valid_until) values ('Acme', 'ACME234', 2, '2026-12-31') returning id`,
    )
  ).rows[0].id;
});
afterAll(() => db.close());

const rpc = async <T = Record<string, unknown>>(sql: string) => {
  await actAsOwner(db);
  return (await db.query<{ r: T }>(`select ${sql} as r`)).rows[0].r;
};
const join = (u: string, code: string, today = TODAY) =>
  rpc<{ ok: boolean; reason?: string }>(
    `public.join_company('${u}', '${code}', '${today}')`,
  );

describe("companies", () => {
  it("are the admin's: nobody reads or writes them from the browser", async () => {
    await actAs(db, A);
    expect(await isRejected(db, `select * from public.companies`)).toBe(true);
    expect(
      await isRejected(db, `update public.companies set seats = 9999`),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `select public.join_company('${A}', 'ACME234', '${TODAY}')`,
      ),
    ).toBe(true);
  });
  it("a code is 6–10 letters and digits without look-alikes; seats and plan are sane", async () => {
    await actAsOwner(db);
    for (const sql of [
      `insert into public.companies (name, code, seats, valid_until) values ('x', 'AB0DEF', 5, '2027-01-01')`,
      `insert into public.companies (name, code, seats, valid_until) values ('x', 'SHORT', 5, '2027-01-01')`,
      `insert into public.companies (name, code, seats, valid_until) values ('x', 'ZZZZZZ2', 0, '2027-01-01')`,
      `insert into public.companies (name, code, seats, tier, valid_until) values ('x', 'ZZZZZZ3', 5, 'free', '2027-01-01')`,
    ])
      expect(await isRejected(db, sql)).toBe(true);
  });
});

describe("join_company", () => {
  it("an employee joins once with the code (typed any way); the seats run out", async () => {
    expect(await join(A, " acme234 ")).toMatchObject({
      ok: true,
      name: "Acme",
    });
    expect(await join(A, "ACME234")).toMatchObject({
      ok: false,
      reason: "in_company",
    });
    expect(await join(B, "ACME234")).toMatchObject({ ok: true });
    expect(await join(C, "ACME234")).toMatchObject({
      ok: false,
      reason: "full",
    });
  });
  it("refuses an unknown code, an inactive company and an expired one", async () => {
    expect(await join(C, "NOPE234")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    await actAsOwner(db);
    await db.exec(
      `update public.companies set active = false where id = '${company}'`,
    );
    expect(await join(C, "ACME234")).toMatchObject({
      ok: false,
      reason: "inactive",
    });
    await db.exec(
      `update public.companies set active = true where id = '${company}'`,
    );
    expect(await join(C, "ACME234", "2027-01-01")).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });
  it("a member sees only their own membership; the counting-me-in switch starts off", async () => {
    await actAs(db, A);
    const mine = await db.query<{ share_stats: boolean }>(
      `select share_stats from public.company_members`,
    );
    expect(mine.rows).toEqual([{ share_stats: false }]);
    expect(
      await isRejected(
        db,
        `update public.company_members set share_stats = true`,
      ),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.company_members`)).toBe(
      true,
    );
    await actAs(db, C);
    expect(
      (await db.query(`select 1 from public.company_members`)).rows,
    ).toHaveLength(0);
  });
  it("a member goes with their account, and the company's members with the company", async () => {
    await actAsOwner(db);
    await db.exec(`delete from auth.users where id = '${A}'`);
    expect(
      (
        await db.query(
          `select 1 from public.company_members where user_id = '${A}'`,
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec(`delete from public.companies where id = '${company}'`);
    expect(
      (await db.query(`select 1 from public.company_members`)).rows,
    ).toHaveLength(0);
  });
});

describe("make_creator", () => {
  const make = (email: string, slug: string, name = "Maya") =>
    rpc<string>(`public.make_creator('${email}', '${slug}', '${name}')`);
  it("gives the account its own code and a creator row; a code is one person's", async () => {
    expect(await make("b@x.test", "maya23")).toBe("ok");
    await actAsOwner(db);
    const code = await db.query(
      `select code from public.referral_codes where user_id = '${B}'`,
    );
    expect(code.rows).toEqual([{ code: "MAYA23" }]);
    expect(await make("c@x.test", "MAYA23")).toBe("taken");
    expect(await make("b@x.test", "mayaxy", "Maya L.")).toBe("ok"); // changing it is fine
    const row = await db.query(
      `select display_name from public.creators where user_id = '${B}'`,
    );
    expect(row.rows).toEqual([{ display_name: "Maya L." }]);
  });
  it("refuses an unknown email and an unusable code", async () => {
    expect(await make("nobody@x.test", "NEWKXZ")).toBe("not_found");
    for (const bad of ["ab", "AB0IOL", "TOO-LONG-CODE!", ""])
      expect(await make("c@x.test", bad)).toBe("invalid");
  });
  it("is the server's: not callable by a person", async () => {
    await actAs(db, B);
    expect(
      await isRejected(
        db,
        `select public.make_creator('c@x.test', 'ZZZZZZ', 'x')`,
      ),
    ).toBe(true);
    expect(
      (await db.query(`select user_id from public.creators`)).rows,
    ).toEqual([{ user_id: B }]);
    expect(
      await isRejected(
        db,
        `insert into public.creators (user_id, display_name) values ('${B}', 'x')`,
      ),
    ).toBe(true);
  });
});
