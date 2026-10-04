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
  await db.exec(
    `insert into public.checkup_leads (user_id, interest, contact_method) values ('${A}', 'checkup', 'line')`,
  );
});
afterAll(() => db.close());

describe("checkup_leads", () => {
  it("a user reads only their own request; nobody else's", async () => {
    await actAs(db, A);
    expect(
      (await db.query(`select id from public.checkup_leads`)).rows,
    ).toHaveLength(1);
    await actAs(db, B);
    expect(
      (await db.query(`select id from public.checkup_leads`)).rows,
    ).toHaveLength(0);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select id from public.checkup_leads`)).toBe(
      true,
    );
  });
  it("users cannot write, edit or delete (the server does)", async () => {
    await actAs(db, A);
    expect(
      await isRejected(
        db,
        `insert into public.checkup_leads (user_id, interest, contact_method) values ('${A}', 'consult', 'line')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `update public.checkup_leads set status = 'done'`),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.checkup_leads`)).toBe(true);
  });
  it("allows one open request per person, and another once it is handled", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `insert into public.checkup_leads (user_id, interest, contact_method) values ('${A}', 'consult', 'line')`,
      ),
    ).toBe(true);
    await db.exec(
      `update public.checkup_leads set status = 'contacted' where user_id = '${A}'`,
    );
    await db.exec(
      `insert into public.checkup_leads (user_id, interest, contact_method) values ('${A}', 'consult', 'line')`,
    );
  });
  it("checks the choices, the phone and the note length", async () => {
    await actAsOwner(db);
    for (const bad of [
      `'${B}', 'surgery', 'line', null, null`,
      `'${B}', 'checkup', 'fax', null, null`,
      `'${B}', 'checkup', 'phone', null, null`, // phone method without a number
      `'${B}', 'checkup', 'phone', 'abc', null`,
      `'${B}', 'checkup', 'line', null, '${"x".repeat(301)}'`,
    ])
      expect(
        await isRejected(
          db,
          `insert into public.checkup_leads (user_id, interest, contact_method, phone, note) values (${bad})`,
        ),
        bad,
      ).toBe(true);
    await db.exec(
      `insert into public.checkup_leads (user_id, interest, contact_method, phone) values ('${B}', 'home_service', 'phone', '081-234-5678')`,
    );
  });
  it("is erased with the account", async () => {
    await db.exec(`delete from auth.users where id = '${B}'`);
    expect(
      (
        await db.query(
          `select 1 from public.checkup_leads where user_id = '${B}'`,
        )
      ).rows,
    ).toHaveLength(0);
  });
});
