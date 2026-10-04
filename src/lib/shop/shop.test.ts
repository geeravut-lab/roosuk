import { describe, expect, it } from "vitest";
import {
  PRODUCT_CSV_TEMPLATE,
  imageSkuOf,
  parseProduct,
  parseProductCsv,
  violatesProductClaims,
} from "./product";
import { recommend, wantedTags } from "./recommend";
import {
  ADMIN_STEPS,
  canAdminCancel,
  canReportPayment,
  canUserCancel,
  clampQty,
  orderLabel,
  orderTotals,
  parseShipTo,
  shippingFor,
  shopCredit,
  stepsFor,
} from "./shop";

const get = (o: Record<string, unknown>) => (k: string) => o[k];
const good = {
  sku: "MAG-1",
  name_th: "แมกนีเซียม",
  price_thb: "390",
  tags: "sleep;stress",
  active: "yes",
};

describe("parseProduct", () => {
  it("reads a minimal product and fills in the rest", () => {
    const r = parseProduct(get(good));
    expect(r).toMatchObject({
      ok: true,
      value: {
        sku: "MAG-1",
        price_thb: 390,
        stock: null,
        compare_at_thb: null,
        active: true,
        sort: 100,
        focus_tags: ["sleep", "stress"],
      },
    });
  });
  it("names every field that is wrong", () => {
    const r = parseProduct(
      get({
        sku: "bad sku",
        name_th: " ",
        price_thb: "0",
        compare_at_thb: "x",
        stock: "-1",
        tags: "magic",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.fields.sort()).toEqual(
        [
          "compare_at_thb",
          "focus_tags",
          "name_th",
          "price_thb",
          "sku",
          "stock",
        ].sort(),
      );
  });
  it("a list price must be above the selling price", () => {
    expect(parseProduct(get({ ...good, compare_at_thb: "390" })).ok).toBe(
      false,
    );
    expect(parseProduct(get({ ...good, compare_at_thb: "490" })).ok).toBe(true);
  });
  it("keeps disease and body-shape claims off the page", () => {
    for (const text of [
      "ช่วยรักษาโรคเบาหวาน",
      "หายขาดภายใน 7 วัน",
      "ลดน้ำหนักเร็ว",
      "Cures diabetes",
      "supports fat burn",
      "treats cancer symptoms",
    ])
      expect(violatesProductClaims(text), text).toBe(true);
    for (const text of [
      "เสริมแมกนีเซียมสำหรับผู้ที่ได้รับไม่พอจากอาหาร",
      "Magnesium supplement for people who do not get enough from food",
    ])
      expect(violatesProductClaims(text), text).toBe(false);
    const r = parseProduct(get({ ...good, summary_th: "รักษาโรคมะเร็ง" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields).toContain("claims");
  });
});

describe("parseProductCsv", () => {
  it("the shipped template is itself a valid file", () => {
    const r = parseProductCsv(PRODUCT_CSV_TEMPLATE);
    expect(r).toMatchObject({ ok: true, issues: [] });
    if (r.ok) {
      expect(r.products).toHaveLength(1);
      expect(r.products[0]).toMatchObject({
        partner: "Partner One",
        images: ["MAG-001_1.jpg", "MAG-001_2.jpg"],
        value: {
          sku: "MAG-001",
          price_thb: 390,
          focus_tags: ["sleep", "stress"],
        },
      });
    }
  });
  it("keeps the good rows and lists the bad ones by line", () => {
    const csv = [
      "sku,partner,name_th,price_thb",
      "A1,P,สินค้าหนึ่ง,100",
      "A2,P,,100",
      "A3,,สินค้าสาม,100",
      "A1,P,ซ้ำ,100",
      'A5,P,"ชื่อ, มีจุลภาค",250',
    ].join("\r\n");
    const r = parseProductCsv(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.products.map((p) => p.value.sku)).toEqual(["A1", "A5"]);
    expect(r.products[1].value.name_th).toBe("ชื่อ, มีจุลภาค");
    expect(r.issues).toEqual([
      { line: 3, sku: "A2", fields: ["name_th"] },
      { line: 4, sku: "A3", fields: ["partner"] },
      { line: 5, sku: "A1", fields: ["sku"] },
    ]);
  });
  it("refuses a file without the key columns, an empty one, and a huge one", () => {
    expect(parseProductCsv("a,b\n1,2")).toEqual({
      ok: false,
      reason: "header",
    });
    expect(parseProductCsv("")).toEqual({ ok: false, reason: "empty" });
    const many =
      "sku,partner,name_th,price_thb\n" +
      Array.from({ length: 301 }, (_, i) => `S${i},P,x,10`).join("\n");
    expect(parseProductCsv(many)).toEqual({ ok: false, reason: "too_many" });
  });
});

describe("imageSkuOf", () => {
  it("finds the SKU in a file name", () => {
    expect(imageSkuOf("images/MAG-001_1.jpg")).toBe("MAG-001");
    expect(imageSkuOf("MAG-001-2.PNG")).toBe("MAG-001");
    expect(imageSkuOf("OMEGA.webp")).toBe("OMEGA");
    expect(imageSkuOf("notes.txt")).toBeNull();
  });
});

describe("shipping and credit", () => {
  const s = { shippingThb: 50, freeShippingFromThb: 500 };
  it("ships free at the admin's line, never when the line is 0", () => {
    expect(shippingFor(499, s)).toBe(50);
    expect(shippingFor(500, s)).toBe(0);
    expect(shippingFor(9999, { ...s, freeShippingFromThb: 0 })).toBe(50);
  });
  it("credit is the lowest of balance, cap and what is owed", () => {
    expect(
      shopCredit({ subtotal: 200, shipping: 50, balance: 15, maxPerUse: 20 }),
    ).toBe(15);
    expect(
      shopCredit({ subtotal: 200, shipping: 50, balance: 100, maxPerUse: 20 }),
    ).toBe(20);
    expect(
      shopCredit({ subtotal: 5, shipping: 0, balance: 100, maxPerUse: 20 }),
    ).toBe(5);
    expect(
      shopCredit({ subtotal: 200, shipping: 50, balance: 0, maxPerUse: 20 }),
    ).toBe(0);
    expect(
      shopCredit({ subtotal: 200, shipping: 50, balance: 100, maxPerUse: 0 }),
    ).toBe(0);
    expect(
      shopCredit({ subtotal: 200, shipping: 50, balance: 12.9, maxPerUse: 20 }),
    ).toBe(12);
  });
  it("totals add up the way the database will", () => {
    expect(
      orderTotals([{ price: 200, qty: 2 }], s, {
        use: true,
        balance: 15,
        maxPerUse: 20,
      }),
    ).toEqual({ subtotal: 400, shipping: 50, credit: 15, total: 435 });
    expect(
      orderTotals([{ price: 350, qty: 2 }], s, {
        use: false,
        balance: 99,
        maxPerUse: 20,
      }),
    ).toEqual({ subtotal: 700, shipping: 0, credit: 0, total: 700 });
    expect(
      orderTotals([], s, { use: true, balance: 99, maxPerUse: 20 }),
    ).toEqual({ subtotal: 0, shipping: 0, credit: 0, total: 0 });
  });
  it("quantities are whole numbers from 1 to 10", () => {
    expect(clampQty("3")).toBe(3);
    for (const bad of [0, 11, 1.5, "x", null, -2])
      expect(clampQty(bad)).toBeNull();
  });
});

describe("parseShipTo", () => {
  const ok = {
    name: "สมชาย ใจดี",
    phone: "081-234-5678",
    address: "1 ถนนสุขุมวิท",
    province: "กรุงเทพฯ",
    postal: "10110",
    note: "โทรก่อนส่ง",
  };
  it("accepts a Thai address and normalises the phone", () => {
    expect(parseShipTo(get(ok))).toEqual({
      ok: true,
      value: { ...ok, phone: "0812345678" },
    });
    expect(parseShipTo(get({ ...ok, phone: "+66 81 234 5678" }))).toMatchObject(
      { ok: true, value: { phone: "0812345678" } },
    );
  });
  it("names each bad field", () => {
    const r = parseShipTo(
      get({
        name: "",
        phone: "123",
        address: "",
        province: "",
        postal: "1011",
      }),
    );
    expect(r).toEqual({
      ok: false,
      fields: ["name", "phone", "address", "province", "postal"],
    });
  });
});

describe("order status", () => {
  it("people can report payment and cancel only early", () => {
    expect(canReportPayment("pending_payment")).toBe(true);
    expect(canReportPayment("payment_reported")).toBe(false);
    expect(canUserCancel("payment_reported")).toBe(true);
    expect(canUserCancel("paid")).toBe(false);
    expect(canAdminCancel("processing")).toBe(true);
    expect(canAdminCancel("shipped")).toBe(false);
  });
  it("an admin has exactly the steps that make sense from each status", () => {
    expect(stepsFor("payment_reported")).toEqual([
      "confirm_paid",
      "reject_payment",
    ]);
    expect(stepsFor("paid")).toEqual(["send_to_partner", "ship"]);
    expect(stepsFor("processing")).toEqual(["ship"]);
    expect(stepsFor("shipped")).toEqual(["deliver"]);
    expect(stepsFor("delivered")).toEqual([]);
    expect(stepsFor("cancelled")).toEqual([]);
    expect(ADMIN_STEPS.ship.to).toBe("shipped");
  });
  it("order numbers read RS-000123", () => {
    expect(orderLabel(123)).toBe("RS-000123");
    expect(orderLabel("7")).toBe("RS-000007");
  });
});

describe("recommendations", () => {
  const products = [
    { id: "a", focus_tags: ["sleep", "stress"], sort: 2 },
    { id: "b", focus_tags: ["sleep"], sort: 1 },
    { id: "c", focus_tags: ["move"], sort: 1 },
    { id: "d", focus_tags: ["general"], sort: 1 },
  ];
  it("wants come from goals and from the area needing most attention, and say why", () => {
    const w = wantedTags(["sleep", "understand_labs"], "nutrition");
    expect(w.tags.sort()).toEqual(["nutrition", "sleep"]);
    expect(w.because).toEqual({ sleep: "goal", nutrition: "checkin" });
    expect(wantedTags([], null).tags).toEqual([]);
    expect(wantedTags([], "activity").because).toEqual({ move: "checkin" });
  });
  it("ranks by how many wanted tags match, and offers nothing when nothing matches", () => {
    const r = recommend(products, wantedTags(["sleep", "stress"], null));
    expect(r.map((p) => p.product.id)).toEqual(["a", "b"]);
    expect(r[0].matched).toEqual(["sleep", "stress"]);
    expect(recommend(products, wantedTags([], null))).toEqual([]);
    expect(recommend(products, wantedTags(["energy"], null))).toEqual([]);
    expect(
      recommend(products, wantedTags(["sleep", "stress", "move"], null), 1),
    ).toHaveLength(1);
  });
});
