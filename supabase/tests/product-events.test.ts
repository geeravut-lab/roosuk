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

const ev = (user: string | null, event: string, dayOffset = 0) =>
  db.exec(
    `insert into public.product_events (user_id, event, day) values (${user ? `'${user}'` : "null"}, '${event}', public.bangkok_today() - ${dayOffset})`,
  );

describe("product_events", () => {
  it("is closed to users and anonymous callers", async () => {
    for (const [id, role] of [
      [A, "authenticated"],
      [null, "anon"],
    ] as const) {
      await actAs(db, id, role);
      expect(await isRejected(db, `select * from public.product_events`)).toBe(
        true,
      );
      expect(
        await isRejected(
          db,
          `insert into public.product_events (user_id, event) values (null, 'quiz_completed')`,
        ),
      ).toBe(true);
    }
  });
  it("checks the shape of an event name and tag, allows the anonymous quiz", async () => {
    await actAsOwner(db);
    for (const bad of ["Quiz", "x", "has space", "a".repeat(41), "1abc"])
      expect(
        await isRejected(
          db,
          `insert into public.product_events (event) values ('${bad}')`,
        ),
        bad,
      ).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.product_events (event, detail) values ('share_made', '${"x".repeat(41)}')`,
      ),
    ).toBe(true);
    await ev(null, "quiz_completed");
  });
  it("keeps one 'active' per user per day and one 'signup' per user", async () => {
    await ev(A, "active");
    expect(
      await isRejected(
        db,
        `insert into public.product_events (user_id, event) values ('${A}', 'active')`,
      ),
    ).toBe(true);
    await ev(A, "active", 1); // another day is fine
    await ev(A, "signup", 8);
    expect(
      await isRejected(
        db,
        `insert into public.product_events (user_id, event) values ('${A}', 'signup')`,
      ),
    ).toBe(true);
    await ev(A, "food_scanned");
    await ev(A, "food_scanned"); // repeatable events repeat
  });
  it("is erased with the account", async () => {
    await ev(B, "active");
    await db.exec(`delete from auth.users where id = '${B}'`);
    expect(
      (
        await db.query(
          `select 1 from public.product_events where user_id = '${B}'`,
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe("admin_analytics", () => {
  it("only the service role can call it", async () => {
    await actAs(db, A);
    expect(await isRejected(db, `select public.admin_analytics(30)`)).toBe(
      true,
    );
    await actAs(db, null, "service_role");
    const r = await db.query<{ a: { dau: number } }>(
      `select public.admin_analytics(30) as a`,
    );
    expect(r.rows[0].a.dau).toBe(1);
  });
  it("counts active users, the funnel, events and retention", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into auth.users (id, email) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@x.test')`,
    );
    const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await ev(C, "signup", 3);
    await ev(C, "active", 2); // day after signup → D1 back
    await ev(C, "paywall_viewed");
    await ev(A, "paywall_viewed");
    await ev(A, "order_created");
    await ev(A, "subscribed");
    await ev(A, "lab_scanned");
    await actAs(db, null, "service_role");
    const a = (
      await db.query<{ a: any }>(`select public.admin_analytics(30) as a`)
    ).rows[0].a;
    expect(a.funnel).toEqual({
      quiz: 1,
      signup: 2,
      scan: 1,
      paywall: 2,
      order: 1,
      subscribed: 1,
    });
    // A: signup 8 days ago, active today and yesterday (= 7 days after signup); C: signup 3 days ago, active the next day
    expect(a.retention.d1_cohort).toBe(2);
    expect(a.retention.d1_back).toBe(1);
    expect(a.retention.d7_cohort).toBe(1); // only A signed up ≥ 7 days ago
    expect(a.retention.d7_back).toBe(1); // A was active exactly 7 days after signing up (yesterday)
    expect(a.dau).toBe(1); // A is active today
    expect(a.wau).toBe(2); // A and C within 7 days
    expect(a.daily).toHaveLength(30);
    expect(a.daily.at(-1).active).toBe(1);
    const foodEvent = a.events.find((e: any) => e.event === "food_scanned");
    expect(foodEvent).toEqual({ event: "food_scanned", total: 2, users: 1 });
    expect(a.events.some((e: any) => e.event === "active")).toBe(false);
    // the window is clamped
    const w = (
      await db.query<{ a: any }>(`select public.admin_analytics(100000) as a`)
    ).rows[0].a;
    expect(w.days).toBe(365);
  });
});
