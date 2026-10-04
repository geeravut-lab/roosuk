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

const note = (u: string, kind = "score_drop", anchor = "2026-10-12") =>
  `insert into public.insight_notes (user_id, kind, anchor, summary) values ('${u}', '${kind}', '${anchor}', 'A calm explanation of the pattern.')`;

describe("insight_notes", () => {
  it("one per person, kind and anchor; only known kinds", async () => {
    await actAsOwner(db);
    await db.exec(note(A));
    await db.exec(note(B));
    expect(await isRejected(db, note(A))).toBe(true);
    await db.exec(note(A, "score_drop", "2026-10-19")); // a new week is a new note
    expect(await isRejected(db, note(A, "diagnosis"))).toBe(true);
    expect(await isRejected(db, note(A, "sleep_short", ""))).toBe(true);
  });

  it("a person reads and deletes their own only, and cannot write or edit", async () => {
    await actAs(db, A);
    const mine = await db.query<{ user_id: string }>(
      `select distinct user_id from public.insight_notes`,
    );
    expect(mine.rows).toEqual([{ user_id: A }]);
    expect(await isRejected(db, note(A, "comeback"))).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.insight_notes set summary = 'edited by me, long enough'`,
      ),
    ).toBe(true);
    await db.exec(`delete from public.insight_notes`);
    await actAsOwner(db);
    const left = await db.query<{ user_id: string }>(
      `select user_id from public.insight_notes`,
    );
    expect(left.rows).toEqual([{ user_id: B }]);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.insight_notes`)).toBe(
      true,
    );
  });

  it("the AI log accepts the insight kind", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.ai_conversations (user_id, kind) values ('${A}', 'insight')`,
    );
  });
});
