import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test')`,
  );
});
afterAll(() => db.close());

const insert = (
  u: string,
  secret: string,
  expires = "now() + interval '1 day'",
) =>
  `insert into public.health_passports (user_id, token_hash, label, sections, snapshot, expires_at)
   values ('${u}', '${hash(secret)}', 'For Dr. Lee', array['profile'], '{"v":1}'::jsonb, ${expires})`;

const open = async (secret: string) => {
  await actAsOwner(db);
  return (
    await db.query<{ status: string; snapshot: unknown }>(
      `select status, snapshot from public.open_passport('${hash(secret)}')`,
    )
  ).rows[0];
};

describe("health_passports", () => {
  it("is written by the server only, and the secret is stored hashed and unique", async () => {
    await actAsOwner(db);
    await db.exec(insert(A, "secret-a"));
    expect(await isRejected(db, insert(B, "secret-a"))).toBe(true); // same secret twice
    expect(
      await isRejected(
        db,
        `insert into public.health_passports (user_id, token_hash, label, sections, snapshot, expires_at)
         values ('${A}', 'plain-token', 'x', array['profile'], '{}', now())`,
      ),
    ).toBe(true); // not a sha-256
    await actAs(db, A);
    expect(await isRejected(db, insert(A, "secret-mine"))).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.health_passports set expires_at = now() + interval '90 days'`,
      ),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.health_passports`)).toBe(
      true,
    );
  });

  it("a person sees only their own links; nobody anonymous sees any", async () => {
    await actAsOwner(db);
    await db.exec(insert(B, "secret-b"));
    await actAs(db, A);
    expect(
      (await db.query(`select user_id from public.health_passports`)).rows,
    ).toEqual([{ user_id: A }]);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.health_passports`)).toBe(
      true,
    );
    expect(
      await isRejected(
        db,
        `select * from public.open_passport('${hash("secret-a")}')`,
      ),
    ).toBe(true); // the opener is not callable from the browser
  });

  it("opening a live link returns the snapshot and counts the view", async () => {
    const r = await open("secret-a");
    expect(r).toEqual({ status: "ok", snapshot: { v: 1 } });
    await open("secret-a");
    await actAsOwner(db);
    const row = (
      await db.query<{ view_count: number }>(
        `select view_count from public.health_passports where token_hash = '${hash("secret-a")}'`,
      )
    ).rows[0];
    expect(row.view_count).toBe(2);
  });

  it("an expired, cancelled or unknown link opens nothing and counts nothing", async () => {
    await actAsOwner(db);
    await db.exec(insert(A, "secret-old", "now() - interval '1 minute'"));
    expect(await open("secret-old")).toEqual({
      status: "expired",
      snapshot: null,
    });
    await db.exec(
      `update public.health_passports set revoked_at = now() where token_hash = '${hash("secret-b")}'`,
    );
    expect(await open("secret-b")).toEqual({
      status: "revoked",
      snapshot: null,
    });
    expect(await open("never-made")).toEqual({
      status: "missing",
      snapshot: null,
    });
    const views = (
      await db.query<{ n: number }>(
        `select coalesce(sum(view_count),0)::int as n from public.health_passports where token_hash in ('${hash("secret-old")}', '${hash("secret-b")}')`,
      )
    ).rows[0];
    expect(views.n).toBe(0);
  });

  it("the link goes with the account", async () => {
    await actAsOwner(db);
    await db.exec(`delete from auth.users where id = '${B}'`);
    expect(
      (
        await db.query(
          `select 1 from public.health_passports where user_id = '${B}'`,
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("the conversation log accepts the brief", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.ai_conversations (user_id, kind) values ('${A}', 'doctor_brief')`,
    );
  });
});
