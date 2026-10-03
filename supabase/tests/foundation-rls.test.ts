import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
let alice: string;
let bob: string;

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return (await db.query(sql, params)).rows.length;
}

beforeAll(async () => {
  db = await createTestDb();
  alice = (
    await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ('a@x.com', '{"full_name":" Alice "}') returning id`,
    )
  ).rows[0].id;
  bob = (
    await db.query<{ id: string }>(
      `insert into auth.users (email) values ('b@x.com') returning id`,
    )
  ).rows[0].id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("profiles", () => {
  it("are created by a trigger, with the display name trimmed from metadata", async () => {
    await actAsOwner(db);
    const rows = (
      await db.query<{ display_name: string | null }>(
        "select display_name from public.profiles",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.display_name)).toContain("Alice");
  });

  it("are visible only to their owner", async () => {
    await actAs(db, alice);
    expect(await count("select * from public.profiles")).toBe(1);
  });

  it("can be edited by the owner but only in the granted columns", async () => {
    await actAs(db, alice);
    expect(
      await count(
        "update public.profiles set language='en' where id=$1 returning id",
        [alice],
      ),
    ).toBe(1);
    expect(
      await isRejected(
        db,
        `update public.profiles set created_at = now() where id='${alice}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.profiles set language='fr' where id='${alice}'`,
      ),
    ).toBe(true);
  });

  it("cannot be edited by someone else (the UPDATE matches 0 rows)", async () => {
    await actAs(db, alice);
    expect(
      await count(
        "update public.profiles set display_name='x' where id=$1 returning id",
        [bob],
      ),
    ).toBe(0);
  });
});

describe("consent_records", () => {
  it("can be appended by the owner", async () => {
    await actAs(db, alice);
    const out = await db.query(
      `insert into public.consent_records (user_id, policy_version, items) values ('${alice}', '2026-10-03', '{"terms_privacy":true}') returning id`,
    );
    expect(out.rows).toHaveLength(1);
  });

  it("cannot be written for another user, with a client timestamp, or with non-object items", async () => {
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `insert into public.consent_records (user_id, policy_version, items) values ('${bob}', 'v', '{}')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.consent_records (user_id, policy_version, items, accepted_at) values ('${alice}', 'v', '{}', '2000-01-01')`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.consent_records (user_id, policy_version, items) values ('${alice}', 'v', '[]')`,
      ),
    ).toBe(true);
  });

  it("is append-only: no update or delete, even by the owner", async () => {
    await actAs(db, alice);
    expect(
      await isRejected(
        db,
        `update public.consent_records set policy_version='z' where user_id='${alice}'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `delete from public.consent_records where user_id='${alice}'`,
      ),
    ).toBe(true);
  });

  it("is invisible to other users", async () => {
    await actAs(db, bob);
    expect(await count("select * from public.consent_records")).toBe(0);
  });
});

describe("admins", () => {
  it("nobody is admin by default and users cannot promote themselves", async () => {
    await actAs(db, bob);
    expect(
      (await db.query<{ v: boolean }>("select public.is_admin() as v")).rows[0]
        .v,
    ).toBe(false);
    expect(
      await isRejected(
        db,
        `insert into public.admins (user_id) values ('${bob}')`,
      ),
    ).toBe(true);
  });

  it("is_admin() is true for a row inserted with the service role, and rows are private", async () => {
    await actAsOwner(db);
    await db.query("insert into public.admins (user_id) values ($1)", [alice]);
    await actAs(db, alice);
    expect(
      (await db.query<{ v: boolean }>("select public.is_admin() as v")).rows[0]
        .v,
    ).toBe(true);
    expect(await count("select * from public.admins")).toBe(1);
    await actAs(db, bob);
    expect(await count("select * from public.admins")).toBe(0);
  });
});

describe("platform_settings", () => {
  it("is readable by signed-in users but writable only by the service role", async () => {
    await actAs(db, bob);
    expect(await count("select * from public.platform_settings")).toBe(1);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set feature_flags='{"voice":false}'`,
      ),
    ).toBe(true);
  });

  it("enforces its own invariants", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set manual_url='http://insecure.example'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `update public.platform_settings set feature_flags='[]'`,
      ),
    ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.platform_settings (id) values (false)`,
      ),
    ).toBe(true);
  });
});

describe("anonymous visitors and service-only tables", () => {
  it("anon can read none of the tables", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, "select * from public.profiles")).toBe(true);
    expect(await isRejected(db, "select * from public.platform_settings")).toBe(
      true,
    );
    expect(await isRejected(db, "select * from public.consent_records")).toBe(
      true,
    );
  });

  it("signed-in users cannot read the audit log or write LINE links", async () => {
    await actAs(db, bob);
    expect(await isRejected(db, "select * from public.privacy_audit_log")).toBe(
      true,
    );
    expect(
      await isRejected(
        db,
        `insert into public.line_links (user_id, line_sub) values ('${bob}', 'U1')`,
      ),
    ).toBe(true);
  });

  it("the service role can write LINE links, and a LINE account links only once", async () => {
    await actAs(db, null, "service_role");
    expect(
      await count(
        `insert into public.line_links (user_id, line_sub) values ('${alice}', 'U1') returning user_id`,
      ),
    ).toBe(1);
    expect(
      await isRejected(
        db,
        `insert into public.line_links (user_id, line_sub) values ('${bob}', 'U1')`,
      ),
    ).toBe(true);
  });
});

describe("account deletion", () => {
  it("cascades to every user-owned row but keeps the audit trail (user_id → null)", async () => {
    await actAsOwner(db);
    await db.query(
      "insert into public.privacy_audit_log (user_id, action) values ($1, 'data_export')",
      [alice],
    );
    await db.query("delete from auth.users where id = $1", [alice]);

    for (const [table, column] of [
      ["profiles", "id"],
      ["admins", "user_id"],
      ["consent_records", "user_id"],
      ["line_links", "user_id"],
    ]) {
      expect(
        await count(`select 1 from public.${table} where ${column} = $1`, [
          alice,
        ]),
      ).toBe(0);
    }
    const audit = (
      await db.query<{ user_id: string | null }>(
        "select user_id from public.privacy_audit_log",
      )
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBeNull();
  });
});
