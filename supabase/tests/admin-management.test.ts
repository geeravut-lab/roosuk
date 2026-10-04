import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${OWNER}', 'GeeRavut@Gmail.com'), ('${ADMIN2}', 'second@x.test'), ('${USER}', 'Plain@x.test');
    insert into public.admins (user_id) values ('${OWNER}'), ('${ADMIN2}');
  `);
});
afterAll(() => db.close());

const call = async (sql: string) => {
  await actAsOwner(db);
  return (await db.query<{ r: string }>(`select ${sql} as r`)).rows[0].r;
};
const grant = (actor: string, email: string) =>
  call(`public.grant_admin('${actor}', '${email}')`);
const revoke = (actor: string, target: string) =>
  call(`public.revoke_admin('${actor}', '${target}')`);
const admins = async () => {
  await actAsOwner(db);
  return (
    await db.query<{ user_id: string }>(
      `select user_id from public.admins order by user_id`,
    )
  ).rows.map((r) => r.user_id);
};

describe("grant_admin", () => {
  it("adds an existing account by email (any case, any spaces) and says so once", async () => {
    expect(await grant(ADMIN2, "  plain@X.TEST ")).toBe("ok");
    expect(await admins()).toContain(USER);
    expect(await grant(ADMIN2, "plain@x.test")).toBe("already");
  });
  it("refuses an email nobody has, and an actor who is not an admin", async () => {
    expect(await grant(ADMIN2, "nobody@x.test")).toBe("not_found");
    await actAsOwner(db);
    await db.exec(`delete from public.admins where user_id = '${USER}'`);
    expect(await grant(USER, "second@x.test")).toBe("forbidden");
  });
});

describe("revoke_admin", () => {
  it("removes another admin and writes the audit row", async () => {
    await grant(OWNER, "plain@x.test");
    expect(await revoke(OWNER, USER)).toBe("ok");
    expect(await admins()).not.toContain(USER);
    const log = await db.query(
      `select meta from public.privacy_audit_log where action = 'admin_revoked' and user_id = '${USER}'`,
    );
    expect(log.rows).toEqual([{ meta: { by: OWNER } }]);
    expect(await revoke(OWNER, USER)).toBe("not_admin");
  });
  it("nobody can revoke themselves", async () => {
    expect(await revoke(ADMIN2, ADMIN2)).toBe("self");
  });
  it("the owner's account can never be revoked by anyone else", async () => {
    expect(await revoke(ADMIN2, OWNER)).toBe("protected");
    expect(await admins()).toContain(OWNER);
  });
  it("a non-admin cannot revoke", async () => {
    expect(await revoke(USER, ADMIN2)).toBe("forbidden");
  });
});

describe("who can call them", () => {
  it("only the server (service role)", async () => {
    for (const as of ["authenticated", "anon"] as const) {
      await actAs(db, OWNER, as);
      expect(
        await isRejected(
          db,
          `select public.revoke_admin('${OWNER}', '${USER}')`,
        ),
      ).toBe(true);
      expect(
        await isRejected(
          db,
          `select public.grant_admin('${OWNER}', 'x@x.test')`,
        ),
      ).toBe(true);
      expect(
        await isRejected(db, `select public.user_id_by_email('second@x.test')`),
      ).toBe(true);
    }
  });
});
