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

const insert = (u: string, month: string) =>
  `insert into public.monthly_reports (user_id, month, summary) values ('${u}', '${month}', 'A friendly recap of the month.')`;

describe("monthly_reports", () => {
  it("is written by the server only, one per user and month, and only for a first-of-month date", async () => {
    await actAsOwner(db);
    await db.exec(insert(A, "2026-09-01"));
    await db.exec(insert(B, "2026-09-01"));
    expect(await isRejected(db, insert(A, "2026-09-01"))).toBe(true); // one per month
    expect(await isRejected(db, insert(A, "2026-09-15"))).toBe(true); // not a month start
    expect(
      await isRejected(
        db,
        `insert into public.monthly_reports (user_id, month, summary) values ('${A}', '2026-08-01', 'short')`,
      ),
    ).toBe(true);
  });

  it("a person reads and deletes only their own, and cannot write or edit", async () => {
    await actAs(db, A);
    const mine = await db.query<{ user_id: string }>(
      `select user_id from public.monthly_reports`,
    );
    expect(mine.rows).toEqual([{ user_id: A }]);
    expect(await isRejected(db, insert(A, "2026-07-01"))).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.monthly_reports set summary = 'edited by me, ten chars+'`,
      ),
    ).toBe(true);
    await db.exec(`delete from public.monthly_reports`);
    await actAsOwner(db);
    const left = await db.query<{ user_id: string }>(
      `select user_id from public.monthly_reports`,
    );
    expect(left.rows).toEqual([{ user_id: B }]); // B's row untouched
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.monthly_reports`)).toBe(
      true,
    );
  });

  it("the AI conversation log accepts the new kind and still rejects unknown ones", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.ai_conversations (user_id, kind) values ('${A}', 'monthly_report')`,
    );
    expect(
      await isRejected(
        db,
        `insert into public.ai_conversations (user_id, kind) values ('${A}', 'whatever')`,
      ),
    ).toBe(true);
  });
});
