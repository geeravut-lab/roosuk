import { strToU8, zipSync } from "fflate";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import {
  db,
  endTrial,
  liveEnabled,
  makeUser,
  removeUsers,
  seriousViolations,
  signInAndConsent,
} from "./util";

/**
 * Live marketplace: the admin's toolkit (partners, a product with several photos,
 * claims screen, reordering, a ZIP import of CSV + photos), the shopper's flow
 * (picked-for-you by plan, gallery, cart, totals, credit up to the admin's cap,
 * PromptPay order, report payment), the admin's order steps (confirm, partner CSV,
 * ship with tracking, deliver), and cancelling (stock and credit come back).
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const tag = `E2E${Date.now().toString(36).toUpperCase()}`;
const created: string[] = [];
let original: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const { data } = await db()
    .from("platform_settings")
    .select(
      "promptpay_id, shop_shipping_thb, shop_free_shipping_from_thb, redeem_max_other_thb",
    )
    .single();
  original = data;
  await db()
    .from("platform_settings")
    .update({
      promptpay_id: (data?.promptpay_id as string | null) ?? "0812345678",
      shop_shipping_thb: 50,
      shop_free_shipping_from_thb: 500,
      redeem_max_other_thb: 20,
    })
    .eq("id", true);
});

test.afterAll(async () => {
  const d = db();
  // products, their photos (rows and files), partners and the orders the test users made
  const { data: prods } = await d
    .from("shop_products")
    .select("id")
    .like("sku", `${tag}%`);
  for (const p of prods ?? []) {
    const objs = (await d.storage.from("shop-images").list(p.id)).data ?? [];
    if (objs.length)
      await d.storage
        .from("shop-images")
        .remove(objs.map((o) => `${p.id}/${o.name}`));
  }
  if (created.length) {
    await d.from("shop_orders").delete().in("user_id", created);
    await d.from("privacy_audit_log").delete().in("user_id", created);
  }
  await d.from("shop_products").delete().like("sku", `${tag}%`);
  await d.from("shop_partners").delete().like("name", `${tag}%`);
  await removeUsers(created);
  if (original)
    await d
      .from("platform_settings")
      .update({
        promptpay_id: original.promptpay_id,
        shop_shipping_thb: original.shop_shipping_thb,
        shop_free_shipping_from_thb: original.shop_free_shipping_from_thb,
        redeem_max_other_thb: original.redeem_max_other_thb,
      })
      .eq("id", true);
});

async function productId(sku: string) {
  const { data } = await db()
    .from("shop_products")
    .select("id")
    .eq("sku", sku)
    .single();
  return data!.id as string;
}
const imageCount = async (id: string) =>
  (await db().from("shop_product_images").select("id").eq("product_id", id))
    .data?.length ?? 0;
const pngs = (n: number, prefix = "photo") =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix}${i + 1}.png`,
    mimeType: "image/png",
    buffer: PNG,
  }));

test("admin toolkit: partner, product with claims screen, several photos, reorder, delete, the eight-photo limit", async ({
  page,
}) => {
  const admin = await makeUser(
    created,
    `e2e-shopadm-${Date.now()}@example.test`,
  );
  await db().from("admins").insert({ user_id: admin.id });
  await signInAndConsent(page, admin);

  await page.goto("/admin");
  await page.getByRole("link", { name: "ร้านค้า (อาหารเสริม)" }).click();
  await expect(page).toHaveURL(/\/admin\/shop$/);
  expect(await seriousViolations(page)).toEqual([]);
  // the delivery fee form
  await expect(page.getByLabel("ค่าจัดส่ง (บาท)")).toHaveValue("50");

  // ── a partner ──
  await page.goto("/admin/shop/partners");
  const form = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "เพิ่มพาร์ตเนอร์" }) });
  await form.getByLabel("ชื่อพาร์ตเนอร์").fill(`${tag} Partner`);
  await form.getByLabel("ช่องทางติดต่อ (โทร/LINE/อีเมล)").fill("line:@partner");
  await form.getByRole("button", { name: "เพิ่มพาร์ตเนอร์" }).click();
  await expect(page.getByText("บันทึกแล้ว").first()).toBeVisible();

  // ── a product: a claim is refused, then a good one is saved and starts hidden-or-on as ticked ──
  await page.goto("/admin/shop/products/new");
  const fill = async (summary: string) => {
    await page.getByLabel("รหัสสินค้า (SKU)").fill(`${tag}-A`);
    await page
      .getByLabel("พาร์ตเนอร์ที่จัดส่ง")
      .selectOption({ label: `${tag} Partner` });
    await page.getByLabel("ชื่อสินค้า (ไทย)").fill("แมกนีเซียม ทดสอบ");
    await page.getByLabel("ชื่อสินค้า (อังกฤษ)").fill("Magnesium test");
    await page.getByLabel("ราคาขาย (บาท)").fill("200");
    await page.getByLabel(/สต็อก \(เว้นว่าง/).fill("5");
    await page.getByLabel("คำอธิบายสั้น (ไทย)").fill(summary);
    await page.getByLabel("คำเตือน").fill("ปรึกษาแพทย์หรือเภสัชกรก่อนใช้");
    await page.getByLabel("เลขทะเบียน อย.").fill("12-1-12345-1-0001");
    await page.getByRole("checkbox", { name: "การนอน" }).check();
    await page.getByRole("checkbox", { name: /วางขาย/ }).check();
  };
  await fill("ช่วยรักษาโรคเบาหวานให้หายขาด");
  await page.getByRole("button", { name: "บันทึกสินค้า" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "ข้อมูลสินค้าไม่ถูกต้อง" }),
  ).toContainText("อ้างสรรพคุณรักษา");
  expect(
    (await db().from("shop_products").select("id").like("sku", `${tag}%`)).data,
  ).toHaveLength(0);
  await page
    .getByLabel("คำอธิบายสั้น (ไทย)")
    .fill("เสริมแมกนีเซียมสำหรับผู้ที่ได้รับไม่พอจากอาหาร");
  await page.getByRole("button", { name: "บันทึกสินค้า" }).click();
  await expect(page).toHaveURL(
    /\/admin\/shop\/products\/[0-9a-f-]{36}\?created=1/,
  );
  await expect(page.getByText("สร้างสินค้าแล้ว")).toBeVisible();
  const id = await productId(`${tag}-A`);

  // ── several photos at once, in order ──
  await page.locator("#photos").setInputFiles(pngs(3));
  await page
    .getByRole("button", { name: "เลือกรูป (เลือกได้หลายรูปพร้อมกัน)" })
    .last()
    .click();
  await expect(page.getByText("อัปโหลดแล้ว 3 รูป")).toBeVisible();
  await expect(
    page.getByRole("list", { name: /รูปสินค้า/ }).getByRole("img"),
  ).toHaveCount(3);
  expect(await imageCount(id)).toBe(3);
  const order = async () =>
    (
      (
        await db()
          .from("shop_product_images")
          .select("id")
          .eq("product_id", id)
          .order("position")
      ).data ?? []
    ).map((r) => r.id);
  const [first, second, third] = await order();
  await page.getByRole("button", { name: "เลื่อนขึ้น 2" }).click();
  await expect.poll(order).toEqual([second, first, third]);
  await page.getByRole("button", { name: "ลบรูป 3" }).click();
  await expect.poll(() => imageCount(id)).toBe(2);

  // ── the limit is eight ──
  await page.locator("#photos").setInputFiles(pngs(7, "more"));
  await page
    .getByRole("button", { name: "เลือกรูป (เลือกได้หลายรูปพร้อมกัน)" })
    .last()
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "สูงสุด 8 รูป" }),
  ).toBeVisible();
  expect(await imageCount(id)).toBe(8);
  // a file that is not an image is refused by what it IS, whatever its name says
  await page
    .locator("#photos")
    .setInputFiles({
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image at all"),
    });
  await page
    .getByRole("button", { name: "เลือกรูป (เลือกได้หลายรูปพร้อมกัน)" })
    .last()
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /JPEG, PNG, WebP|สูงสุด 8/ }),
  ).toBeVisible();
  // keep two for the shopper checks
  await page.goto(`/admin/shop/products/${id}`);
  for (let n = 8; n > 2; n--)
    await page.getByRole("button", { name: `ลบรูป ${n}` }).click();
  await expect.poll(() => imageCount(id)).toBe(2);
});

test("admin import: a ZIP with a CSV and photos creates products, matches photos by file name or SKU, and lists the rows that failed", async ({
  page,
}) => {
  const admin = await makeUser(
    created,
    `e2e-shopimp-${Date.now()}@example.test`,
  );
  await db().from("admins").insert({ user_id: admin.id });
  await signInAndConsent(page, admin);
  const csv = [
    "sku,partner,name_th,price_thb,stock,tags,active,images,summary_th",
    `${tag}-B,${tag} Partner,โอเมก้า ทดสอบ,350,,energy,yes,front.png;back.png,น้ำมันปลาเสริมอาหาร`,
    `${tag}-C,${tag} Partner,วิตามินซี ทดสอบ,120,10,general,no,,เสริมวิตามินซี`,
    `${tag}-D,No Such Partner,ไม่มีพาร์ตเนอร์,100,,,no,,x`,
    `${tag}-E,${tag} Partner,โฆษณาเกินจริง,100,,,no,,ลดน้ำหนักเร็ว`,
  ].join("\n");
  const zip = zipSync({
    "products.csv": strToU8(csv),
    "images/front.png": PNG,
    "images/back.png": PNG,
    [`images/${tag}-C_1.png`]: PNG,
    "__MACOSX/._junk.png": PNG,
  });
  await page.goto("/admin/shop/import");
  await page
    .locator("#imp-files")
    .setInputFiles({
      name: "catalog.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await page.getByRole("button", { name: "นำเข้า", exact: true }).click();
  const result = page.getByRole("status").filter({ hasText: "บันทึกสินค้า" });
  await expect(result).toContainText(
    "บันทึกสินค้า 2 รายการ (ใหม่ 2) · อัปโหลดรูป 3 รูป · มีปัญหา 2 แถว",
  );
  await expect(result).toContainText(`(${tag}-D)`);
  await expect(result).toContainText(`(${tag}-E)`);
  expect(await imageCount(await productId(`${tag}-B`))).toBe(2);
  expect(await imageCount(await productId(`${tag}-C`))).toBe(1);
  expect(
    (await db().from("shop_products").select("id").eq("sku", `${tag}-D`)).data,
  ).toHaveLength(0);
  const { data: b } = await db()
    .from("shop_products")
    .select("active, focus_tags, stock, price_thb")
    .eq("sku", `${tag}-B`)
    .single();
  expect(b).toEqual({
    active: true,
    focus_tags: ["energy"],
    stock: null,
    price_thb: 350,
  });
  // importing again updates by SKU: no duplicates; photos are added unless "replace" is ticked
  await page
    .locator("#imp-files")
    .setInputFiles({
      name: "catalog.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await page.getByLabel("แทนที่รูปเดิมของสินค้าที่นำเข้า").check();
  await page.getByRole("button", { name: "นำเข้า", exact: true }).click();
  await expect(result).toContainText("บันทึกสินค้า 2 รายการ (ใหม่ 0)");
  expect(await imageCount(await productId(`${tag}-B`))).toBe(2);
  expect(
    (await db().from("shop_products").select("id").like("sku", `${tag}-B`))
      .data,
  ).toHaveLength(1);
});

async function bal(userId: string) {
  const { data } = await db()
    .from("reward_ledger")
    .select("amount_thb")
    .eq("user_id", userId);
  return (data ?? []).reduce((n, r) => n + r.amount_thb, 0);
}
const stockOf = async (sku: string) =>
  (await db().from("shop_products").select("stock").eq("sku", sku).single())
    .data!.stock as number | null;

async function addToCart(page: Page, id: string, qty: number) {
  await page.goto(`/shop/${id}`);
  await page.getByLabel("จำนวน").fill(String(qty));
  await page.getByRole("button", { name: "ใส่ตะกร้า" }).click();
  await expect(page.getByText("ใส่ตะกร้าแล้ว")).toBeVisible();
}
async function fillAddress(page: Page) {
  await page.getByLabel("ชื่อผู้รับ").fill("สมชาย ทดสอบ");
  await page.getByLabel("เบอร์โทร").fill("081-234-5678");
  await page
    .getByLabel("ที่อยู่", { exact: true })
    .fill("99 ถนนทดสอบ แขวงทดสอบ");
  await page.getByLabel("จังหวัด").fill("กรุงเทพฯ");
  await page.getByLabel("รหัสไปรษณีย์").fill("10110");
}

test("shopper: picked-for-you by plan, gallery, cart, credit up to the cap, order, report payment — then the admin's steps", async ({
  page,
  browser,
}) => {
  const d = db();
  const buyer = await makeUser(created);
  const free = await makeUser(created);
  const admin = await makeUser(
    created,
    `e2e-shopops-${Date.now()}@example.test`,
  );
  await d.from("admins").insert({ user_id: admin.id });
  await endTrial(free.id);
  const id = await productId(`${tag}-A`);
  await d
    .from("health_profiles")
    .insert({ user_id: buyer.id, goals: ["sleep"], conditions: [] });
  await d
    .from("reward_ledger")
    .insert({ user_id: buyer.id, kind: "admin_adjust", amount_thb: 15 });
  await signInAndConsent(page, buyer);

  // ── the shop, with "picked for you" (Premium trial) ──
  await page.goto("/shop");
  await expect(
    page.getByRole("heading", { level: 1, name: "ร้านค้าอาหารเสริม" }),
  ).toBeVisible();
  await expect(
    page.getByText(/ผลิตภัณฑ์เสริมอาหาร ไม่ใช่ยา/).first(),
  ).toBeVisible();
  await expect(
    page.getByText("เครดิตของคุณ ฿15 · ใช้ได้ครั้งละไม่เกิน ฿20"),
  ).toBeVisible();
  const picks = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "เลือกให้คุณ" }) });
  await expect(picks.getByText("แมกนีเซียม ทดสอบ")).toBeVisible();
  await expect(picks.getByText(/ตรงกับเป้าหมายของคุณ: การนอน/)).toBeVisible();
  await expect(picks.getByText(/ไม่ได้ดูผลตรวจหรือโรค/)).toBeVisible();
  await expect(picks.getByRole("img").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  // the topic filter
  await page.getByRole("link", { name: "พลังงาน", exact: true }).click();
  await expect(
    page
      .getByRole("list", { name: "ร้านค้าอาหารเสริม" })
      .getByText("โอเมก้า ทดสอบ"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "ร้านค้าอาหารเสริม" })
      .getByText("แมกนีเซียม ทดสอบ"),
  ).toHaveCount(0);

  // ── Free-lite sees the shop, not the picks ──
  const fctx = await browser.newContext();
  const fp = await fctx.newPage();
  await signInAndConsent(fp, free);
  await fp.goto("/shop");
  await expect(fp.getByText("“เลือกให้คุณ” สำหรับ Gold ขึ้นไป")).toBeVisible();
  await expect(fp.getByRole("heading", { name: "เลือกให้คุณ" })).toHaveCount(0);
  await fctx.close();

  // ── the product page: several photos, details, FDA number, cautions ──
  await page.goto(`/shop/${id}`);
  await expect(page.getByTestId("gallery").getByRole("img")).toHaveCount(2);
  await expect(
    page.getByText("เลขทะเบียน อย.: 12-1-12345-1-0001"),
  ).toBeVisible();
  await expect(
    page.getByText("ปรึกษาแพทย์หรือเภสัชกรก่อนใช้", { exact: true }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  // photos need a signed-in person
  const img = (
    await d
      .from("shop_product_images")
      .select("id")
      .eq("product_id", id)
      .limit(1)
      .single()
  ).data!.id;
  const ok = await page.request.get(`/api/shop/img/${img}`);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toContain("image/");
  const anon = await browser.newContext();
  expect(
    (
      await anon.request.get(
        new URL(`/api/shop/img/${img}`, page.url()).toString(),
      )
    ).status(),
  ).toBe(401);
  await anon.close();

  // ── cart: 2 × 200 = 400 + 50 delivery; credit 15 (all there is, under the ฿20 cap) → 435 ──
  await addToCart(page, id, 2);
  await expect(page.getByTestId("co-total")).toHaveText("฿450");
  await page.getByRole("checkbox", { name: /ใช้เครดิตเป็นส่วนลด/ }).check();
  await expect(page.getByTestId("co-total")).toHaveText("฿435");
  expect(await seriousViolations(page)).toEqual([]);
  // an incomplete address names what is wrong and creates nothing
  await page.getByRole("button", { name: "สั่งซื้อและไปชำระเงิน" }).click();
  await expect(page.getByLabel("ชื่อผู้รับ"))
    .toBeFocused()
    .catch(() => null); // native required validation
  await page.getByLabel("ชื่อผู้รับ").fill("สมชาย ทดสอบ");
  await page.getByLabel("เบอร์โทร").fill("123");
  await page.getByLabel("ที่อยู่", { exact: true }).fill("99 ถนนทดสอบ");
  await page.getByLabel("จังหวัด").fill("กรุงเทพฯ");
  await page.getByLabel("รหัสไปรษณีย์").fill("10110");
  await page.getByRole("button", { name: "สั่งซื้อและไปชำระเงิน" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "ที่อยู่จัดส่ง" }),
  ).toBeVisible();
  expect(
    (await d.from("shop_orders").select("id").eq("user_id", buyer.id)).data,
  ).toHaveLength(0);
  await fillAddress(page);
  await page.getByRole("button", { name: "สั่งซื้อและไปชำระเงิน" }).click();
  await expect(page).toHaveURL(/\/shop\/orders\/[0-9a-f-]{36}/);
  const orderId = page.url().split("/").pop()!.split("?")[0];

  // the database priced it, took the stock and the credit
  const { data: o } = await d
    .from("shop_orders")
    .select(
      "order_no, status, subtotal_thb, shipping_thb, credit_thb, total_thb, ship_phone",
    )
    .eq("id", orderId)
    .single();
  expect(o).toMatchObject({
    status: "pending_payment",
    subtotal_thb: 400,
    shipping_thb: 50,
    credit_thb: 15,
    total_thb: 435,
    ship_phone: "0812345678",
  });
  expect(await stockOf(`${tag}-A`)).toBe(3);
  expect(await bal(buyer.id)).toBe(0);
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`ออเดอร์ RS-${String(o!.order_no).padStart(6, "0")}`),
    }),
  ).toBeVisible();
  await expect(page.getByText("฿435").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /QR PromptPay/ })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // ── "I have paid" needs a reference ──
  await page.getByLabel(/เลขอ้างอิงการโอน/).fill("KBANK 1234 10:30");
  await page.getByRole("button", { name: "ฉันโอนแล้ว" }).click();
  await expect(page.getByText("แจ้งโอนแล้ว ร้านจะตรวจและยืนยัน")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ยกเลิกออเดอร์นี้" }),
  ).toBeVisible(); // still cancellable until confirmed

  // ── the admin: confirm, send to the partner, CSV, ship (tracking required), deliver ──
  const actx = await browser.newContext();
  const ap = await actx.newPage();
  await signInAndConsent(ap, admin);
  await ap.goto("/admin/shop/orders");
  await ap
    .getByRole("link", {
      name: new RegExp(`RS-${String(o!.order_no).padStart(6, "0")}`),
    })
    .click();
  await expect(ap.getByText("สมชาย ทดสอบ · 0812345678")).toBeVisible();
  await expect(ap.getByText(`${tag}-A`)).toBeVisible();
  await expect(ap.getByText("KBANK 1234 10:30").first()).toBeVisible();
  await ap.getByRole("button", { name: "ยืนยันว่าได้รับเงินแล้ว" }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "ชำระแล้ว กำลังเตรียมจัดส่ง" }),
  ).toBeVisible();
  await ap.getByRole("button", { name: "ส่งให้พาร์ตเนอร์แล้ว" }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "ส่งให้พาร์ตเนอร์แล้ว" }),
  ).toBeVisible();

  const partnerId = (
    await d
      .from("shop_partners")
      .select("id")
      .eq("name", `${tag} Partner`)
      .single()
  ).data!.id;
  const csvRes = await ap.request.get(
    `/admin/shop/orders/export?partner=${partnerId}`,
  );
  expect(csvRes.status()).toBe(200);
  expect(csvRes.headers()["content-type"]).toContain("text/csv");
  const csvText = await csvRes.text();
  expect(csvText).toContain(`${tag}-A`);
  expect(csvText).toContain("สมชาย ทดสอบ");
  expect(csvText).toContain("99 ถนนทดสอบ แขวงทดสอบ");
  // a stranger (not an admin) gets nothing
  expect(
    (
      await page.request.get(`/admin/shop/orders/export?partner=${partnerId}`)
    ).status(),
  ).toBe(404);

  await ap.getByRole("button", { name: "พาร์ตเนอร์จัดส่งแล้ว" }).click();
  await expect(
    ap.getByRole("alert").filter({ hasText: "ใส่เลขพัสดุก่อน" }),
  ).toBeVisible();
  await ap.getByLabel("ขนส่ง", { exact: true }).fill("Kerry");
  await ap.getByLabel("เลขพัสดุ", { exact: true }).fill(`TH${tag}9`);
  await ap.getByRole("button", { name: "พาร์ตเนอร์จัดส่งแล้ว" }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "จัดส่งแล้ว" }),
  ).toBeVisible();
  // the buyer sees the tracking number and was told
  await page.goto(`/shop/orders/${orderId}`);
  await expect(page.getByTestId("tracking")).toHaveText(`TH${tag}9`);
  await expect(
    page.getByRole("button", { name: "ยกเลิกออเดอร์นี้" }),
  ).toHaveCount(0);
  await page.goto("/notifications");
  await expect(page.getByText(/ออเดอร์ RS-\d+ จัดส่งแล้ว/)).toBeVisible();
  await expect(
    page.getByText(/ยืนยันการชำระเงินออเดอร์ RS-\d+ แล้ว/),
  ).toBeVisible();
  await ap.getByRole("button", { name: "ลูกค้าได้รับสินค้าแล้ว" }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "ได้รับสินค้าแล้ว" }),
  ).toBeVisible();
  // a shipped order can no longer be cancelled by anyone
  expect(
    (
      await d.rpc("cancel_shop_order", {
        p_order: orderId,
        p_user: admin.id,
        p_admin: true,
        p_reason: "x",
      })
    ).data,
  ).toBe("state");
  await actx.close();
});

test("cancelling puts the stock and the credit back; out of stock cannot be bought", async ({
  page,
}) => {
  const d = db();
  const buyer = await makeUser(created);
  await d
    .from("reward_ledger")
    .insert({ user_id: buyer.id, kind: "admin_adjust", amount_thb: 40 });
  await signInAndConsent(page, buyer);
  const id = await productId(`${tag}-A`);
  const s0 = await stockOf(`${tag}-A`);

  await addToCart(page, id, 1);
  await page.getByRole("checkbox", { name: /ใช้เครดิตเป็นส่วนลด/ }).check();
  await expect(page.getByTestId("co-total")).toHaveText("฿230"); // 200 + 50 − 20 (the admin's cap, not the 40 balance)
  await fillAddress(page);
  await page.getByRole("button", { name: "สั่งซื้อและไปชำระเงิน" }).click();
  await expect(page).toHaveURL(/\/shop\/orders\/[0-9a-f-]{36}/);
  expect(await stockOf(`${tag}-A`)).toBe(s0! - 1);
  expect(await bal(buyer.id)).toBe(20);
  await page.getByRole("button", { name: "ยกเลิกออเดอร์นี้" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "ยกเลิกแล้ว" }),
  ).toBeVisible();
  expect(await stockOf(`${tag}-A`)).toBe(s0);
  expect(await bal(buyer.id)).toBe(40); // credit refunded, once
  await page.goto("/shop/orders");
  await expect(page.getByText("ยกเลิกแล้ว").first()).toBeVisible();

  // out of stock: no buy button, and the database refuses anyway
  await d.from("shop_products").update({ stock: 0 }).eq("sku", `${tag}-A`);
  await page.goto(`/shop/${id}`);
  await expect(page.getByText("หมดชั่วคราว").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "ใส่ตะกร้า" })).toHaveCount(0);
  const r = await d.rpc("create_shop_order", {
    p_user: buyer.id,
    p_lines: [{ product_id: id, qty: 1 }],
    p_ship: {
      name: "x",
      phone: "0812345678",
      address: "x",
      province: "x",
      postal: "10110",
      note: "",
    },
    p_use_credit: false,
    p_credit_max: 0,
    p_shipping: 50,
    p_free_from: 500,
    p_promptpay: "0812345678",
  });
  expect((r.data as { reason: string }).reason).toBe("stock");
  await d.from("shop_products").update({ stock: s0 }).eq("sku", `${tag}-A`);
});
