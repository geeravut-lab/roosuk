import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const O = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const X = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const Y = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${O}', 'o@x.test'), ('${M}', 'm@x.test'), ('${X}', 'x@x.test'), ('${Y}', 'y@x.test')`,
  );
});
afterAll(() => db.close());

const rpc = async <T = Record<string, unknown>>(sql: string) => {
  await actAsOwner(db);
  return (await db.query<{ r: T }>(`select ${sql} as r`)).rows[0].r;
};
const invite = (o: string, seats = 1) =>
  rpc<{ ok: boolean; reason?: string; code?: string }>(
    `public.create_family_invite('${o}', ${seats})`,
  );
const accept = (u: string, code: string) =>
  rpc<{ ok: boolean; reason?: string }>(
    `public.accept_family_invite('${u}', '${code}')`,
  );

describe("inviting and joining", () => {
  let code = "";
  it("an owner gets a code; a new one cancels the old; no plan, no code", async () => {
    expect(await invite(O, 0)).toMatchObject({ ok: false, reason: "plan" });
    const a = await invite(O);
    expect(a.ok).toBe(true);
    expect(a.code).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
    const b = await invite(O);
    code = b.code!;
    expect(code).not.toBe(a.code);
    expect(await accept(M, a.code!)).toMatchObject({
      ok: false,
      reason: "revoked",
    });
  });

  it("refuses nonsense, expired codes, your own code and a full family", async () => {
    expect(await accept(M, "ZZZZZZZ")).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await accept(O, code)).toMatchObject({ ok: false, reason: "own" });
    await actAsOwner(db);
    await db.exec(
      `update public.family_invites set expires_at = now() - interval '1 minute' where code = '${code}'`,
    );
    expect(await accept(M, code)).toMatchObject({
      ok: false,
      reason: "expired",
    });
    await db.exec(
      `update public.family_invites set expires_at = now() + interval '1 day' where code = '${code}'`,
    );
  });

  it("a person joins once; the code is then used; the owner's seat is full", async () => {
    expect(await accept(M, ` ${code.toLowerCase()} `)).toEqual({
      ok: true,
      owner: O,
    });
    expect(await accept(X, code)).toMatchObject({ ok: false, reason: "used" });
    expect(await invite(O)).toMatchObject({ ok: false, reason: "full" });
    // a second seat would be allowed on a bigger plan
    expect(await invite(O, 2)).toMatchObject({ ok: true });
  });

  it("nobody is in two families, a member cannot own one, an owner cannot join another", async () => {
    const other = await invite(Y);
    expect(await accept(M, other.code!)).toMatchObject({
      ok: false,
      reason: "in_family",
    });
    expect(await invite(M)).toMatchObject({ ok: false, reason: "is_member" });
    expect(await accept(O, other.code!)).toMatchObject({
      ok: false,
      reason: "owner_busy",
    });
  });
});

describe("sharing", () => {
  it("each side switches its own summaries on, and only the two of them can read the rows", async () => {
    expect(
      await rpc<number>(
        `public.set_family_shares('${O}', '${M}', array['checkin','score'])`,
      ),
    ).toBe(2);
    expect(
      await rpc<number>(
        `public.set_family_shares('${M}', '${O}', array['checkin'])`,
      ),
    ).toBe(1);
    expect(
      await rpc<number>(
        `public.set_family_shares('${X}', '${O}', array['checkin'])`,
      ),
    ).toBe(-1); // not in a family with O
    await actAs(db, M);
    expect(
      (
        await db.query(
          `select direction, scope from public.family_shares order by direction, scope`,
        )
      ).rows,
    ).toHaveLength(3);
    await actAs(db, X);
    expect(
      (await db.query(`select 1 from public.family_shares`)).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`select 1 from public.family_members`)).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`select 1 from public.family_invites`)).rows,
    ).toHaveLength(0);
    await actAs(db, O);
    expect(
      (await db.query(`select 1 from public.family_invites`)).rows.length,
    ).toBeGreaterThan(0);
  });

  it("changing the switches replaces them; an unknown scope is refused", async () => {
    expect(
      await rpc<number>(
        `public.set_family_shares('${O}', '${M}', array['score'])`,
      ),
    ).toBe(1);
    await actAs(db, O);
    expect(
      (
        await db.query<{ scope: string }>(
          `select scope from public.family_shares where direction = 'owner_to_member'`,
        )
      ).rows,
    ).toEqual([{ scope: "score" }]);
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `select public.set_family_shares('${O}', '${M}', array['labs'])`,
      ),
    ).toBe(true);
    expect(
      await rpc<number>(`public.set_family_shares('${O}', '${M}', '{}')`),
    ).toBe(0);
  });

  it("nobody can write these tables from the browser", async () => {
    await actAs(db, O);
    for (const sql of [
      `insert into public.family_shares (member_id, direction, scope) values ('${M}', 'owner_to_member', 'checkin')`,
      `insert into public.family_members (member_id, invite_id, owner_id) values ('${Y}', gen_random_uuid(), '${O}')`,
      `update public.family_invites set seats = 9`,
      `delete from public.family_members`,
    ])
      expect(await isRejected(db, sql)).toBe(true);
    for (const fn of [
      `public.create_family_invite('${O}', 1)`,
      `public.accept_family_invite('${X}', 'AAAAAAA')`,
      `public.end_family_link('${O}', '${M}')`,
      `public.set_family_shares('${O}', '${M}', '{}')`,
    ])
      expect(await isRejected(db, `select ${fn}`)).toBe(true);
  });
});

describe("ending it", () => {
  it("either side can end the link; the shares go with it; the code stays used", async () => {
    await rpc(`public.set_family_shares('${M}', '${O}', array['checkin'])`);
    expect(await rpc<number>(`public.end_family_link('${X}', '${M}')`)).toBe(0); // a stranger ends nothing
    expect(await rpc<number>(`public.end_family_link('${M}', '${O}')`)).toBe(1); // the member leaves
    await actAsOwner(db);
    expect(
      (await db.query(`select 1 from public.family_shares`)).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`select 1 from public.family_members`)).rows,
    ).toHaveLength(0);
    // the seat is free again
    expect(await invite(O)).toMatchObject({ ok: true });
  });

  it("deleting an account takes the link with it, on either side", async () => {
    const code = (await invite(O)).code!;
    expect(await accept(M, code)).toMatchObject({ ok: true });
    await actAsOwner(db);
    await db.exec(`delete from auth.users where id = '${M}'`);
    expect(
      (await db.query(`select 1 from public.family_members`)).rows,
    ).toHaveLength(0);
    // the owner's invite remembers nobody
    expect(
      (
        await db.query<{ accepted_by: string | null }>(
          `select accepted_by from public.family_invites where code = '${code}'`,
        )
      ).rows,
    ).toEqual([{ accepted_by: null }]);
    await db.exec(
      `insert into auth.users (id, email) values ('${M}', 'm@x.test')`,
    );
    const c2 = (await invite(O)).code!;
    await accept(M, c2);
    await db.exec(`delete from auth.users where id = '${O}'`);
    expect(
      (await db.query(`select 1 from public.family_members`)).rows,
    ).toHaveLength(0);
  });
});
