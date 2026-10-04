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

describe("ai_prompt_versions", () => {
  it("is closed to users and anonymous callers", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.ai_prompt_versions (task, body, created_by) values ('chat', 'be brief', '${A}')`,
    );
    for (const [id, role] of [
      [A, "authenticated"],
      [null, "anon"],
    ] as const) {
      await actAs(db, id, role);
      expect(
        await isRejected(db, `select * from public.ai_prompt_versions`),
      ).toBe(true);
      expect(
        await isRejected(
          db,
          `insert into public.ai_prompt_versions (task, body) values ('chat', 'x')`,
        ),
      ).toBe(true);
    }
  });
  it("checks the task name and the size of the text", async () => {
    await actAsOwner(db);
    for (const bad of [
      `'Chat', 'x'`,
      `'x', 'x'`,
      `'chat; drop', 'x'`,
      `'chat', '${"x".repeat(2001)}'`,
    ])
      expect(
        await isRejected(
          db,
          `insert into public.ai_prompt_versions (task, body) values (${bad})`,
        ),
        bad,
      ).toBe(true);
  });
  it("keeps history: the latest row is the current text, and clearing is a row too", async () => {
    await db.exec(
      `insert into public.ai_prompt_versions (task, body) values ('chat', 'be warmer'), ('chat', '')`,
    );
    const r = await db.query<{ body: string }>(
      `select body from public.ai_prompt_versions where task = 'chat' order by id desc limit 1`,
    );
    expect(r.rows[0].body).toBe("");
    expect(
      (
        await db.query(
          `select 1 from public.ai_prompt_versions where task = 'chat'`,
        )
      ).rows,
    ).toHaveLength(3);
  });
  it("keeps the record when the admin who wrote it is deleted", async () => {
    await db.exec(`delete from auth.users where id = '${A}'`);
    const r = await db.query<{ created_by: string | null }>(
      `select created_by from public.ai_prompt_versions where body = 'be brief'`,
    );
    expect(r.rows[0].created_by).toBeNull();
  });
});
