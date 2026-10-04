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

const reminder = (u: string, text = "Ask about my blood test") =>
  `insert into public.agent_reminders (user_id, remind_on, text) values ('${u}', '2026-11-01', '${text}')`;

describe("agent_reminders", () => {
  it("is written by the server only; the text must be a real line", async () => {
    await actAsOwner(db);
    await db.exec(reminder(A));
    await db.exec(reminder(B));
    expect(await isRejected(db, reminder(A, "ab"))).toBe(true);
    expect(await isRejected(db, reminder(A, "x".repeat(201)))).toBe(true);
    await actAs(db, A);
    expect(await isRejected(db, reminder(A))).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.agent_reminders set notified_at = now()`,
      ),
    ).toBe(true);
  });

  it("a person reads and cancels only their own", async () => {
    await actAs(db, A);
    expect(
      (await db.query(`select user_id from public.agent_reminders`)).rows,
    ).toEqual([{ user_id: A }]);
    await db.exec(`delete from public.agent_reminders`);
    await actAsOwner(db);
    expect(
      (await db.query(`select user_id from public.agent_reminders`)).rows,
    ).toEqual([{ user_id: B }]);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.agent_reminders`)).toBe(
      true,
    );
  });

  it("the agent's conversations are logged like the others", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.ai_conversations (user_id, kind) values ('${A}', 'agent')`,
    );
  });

  it("the delivering rule is registered, after the check-up one", async () => {
    await actAsOwner(db);
    const keys = (
      await db.query<{ key: string }>(
        `select key from public.automation_rules order by sort_order`,
      )
    ).rows.map((r) => r.key);
    expect(keys.indexOf("agent_reminders")).toBe(
      keys.indexOf("checkup_reminder") + 1,
    );
  });
});
