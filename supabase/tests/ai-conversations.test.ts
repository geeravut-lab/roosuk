import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

async function newUser(email: string): Promise<string> {
  await actAsOwner(db);
  return (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    )
  ).rows[0].id;
}

async function addConversation(
  user: string,
  kind = "chat",
  reportId: string | null = null,
) {
  await actAs(db, null, "service_role");
  return (
    await db.query<{ id: string }>(
      `insert into public.ai_conversations (user_id, kind, report_id) values ($1, $2, $3) returning id`,
      [user, kind, reportId],
    )
  ).rows[0].id;
}

async function addMessage(
  conv: string,
  user: string,
  role: string,
  content: string,
  flag: string | null = null,
) {
  await actAs(db, null, "service_role");
  await db.query(
    `insert into public.ai_messages (conversation_id, user_id, role, content, flag) values ($1, $2, $3, $4, $5)`,
    [conv, user, role, content, flag],
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

describe("ai_conversations / ai_messages", () => {
  it("lets users read and delete only their own history, never write it", async () => {
    const ca = await addConversation(alice);
    await addMessage(ca, alice, "user", "question");
    await addMessage(ca, alice, "assistant", "answer");
    const cb = await addConversation(bob);
    await addMessage(cb, bob, "user", "bob's question");

    await actAs(db, alice);
    expect(
      (await db.query(`select 1 from public.ai_conversations`)).rows,
    ).toHaveLength(1);
    expect(
      (await db.query(`select 1 from public.ai_messages`)).rows,
    ).toHaveLength(2);
    expect(
      await isRejected(
        db,
        `insert into public.ai_conversations (user_id, kind) values ('${alice}', 'chat')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.ai_messages (conversation_id, user_id, role, content) values ('${ca}', '${alice}', 'assistant', 'forged answer')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(db, `update public.ai_messages set content = 'edited'`),
    ).toBe(true);

    await actAs(db, bob);
    expect(
      (
        await db.query(
          `delete from public.ai_messages where conversation_id = $1 returning 1`,
          [ca],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `delete from public.ai_conversations where id = $1 returning 1`,
          [ca],
        )
      ).rows,
    ).toHaveLength(0);

    await actAs(db, alice);
    expect(
      (
        await db.query(
          `delete from public.ai_conversations where id = $1 returning 1`,
          [ca],
        )
      ).rows,
    ).toHaveLength(1);
    await actAsOwner(db);
    expect(
      (
        await db.query(
          `select 1 from public.ai_messages where conversation_id = $1`,
          [ca],
        )
      ).rows,
    ).toHaveLength(0); // messages cascade
  });

  it("denies anonymous access", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select 1 from public.ai_conversations`)).toBe(
      true,
    );
    expect(await isRejected(db, `select 1 from public.ai_messages`)).toBe(true);
  });

  it("validates kind, role, content and flag", async () => {
    const c = await addConversation(alice);
    await actAs(db, null, "service_role");
    expect(
      await isRejected(
        db,
        `insert into public.ai_conversations (user_id, kind) values ('${alice}', 'weird')`,
      ),
    ).toBe(true);
    const bad = (role: string, content: string, flag: string | null = null) =>
      isRejected(
        db,
        `insert into public.ai_messages (conversation_id, user_id, role, content, flag) values ('${c}', '${alice}', '${role}', ${content}, ${flag === null ? "null" : `'${flag}'`})`,
      );
    expect(await bad("system", "'x'")).toBe(true);
    expect(await bad("user", "''")).toBe(true);
    expect(await bad("user", "repeat('x', 8001)")).toBe(true);
    expect(await bad("assistant", "'ok'", "x".repeat(41))).toBe(true);
    expect(await bad("assistant", "'ok'", "")).toBe(true);
    await addMessage(c, alice, "assistant", "fine", "see_doctor");
  });

  it("keeps a conversation when its lab report is deleted, and cascades with the account", async () => {
    const u = await newUser("lab@x.com");
    await actAs(db, null, "service_role");
    const report = (
      await db.query<{ id: string }>(
        `insert into public.lab_reports (user_id, items) values ($1, '[{"name":"FBS"}]'::jsonb) returning id`,
        [u],
      )
    ).rows[0].id;
    const c = await addConversation(u, "lab_explain", report);
    await addMessage(c, u, "assistant", "explanation");
    await actAsOwner(db);
    await db.query(`delete from public.lab_reports where id = $1`, [report]);
    expect(
      (
        await db.query<{ report_id: string | null }>(
          `select report_id from public.ai_conversations where id = $1`,
          [c],
        )
      ).rows[0].report_id,
    ).toBeNull();
    await db.query(`delete from auth.users where id = $1`, [u]);
    expect(
      (
        await db.query(
          `select 1 from public.ai_conversations where user_id = $1`,
          [u],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(`select 1 from public.ai_messages where user_id = $1`, [
          u,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it("only the server can set a lab report's explanation", async () => {
    const u = await newUser("expl@x.com");
    await actAs(db, null, "service_role");
    const r = (
      await db.query<{ id: string }>(
        `insert into public.lab_reports (user_id, items) values ($1, '[{"name":"FBS"}]'::jsonb) returning id`,
        [u],
      )
    ).rows[0].id;
    await db.query(
      `update public.lab_reports set explanation = '{"summary":"x"}'::jsonb, explained_at = now() where id = $1`,
      [r],
    );
    expect(
      await isRejected(
        db,
        `update public.lab_reports set explanation = '[]'::jsonb where id = '${r}'`,
      ),
    ).toBe(true);
    await actAs(db, u);
    expect(
      await isRejected(
        db,
        `update public.lab_reports set explanation = '{"summary":"forged"}'::jsonb where id = '${r}'`,
      ),
    ).toBe(true);
    expect(
      (
        await db.query<{ explanation: { summary: string } }>(
          `select explanation from public.lab_reports where id = $1`,
          [r],
        )
      ).rows[0].explanation.summary,
    ).toBe("x");
  });
});
