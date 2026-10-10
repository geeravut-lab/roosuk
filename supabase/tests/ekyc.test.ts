import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const U3 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@x.test'), ('${U1}', 'u1@x.test'), ('${U2}', 'u2@x.test'), ('${U3}', 'u3@x.test');
    insert into public.admins (user_id) values ('${ADMIN}');
  `);
}, 60_000);
afterAll(() => db.close());

const q = async <T>(sql: string) => {
  await actAsOwner(db);
  return (await db.query<T>(sql)).rows;
};
const attempt = async (user: string, max = 5) =>
  (
    await q<{ r: string }>(`select public.ekyc_begin_attempt('${user}', ${max}) as r`)
  )[0].r;
const verification = async (user: string, status: string) =>
  (
    await q<{ id: string }>(
      `insert into public.ekyc_verifications (user_id, doc_type, status, doc_name, doc_number_masked, face_score, steps)
       values ('${user}', 'thai_id', '${status}', 'SOMCHAI J', '•••••••1234', 91.5, '{"liveness": true, "face_match": ${status === "passed"}}') returning id`,
    )
  )[0].id;
const verified = async (user: string) =>
  (await q<{ v: boolean }>(`select public.is_kyc_verified('${user}') as v`))[0].v;

describe("settings", () => {
  it("start switched OFF with sane defaults, and only the service role changes them", async () => {
    const [s] = await q<Record<string, unknown>>(`select * from public.ekyc_settings`);
    expect(s).toMatchObject({
      enabled: false,
      thai_id: true,
      passport: true,
      liveness: true,
      face_match: true,
      max_attempts_per_day: 5,
    });
    await actAs(db, U1);
    expect((await db.query(`select 1 from public.ekyc_settings`)).rows).toHaveLength(1);
    expect(await isRejected(db, `update public.ekyc_settings set enabled = true`)).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.ekyc_settings`)).toBe(true);
  });
  it("keeps thresholds in range", async () => {
    await actAsOwner(db);
    expect(await isRejected(db, `update public.ekyc_settings set liveness_threshold = 1.5`)).toBe(true);
    expect(await isRejected(db, `update public.ekyc_settings set face_threshold = 120`)).toBe(true);
    expect(await isRejected(db, `update public.ekyc_settings set max_attempts_per_day = 0`)).toBe(true);
  });
});

describe("a person cannot verify themselves", () => {
  it("can read only their own results and write nothing", async () => {
    await verification(U1, "passed");
    await actAs(db, U2);
    expect((await db.query(`select * from public.ekyc_verifications`)).rows).toHaveLength(0);
    await actAs(db, U1);
    expect((await db.query(`select status from public.ekyc_verifications`)).rows).toEqual([
      { status: "passed" },
    ]);
    for (const sql of [
      `insert into public.ekyc_verifications (user_id, doc_type, status) values ('${U1}', 'passport', 'approved')`,
      `update public.ekyc_verifications set status = 'approved'`,
      `delete from public.ekyc_verifications`,
      `select * from public.ekyc_attempts`,
      `insert into public.ekyc_attempts (user_id) values ('${U1}')`,
    ])
      expect(await isRejected(db, sql), sql).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.ekyc_verifications`)).toBe(true);
    // nor can a person ask the database whether someone is verified, or start an attempt
    await actAs(db, U2);
    expect(await isRejected(db, `select public.is_kyc_verified('${U1}')`)).toBe(true);
    expect(await isRejected(db, `select public.ekyc_begin_attempt('${U2}', 5)`)).toBe(true);
    expect(
      await isRejected(db, `select public.ekyc_admin_review('${U2}', gen_random_uuid(), true, 'x')`),
    ).toBe(true);
  });
  it("is_kyc_verified counts passed and approved only", async () => {
    expect(await verified(U1)).toBe(true);
    await verification(U2, "review");
    expect(await verified(U2)).toBe(false);
    await q(`update public.ekyc_verifications set status = 'rejected' where user_id = '${U2}'`);
    expect(await verified(U2)).toBe(false);
  });
  it("at most one live verification per person", async () => {
    await actAsOwner(db);
    expect(await isRejected(db, `insert into public.ekyc_verifications (user_id, doc_type, status) values ('${U1}', 'passport', 'approved')`)).toBe(true);
    // history of failed/revoked ones is fine
    await verification(U1, "revoked");
    await q(`delete from public.ekyc_verifications where user_id = '${U1}' and status = 'revoked'`);
  });
});

describe("ekyc_begin_attempt", () => {
  it("never re-verifies a verified person (and does not count an attempt)", async () => {
    expect(await attempt(U1)).toBe("verified");
    expect((await q(`select 1 from public.ekyc_attempts where user_id = '${U1}'`))).toHaveLength(0);
  });
  it("allows the daily limit, then says 'limit'; a fresh day starts again", async () => {
    for (let i = 0; i < 3; i++) expect(await attempt(U3, 3)).toBe("ok");
    expect(await attempt(U3, 3)).toBe("limit");
    await q(`update public.ekyc_attempts set created_at = now() - interval '25 hours' where user_id = '${U3}'`);
    expect(await attempt(U3, 3)).toBe("ok");
  });
  it("a failure waiting for an admin blocks more attempts until decided", async () => {
    const U4 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await q(`insert into auth.users (id, email) values ('${U4}', 'u4@x.test')`);
    await verification(U4, "review");
    expect(await attempt(U4)).toBe("pending");
    await q(`update public.ekyc_verifications set status = 'rejected' where user_id = '${U4}'`);
    expect(await attempt(U4)).toBe("ok");
  });
});

describe("the admin's decisions are audited and only for admins", () => {
  it("approve and reject a review, once", async () => {
    const U5 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await q(`insert into auth.users (id, email) values ('${U5}', 'u5@x.test')`);
    const id = await verification(U5, "review");
    const call = async (actor: string, approve: boolean) =>
      (
        await q<{ r: string }>(
          `select public.ekyc_admin_review('${actor}', '${id}', ${approve}, 'looked fine') as r`,
        )
      )[0].r;
    expect(await call(U1, true)).toBe("forbidden");
    expect(await call(ADMIN, true)).toBe("ok");
    expect(await verified(U5)).toBe(true);
    expect(await call(ADMIN, false)).toBe("state");
    const audit = await q(
      `select action, meta->>'by' as by from public.privacy_audit_log where user_id = '${U5}' and action like 'ekyc_%'`,
    );
    expect(audit).toEqual([{ action: "ekyc_approved", by: ADMIN }]);
    const [row] = await q<{ status: string; reviewed_by: string; review_note: string }>(
      `select status, reviewed_by, review_note from public.ekyc_verifications where id = '${id}'`,
    );
    expect(row).toEqual({ status: "approved", reviewed_by: ADMIN, review_note: "looked fine" });
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_review('${ADMIN}', gen_random_uuid(), true, '') as r`))[0].r,
    ).toBe("not_found");
  });

  it("a rejection leaves the person unverified", async () => {
    const U6 = "99999999-9999-4999-8999-999999999999";
    await q(`insert into auth.users (id, email) values ('${U6}', 'u6@x.test')`);
    const id = await verification(U6, "review");
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_review('${ADMIN}', '${id}', false, 'blurry') as r`))[0].r,
    ).toBe("ok");
    expect(await verified(U6)).toBe(false);
  });

  it("revoke takes a verification back, only an admin can, and the product gate follows", async () => {
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_revoke('${U2}', '${U1}', 'x') as r`))[0].r,
    ).toBe("forbidden");
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_revoke('${ADMIN}', '${U1}', 'fraud') as r`))[0].r,
    ).toBe("ok");
    expect(await verified(U1)).toBe(false);
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_revoke('${ADMIN}', '${U1}', '') as r`))[0].r,
    ).toBe("not_verified");
    // revoked => the person may verify again
    expect(await attempt(U1)).toBe("ok");
  });

  it("reset gives a fresh day of attempts and closes a stuck review", async () => {
    const U7 = "88888888-8888-4888-8888-888888888888";
    await q(`insert into auth.users (id, email) values ('${U7}', 'u7@x.test')`);
    for (let i = 0; i < 2; i++) await attempt(U7, 2);
    expect(await attempt(U7, 2)).toBe("limit");
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_reset('${U2}', '${U7}') as r`))[0].r,
    ).toBe("forbidden");
    expect(
      (await q<{ r: string }>(`select public.ekyc_admin_reset('${ADMIN}', '${U7}') as r`))[0].r,
    ).toBe("ok");
    expect(await attempt(U7, 2)).toBe("ok");
  });
});

describe("account deletion", () => {
  it("erases the person's verifications and attempts with the account", async () => {
    const U8 = "77777777-7777-4777-8777-777777777777";
    await q(`insert into auth.users (id, email) values ('${U8}', 'u8@x.test')`);
    await verification(U8, "passed");
    await attempt(U8);
    await q(`delete from auth.users where id = '${U8}'`);
    expect(await q(`select 1 from public.ekyc_verifications where user_id = '${U8}'`)).toHaveLength(0);
    expect(await q(`select 1 from public.ekyc_attempts where user_id = '${U8}'`)).toHaveLength(0);
  });
});
