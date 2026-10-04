import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const insert = (user: string, over: Record<string, string> = {}) => {
  const v = {
    height_cm: "170",
    bmi_low: "21.0",
    bmi_high: "23.5",
    bmi_band: "'healthy'",
    bmi_basis: "'estimated'",
    ...over,
  };
  return `insert into public.body_scans (user_id, ${Object.keys(v).join(", ")}) values ('${user}', ${Object.values(v).join(", ")})`;
};

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test')`,
  );
  await db.exec(insert(A));
});
afterAll(() => db.close());

describe("body_scans", () => {
  it("a user reads and deletes only their own scans, and cannot write or edit", async () => {
    await actAs(db, A);
    expect(
      (await db.query(`select id from public.body_scans`)).rows,
    ).toHaveLength(1);
    expect(await isRejected(db, insert(A))).toBe(true);
    expect(
      await isRejected(db, `update public.body_scans set weight_kg = 60`),
    ).toBe(true);
    await actAs(db, B);
    expect(
      (await db.query(`select id from public.body_scans`)).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`delete from public.body_scans returning id`)).rows,
    ).toHaveLength(0); // RLS hides it
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select id from public.body_scans`)).toBe(true);
  });
  it("checks every value the code could get wrong", async () => {
    await actAsOwner(db);
    for (const bad of [
      { height_cm: "90" },
      { height_cm: "250" },
      { weight_kg: "20" },
      { weight_kg: "300" },
      { est_weight_low: "10" },
      { bmi_low: "5" },
      { bmi_high: "80" },
      { bmi_low: "25", bmi_high: "20" }, // inverted range
      { bmi_band: "'obese'" },
      { bmi_basis: "'guessed'" },
      { confidence: "1.5" },
      { face_note: "'jaundice'" },
      { palm_note: "'anemia'" },
      { est_weight_low: "80", est_weight_high: "60" },
    ] as Record<string, string>[])
      expect(await isRejected(db, insert(A, bad)), JSON.stringify(bad)).toBe(
        true,
      );
    await db.exec(
      insert(A, {
        weight_kg: "62.5",
        bmi_basis: "'measured'",
        face_note: "'possible'",
        palm_note: "'none'",
      }),
    );
  });
  it("allows a body photo as a source file and clears the pointer when the file goes", async () => {
    await actAsOwner(db);
    const f = await db.query<{ id: string }>(
      `insert into public.source_files (user_id, kind, mime, bytes, object_path) values ('${A}', 'body', 'image/jpeg', 100, '${A}/body1.enc') returning id`,
    );
    await db.exec(insert(A, { source_file_id: `'${f.rows[0].id}'` }));
    await db.exec(
      `delete from public.source_files where id = '${f.rows[0].id}'`,
    );
    const r = await db.query(
      `select 1 from public.body_scans where source_file_id is not null`,
    );
    expect(r.rows).toHaveLength(0);
  });
  it("is erased with the account", async () => {
    await db.exec(insert(B));
    await db.exec(`delete from auth.users where id = '${B}'`);
    expect(
      (await db.query(`select 1 from public.body_scans where user_id = '${B}'`))
        .rows,
    ).toHaveLength(0);
  });
});
