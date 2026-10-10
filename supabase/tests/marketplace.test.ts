import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actAs, actAsOwner, createTestDb, isRejected } from "./helpers";

let db: PGlite;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SHIP = JSON.stringify({
  name: "สมชาย ใจดี",
  phone: "0812345678",
  address: "1 ถนนสุขุมวิท",
  province: "กรุงเทพฯ",
  postal: "10110",
  note: "",
});
let partner = "";
let p1 = "";
let p2 = "";
let off = "";

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(
    `insert into auth.users (id, email) values ('${A}', 'a@x.test'), ('${B}', 'b@x.test')`,
  );
  partner = (
    await db.query<{ id: string }>(
      `insert into public.shop_partners (name) values ('Partner One') returning id`,
    )
  ).rows[0].id;
  const mk = async (sku: string, price: number, stock: string, active = true) =>
    (
      await db.query<{ id: string }>(
        `insert into public.shop_products (sku, partner_id, name_th, price_thb, stock, active) values ('${sku}', '${partner}', 'สินค้า ${sku}', ${price}, ${stock}, ${active}) returning id`,
      )
    ).rows[0].id;
  p1 = await mk("MAG-1", 200, "5");
  p2 = await mk("OMEGA-1", 350, "null");
  off = await mk("OFF-1", 100, "5", false);
});
afterAll(() => db.close());

const order = async (
  user: string,
  lines: { id: string; qty: number }[],
  o: {
    credit?: boolean;
    creditMax?: number;
    shipping?: number;
    free?: number;
  } = {},
) => {
  await actAsOwner(db);
  const json = JSON.stringify(
    lines.map((l) => ({ product_id: l.id, qty: l.qty })),
  );
  return (
    await db.query<{ r: Record<string, unknown> }>(
      `select public.create_shop_order('${user}', '${json}'::jsonb, '${SHIP}'::jsonb, ${o.credit ?? false}, ${o.creditMax ?? 0}, ${o.shipping ?? 50}, ${o.free ?? 500}, '0812345678') as r`,
    )
  ).rows[0].r;
};
const stock = async (id: string) =>
  (
    await db.query<{ stock: number | null }>(
      `select stock from public.shop_products where id = '${id}'`,
    )
  ).rows[0].stock;
const give = (u: string, n: number) =>
  db.exec(
    `insert into public.reward_ledger (user_id, kind, amount_thb) values ('${u}', 'admin_adjust', ${n})`,
  );
const balance = async (u: string) =>
  Number(
    (
      await db.query<{ s: string }>(
        `select coalesce(sum(amount_thb),0) as s from public.reward_ledger where user_id = '${u}'`,
      )
    ).rows[0].s,
  );

describe("catalog is the admin's", () => {
  it("people cannot read or write partners, products or images", async () => {
    await actAs(db, A);
    for (const t of ["shop_partners", "shop_products", "shop_product_images"])
      expect(await isRejected(db, `select * from public.${t}`)).toBe(true);
    expect(
      await isRejected(db, `update public.shop_products set price_thb = 1`),
    ).toBe(true);
    await actAs(db, null, "anon");
    expect(await isRejected(db, `select * from public.shop_products`)).toBe(
      true,
    );
  });
  it("a sale price must be below the list price, a SKU is one token, tags are few", async () => {
    await actAsOwner(db);
    for (const sql of [
      `update public.shop_products set compare_at_thb = 100 where id = '${p1}'`,
      `insert into public.shop_products (sku, partner_id, name_th, price_thb) values ('bad sku', '${partner}', 'x', 10)`,
      `insert into public.shop_products (sku, partner_id, name_th, price_thb) values ('Z1', '${partner}', 'x', 0)`,
      `insert into public.shop_products (sku, partner_id, name_th, price_thb, focus_tags) values ('Z2', '${partner}', 'x', 10, array['a','b','c','d','e','f','g'])`,
    ])
      expect(await isRejected(db, sql)).toBe(true);
  });
});

describe("create_shop_order", () => {
  it("prices from the database, adds shipping below the free line, and takes stock", async () => {
    const r = await order(A, [{ id: p1, qty: 1 }]);
    expect(r).toMatchObject({
      ok: true,
      total: 250,
      status: "pending_payment",
      credit: 0,
    }); // 200 + 50 shipping
    expect(await stock(p1)).toBe(4);
    const items = await db.query(
      `select sku, name, unit_price_thb, qty from public.shop_order_items`,
    );
    expect(items.rows).toEqual([
      { sku: "MAG-1", name: "สินค้า MAG-1", unit_price_thb: 200, qty: 1 },
    ]);
  });

  it("ships free from the admin's line, and an untracked product has no stock limit", async () => {
    const r = await order(A, [
      { id: p1, qty: 1 },
      { id: p2, qty: 2 },
    ]);
    expect(r).toMatchObject({ ok: true, total: 900 }); // 200 + 700, free shipping
    expect(await stock(p1)).toBe(3);
    expect(await stock(p2)).toBeNull();
  });

  it("refuses an inactive product, too much stock, an empty or oversized cart — and changes nothing", async () => {
    const before = await stock(p1);
    expect(await order(A, [{ id: off, qty: 1 }])).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    expect(await order(A, [{ id: p1, qty: 4 }])).toMatchObject({
      ok: false,
      reason: "stock",
    });
    expect(await order(A, [{ id: p1, qty: 11 }])).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    expect(await order(A, [])).toMatchObject({ ok: false, reason: "empty" });
    expect(await stock(p1)).toBe(before);
  });

  it("an inactive partner takes its products off sale", async () => {
    await actAsOwner(db);
    await db.exec(
      `update public.shop_partners set active = false where id = '${partner}'`,
    );
    expect(await order(A, [{ id: p2, qty: 1 }])).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
    await db.exec(
      `update public.shop_partners set active = true where id = '${partner}'`,
    );
  });

  it("spends credit up to the admin's cap and the balance, once, and writes it in the ledger", async () => {
    await actAsOwner(db);
    await give(B, 15);
    const r = await order(B, [{ id: p2, qty: 1 }], {
      credit: true,
      creditMax: 20,
    });
    // 350 + 50 shipping - 15 (all there is; below the 20 cap)
    expect(r).toMatchObject({ ok: true, credit: 15, total: 385 });
    expect(await balance(B)).toBe(0);
    await give(B, 100);
    const r2 = await order(B, [{ id: p2, qty: 1 }], {
      credit: true,
      creditMax: 20,
    });
    expect(r2).toMatchObject({ credit: 20, total: 380 }); // the cap
    expect(await balance(B)).toBe(80);
    const ledger = await db.query(
      `select kind, amount_thb from public.reward_ledger where kind = 'redeem_other' order by id`,
    );
    expect(ledger.rows).toEqual([
      { kind: "redeem_other", amount_thb: -15 },
      { kind: "redeem_other", amount_thb: -20 },
    ]);
  });

  it("credit that covers everything makes a paid order", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.reward_ledger (user_id, kind, amount_thb) values ('${A}', 'admin_adjust', 1000)`,
    );
    const r = await order(A, [{ id: p1, qty: 1 }], {
      credit: true,
      creditMax: 5000,
      free: 0,
    });
    expect(r).toMatchObject({
      ok: true,
      total: 0,
      status: "paid",
      credit: 250,
    });
    const row = (
      await db.query<{ paid_at: string | null }>(
        `select paid_at from public.shop_orders where id = '${r.id}'`,
      )
    ).rows[0];
    expect(row.paid_at).not.toBeNull();
  });

  it("the total always equals subtotal + shipping - credit (the database says so)", async () => {
    await actAsOwner(db);
    expect(
      await isRejected(
        db,
        `update public.shop_orders set total_thb = 1 where status = 'pending_payment'`,
      ),
    ).toBe(true);
  });

  it("removes the bought lines from the cart", async () => {
    await actAsOwner(db);
    await db.exec(
      `insert into public.shop_cart_items (user_id, product_id, qty) values ('${B}', '${p1}', 1), ('${B}', '${p2}', 1)`,
    );
    await order(B, [{ id: p1, qty: 1 }]);
    const left = await db.query(
      `select product_id from public.shop_cart_items where user_id = '${B}'`,
    );
    expect(left.rows).toEqual([{ product_id: p2 }]);
  });
});

describe("a person's own orders", () => {
  it("are readable by them only, and only the server writes", async () => {
    await actAs(db, B);
    const mine = await db.query<{ user_id: string }>(
      `select user_id from public.shop_orders`,
    );
    expect(mine.rows.length).toBeGreaterThan(0);
    expect(mine.rows.every((r) => r.user_id === B)).toBe(true);
    expect(
      (await db.query(`select 1 from public.shop_order_items`)).rows.length,
    ).toBeGreaterThan(0);
    expect(
      await isRejected(db, `update public.shop_orders set status = 'paid'`),
    ).toBe(true);
    expect(await isRejected(db, `delete from public.shop_orders`)).toBe(true);
    expect(
      await isRejected(
        db,
        `insert into public.shop_cart_items (user_id, product_id, qty) values ('${B}', '${p1}', 1)`,
      ),
    ).toBe(true);
    await db.exec(`delete from public.shop_cart_items`); // clearing their own cart is allowed
    for (const fn of [
      `public.create_shop_order('${B}', '[]', '{}', false, 0, 0, 0, null)`,
      `public.cancel_shop_order(gen_random_uuid(), '${B}', true, 'x')`,
      `public.expire_shop_orders(1)`,
    ])
      expect(await isRejected(db, `select ${fn}`)).toBe(true);
  });
});

describe("cancel_shop_order", () => {
  it("puts the stock and the credit back, once", async () => {
    await actAsOwner(db);
    await give(B, 30);
    await db.exec(
      `update public.shop_products set stock = 10 where id = '${p1}'`,
    );
    const s0 = await stock(p1);
    const r = await order(B, [{ id: p1, qty: 2 }], {
      credit: true,
      creditMax: 20,
    });
    const b0 = await balance(B);
    expect(await stock(p1)).toBe(s0! - 2);
    const cancel = async (user: string | null, admin: boolean) =>
      (
        await db.query<{ r: string }>(
          `select public.cancel_shop_order('${r.id}', ${user ? `'${user}'` : "null"}, ${admin}, 'changed my mind') as r`,
        )
      ).rows[0].r;
    expect(await cancel(A, false)).toBe("forbidden"); // not theirs
    expect(await cancel(B, false)).toBe("ok");
    expect(await stock(p1)).toBe(s0);
    expect(await balance(B)).toBe(b0 + 20);
    expect(await cancel(B, false)).toBe("state"); // already cancelled: nothing more comes back
    expect(await balance(B)).toBe(b0 + 20);
  });

  it("a person cannot cancel a paid order; an admin can until it ships", async () => {
    const r = await order(B, [{ id: p2, qty: 1 }]);
    await actAsOwner(db);
    await db.exec(
      `update public.shop_orders set status = 'paid' where id = '${r.id}'`,
    );
    const run = async (admin: boolean) =>
      (
        await db.query<{ r: string }>(
          `select public.cancel_shop_order('${r.id}', '${B}', ${admin}, 'x') as r`,
        )
      ).rows[0].r;
    expect(await run(false)).toBe("state");
    await db.exec(
      `update public.shop_orders set status = 'shipped' where id = '${r.id}'`,
    );
    expect(await run(true)).toBe("state");
    await db.exec(
      `update public.shop_orders set status = 'processing' where id = '${r.id}'`,
    );
    expect(await run(true)).toBe("ok");
  });
});

describe("expire_shop_orders", () => {
  it("releases old unpaid orders only", async () => {
    const old = await order(A, [{ id: p2, qty: 1 }]);
    const fresh = await order(A, [{ id: p2, qty: 1 }]);
    await actAsOwner(db);
    await db.exec(
      `update public.shop_orders set created_at = now() - interval '5 days' where id = '${old.id}'`,
    );
    const n = (
      await db.query<{ n: number }>(`select public.expire_shop_orders(72) as n`)
    ).rows[0].n;
    expect(n).toBe(1);
    const st = async (id: unknown) =>
      (
        await db.query<{ status: string }>(
          `select status from public.shop_orders where id = '${id}'`,
        )
      ).rows[0].status;
    expect(await st(old.id)).toBe("cancelled");
    expect(await st(fresh.id)).toBe("pending_payment");
  });
});

describe("products that require a verified identity (e-KYC)", () => {
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  let kycProduct = "";
  beforeAll(async () => {
    await actAsOwner(db);
    await db.exec(`insert into auth.users (id, email) values ('${C}', 'c@x.test')`);
    kycProduct = (
      await db.query<{ id: string }>(
        `insert into public.shop_products (sku, partner_id, name_th, price_thb, stock, active, requires_kyc) values ('KYC-1', '${partner}', 'ต้องยืนยันตัวตน', 120, 5, true, true) returning id`,
      )
    ).rows[0].id;
  });

  it("is off for every existing product, and only the admin's column sets it", async () => {
    await actAsOwner(db);
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from public.shop_products where requires_kyc and sku <> 'KYC-1'`,
    );
    expect(r.rows[0].n).toBe(0);
    await actAs(db, A);
    expect(
      await isRejected(db, `update public.shop_products set requires_kyc = false`),
    ).toBe(true);
  });

  it("refuses to sell it to a person who is not verified — and changes nothing", async () => {
    await actAsOwner(db);
    const before = await stock(kycProduct);
    expect(await order(C, [{ id: kycProduct, qty: 1 }])).toMatchObject({
      ok: false,
      reason: "kyc",
    });
    // one flagged line spoils a mixed cart too
    expect(
      await order(C, [
        { id: p2, qty: 1 },
        { id: kycProduct, qty: 1 },
      ]),
    ).toMatchObject({ ok: false, reason: "kyc" });
    expect(await stock(kycProduct)).toBe(before);
    expect(await stock(p2)).toBeNull();
    const n = await db.query(`select 1 from public.shop_orders where user_id = '${C}'`);
    expect(n.rows).toHaveLength(0);
  });

  it("a verification that is still waiting for review, was rejected or was revoked does not count", async () => {
    await actAsOwner(db);
    for (const status of ["review", "rejected", "revoked"]) {
      await db.exec(
        `insert into public.ekyc_verifications (user_id, doc_type, status) values ('${C}', 'thai_id', '${status}')`,
      );
      expect(await order(C, [{ id: kycProduct, qty: 1 }])).toMatchObject({
        ok: false,
        reason: "kyc",
      });
    }
  });

  it("sells it once the person is verified (passed or approved), and a product without the flag never needed it", async () => {
    await actAsOwner(db);
    const v = (
      await db.query<{ id: string }>(
        `insert into public.ekyc_verifications (user_id, doc_type, status) values ('${C}', 'thai_id', 'passed') returning id`,
      )
    ).rows[0].id;
    const ok = await order(C, [{ id: kycProduct, qty: 2 }]);
    expect(ok).toMatchObject({ ok: true });
    expect(await stock(kycProduct)).toBe(3);
    // taken back => not sellable again
    await db.exec(`update public.ekyc_verifications set status = 'revoked' where id = '${v}'`);
    expect(await order(C, [{ id: kycProduct, qty: 1 }])).toMatchObject({
      ok: false,
      reason: "kyc",
    });
    // an ordinary product is sold to anyone
    expect(await order(C, [{ id: p2, qty: 1 }])).toMatchObject({ ok: true });
  });
});

describe("history is kept as it was", () => {
  it("an order keeps the name and price it was made with", async () => {
    const r = await order(A, [{ id: p1, qty: 1 }]);
    await actAsOwner(db);
    await db.exec(
      `update public.shop_products set price_thb = 999, name_th = 'ชื่อใหม่' where id = '${p1}'`,
    );
    const item = (
      await db.query(
        `select name, unit_price_thb from public.shop_order_items where order_id = '${r.id}'`,
      )
    ).rows[0];
    expect(item).toEqual({ name: "สินค้า MAG-1", unit_price_thb: 200 });
    await db.exec(
      `update public.shop_products set price_thb = 200 where id = '${p1}'`,
    );
  });

  it("deleting the buyer detaches their orders and scrubs where they live", async () => {
    await actAsOwner(db);
    const before = (
      await db.query(
        `select count(*)::int as n from public.shop_orders where user_id = '${A}'`,
      )
    ).rows[0] as { n: number };
    expect(before.n).toBeGreaterThan(0);
    await db.exec(`delete from auth.users where id = '${A}'`);
    const gone = await db.query<{
      user_id: string | null;
      ship_name: string;
      ship_phone: string;
      ship_address: string;
      payer_ref: string | null;
      total_thb: number;
    }>(
      `select user_id, ship_name, ship_phone, ship_address, payer_ref, total_thb from public.shop_orders where ship_name = '(erased)'`,
    );
    expect(gone.rows.length).toBe(before.n);
    for (const row of gone.rows) {
      expect(row).toMatchObject({
        user_id: null,
        ship_phone: "000000",
        ship_address: "(erased)",
        payer_ref: null,
      });
      expect(row.total_thb).toBeGreaterThanOrEqual(0); // the money record is intact
    }
    // another buyer's orders are untouched
    expect(
      (
        await db.query(
          `select 1 from public.shop_orders where user_id = '${B}' and ship_name <> '(erased)'`,
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  });
});
