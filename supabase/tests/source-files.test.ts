import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let fileA: string;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test')`,
  );
  const r = await db.query<{ id: string }>(
    `insert into public.source_files (user_id, kind, mime, bytes, object_path)
     values ('${A}', 'lab', 'application/pdf', 1000, '${A}/one.enc') returning id`,
  );
  fileA = r.rows[0].id;
});
afterAll(() => db.close());

describe("source_files", () => {
  it("a user reads only their own file rows", async () => {
    await actAs(db, A);
    expect(
      (await db.query(`select id from public.source_files`)).rows,
    ).toHaveLength(1);
    await actAs(db, B);
    expect(
      (await db.query(`select id from public.source_files`)).rows,
    ).toHaveLength(0);
  });
  it("users cannot write or delete rows (the server does, with the object)", async () => {
    await actAs(db, A);
    expect(
      await isRejected(
        db,
        `insert into public.source_files (user_id, kind, mime, bytes, object_path) values ('${A}', 'food', 'image/png', 5, '${A}/two.enc')`,
      ),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.source_files`)).toBe(true);
    expect(
      await isRejected(db, `update public.source_files set kind = 'food'`),
    ).toBe(true);
  });
  it("anonymous sees nothing", async () => {
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select id from public.source_files`)).toBe(
      true,
    );
  });
  it("validates kind, mime, size and a unique object path", async () => {
    await actAsOwner(db);
    for (const bad of [
      `'${A}', 'selfie', 'image/png', 5, '${A}/x1.enc'`,
      `'${A}', 'food', 'text/html', 5, '${A}/x2.enc'`,
      `'${A}', 'food', 'image/png', 0, '${A}/x3.enc'`,
      `'${A}', 'food', 'image/png', 99999999, '${A}/x4.enc'`,
      `'${A}', 'food', 'image/png', 5, '${A}/one.enc'`,
    ])
      expect(
        await isRejected(
          db,
          `insert into public.source_files (user_id, kind, mime, bytes, object_path) values (${bad})`,
        ),
        bad,
      ).toBe(true);
  });
  it("deleting a file row clears the pointer on its report; deleting the user removes their rows", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.lab_reports (id, user_id, items, source_file_id)
       values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${A}', '[{"name":"x"}]', '${fileA}')`,
    );
    await db.exec(`delete from public.source_files where id = '${fileA}'`);
    const r = await db.query<{ source_file_id: string | null }>(
      `select source_file_id from public.lab_reports where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'`,
    );
    expect(r.rows[0].source_file_id).toBeNull();
    await db.exec(
      `insert into public.source_files (user_id, kind, mime, bytes, object_path) values ('${B}', 'food', 'image/png', 5, '${B}/b.enc')`,
    );
    await db.exec(`delete from auth.users where id = '${B}'`);
    expect(
      (
        await db.query(
          `select 1 from public.source_files where user_id = '${B}'`,
        )
      ).rows,
    ).toHaveLength(0);
  });
});
