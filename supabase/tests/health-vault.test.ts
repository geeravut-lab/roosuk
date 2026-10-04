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

let n = 0;
const file = (u: string, kind: string, extra = "") =>
  `insert into public.source_files (user_id, kind, mime, bytes, object_path${extra ? ", " + extra.split("|")[0] : ""})
   values ('${u}', '${kind}', 'application/pdf', 100, '${u}/vault-${++n}-padding.enc'${extra ? ", " + extra.split("|")[1] : ""})`;

describe("vault documents in source_files", () => {
  it("a document needs a title and a known category; scan files must not carry them", async () => {
    await actAsOwner(db);
    await db.exec(
      file(
        A,
        "doc",
        "title, category, doc_date|'Doctor note', 'doctor_note', '2026-09-01'",
      ),
    );
    await db.exec(file(A, "lab")); // an ordinary scan file still works
    expect(await isRejected(db, file(A, "doc"))).toBe(true); // no title/category
    expect(
      await isRejected(db, file(A, "doc", "title, category|'x', 'whatever'")),
    ).toBe(true);
    expect(
      await isRejected(db, file(A, "doc", "title, category|'', 'other'")),
    ).toBe(true);
    expect(
      await isRejected(db, file(A, "lab", "title, category|'x', 'other'")),
    ).toBe(true);
    expect(await isRejected(db, file(A, "lab", "doc_date|'2026-01-01'"))).toBe(
      true,
    );
  });

  it("people read their own files only and cannot write", async () => {
    await actAsOwner(db);
    await db.exec(file(B, "doc", "title, category|'Mine', 'other'"));
    await actAs(db, A);
    const r = await db.query<{ user_id: string }>(
      `select distinct user_id from public.source_files`,
    );
    expect(r.rows).toEqual([{ user_id: A }]);
    expect(
      await isRejected(db, file(A, "doc", "title, category|'x', 'other'")),
    ).toBe(true);
    expect(
      await isRejected(db, `update public.source_files set title = 'edited'`),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.source_files`)).toBe(true);
  });
});
