import { deflateSync } from "node:zlib";
import { expect as baseExpect, test } from "@playwright/test";
import {
  db,
  liveEnabled,
  makeUser,
  removeUsers,
  signInAndConsent,
} from "./util";

/**
 * Two admin switches that change what everyone sees: a feature turned off greys its menu entry
 * out (and its page is gone), and the app's name / logo / tab icon follow what the admin sets.
 */
const expect = baseExpect.configure({ timeout: 30_000 });

test.skip(
  !liveEnabled,
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const created: string[] = [];

/** A solid-colour PNG, built by hand so the spec needs no image library. */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: w }, () => rgb).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let originalFlags: unknown = {};
let originalBrand: unknown = {};

test.beforeAll(async () => {
  const row = (
    await db()
      .from("platform_settings")
      .select("feature_flags, brand")
      .eq("id", true)
      .single()
  ).data!;
  originalFlags = row.feature_flags;
  originalBrand = row.brand;
});

test.afterAll(async () => {
  await db()
    .from("platform_settings")
    .update({ feature_flags: originalFlags, brand: originalBrand })
    .eq("id", true);
  const storage = db().storage.from("brand-assets");
  const { data } = await storage.list();
  const keep = new Set(
    Object.values((originalBrand ?? {}) as Record<string, unknown>)
      .filter(
        (v): v is { mime: string; version: number } =>
          !!v && typeof v === "object",
      )
      .map((v) => String(v.version)),
  );
  const drop = (data ?? [])
    .map((f) => f.name)
    .filter((n) => ![...keep].some((v) => n.includes(v)));
  if (drop.length) await storage.remove(drop);
  await removeUsers(created);
});

test("a feature the admin switches off is greyed out in the menu and its page is gone", async ({
  page,
}) => {
  const admin = await makeUser(created);
  await db().from("admins").insert({ user_id: admin.id });
  await signInAndConsent(page, admin);

  // start from "everything on", through the admin screen (which also refreshes the server's cache)
  await db()
    .from("platform_settings")
    .update({ feature_flags: {} })
    .eq("id", true);
  await page.goto("/admin/flags");
  const row = page
    .locator("li")
    .filter({ hasText: "เป้าหมายและโปรแกรมรายวัน" });
  await expect(row.getByText("เปิดอยู่", { exact: true })).toBeVisible();

  const bar = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
  await page.goto("/today");
  await expect(bar.getByRole("link", { name: "เป้าหมาย" })).toBeVisible();

  await page.goto("/admin/flags");
  await row.getByRole("button", { name: "ปิด", exact: true }).click();
  await expect(row.getByText("ปิดอยู่", { exact: true })).toBeVisible();

  await page.goto("/today");
  await expect(bar.getByRole("link", { name: "เป้าหมาย" })).toHaveCount(0);
  await expect(
    bar.locator("[data-nav-off]", { hasText: "เป้าหมาย" }),
  ).toHaveAttribute("aria-disabled", "true");
  const gone = await page.goto("/goals");
  expect(gone?.status()).toBe(404);

  // back on: the entry is a link again
  await page.goto("/admin/flags");
  await row.getByRole("button", { name: "เปิด", exact: true }).click();
  await expect(row.getByText("เปิดอยู่", { exact: true })).toBeVisible();
  await page.goto("/today");
  await expect(bar.getByRole("link", { name: "เป้าหมาย" })).toBeVisible();
});

test("the admin renames the app and sets its logo and tab icon; bad pictures are refused", async ({
  page,
  request,
}) => {
  const admin = await makeUser(created);
  await db().from("admins").insert({ user_id: admin.id });
  await signInAndConsent(page, admin);

  await page.goto("/admin/branding");
  await expect(
    page.getByRole("heading", { level: 1, name: "ชื่อและโลโก้แอป" }),
  ).toBeVisible();

  // refused: a tab icon that is not square, and an empty name
  await page.getByLabel("ไอคอนแท็บเบราว์เซอร์ (favicon)").setInputFiles({
    name: "wide.png",
    mimeType: "image/png",
    buffer: png(400, 200, [10, 143, 163]),
  });
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "สี่เหลี่ยมจัตุรัส",
  );
  await page.getByLabel("ไอคอนแท็บเบราว์เซอร์ (favicon)").setInputFiles([]);
  await page.getByLabel("ชื่อแอป (ไทย)").fill("   ");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("1–40");

  // accepted
  await page.getByLabel("ชื่อแอป (ไทย)").fill("วีต้า");
  await page.getByLabel("ชื่อแอป (อังกฤษ)").fill("Vita");
  await page.getByLabel("โลโก้", { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: png(256, 256, [255, 122, 107]),
  });
  await page.getByLabel("ไอคอนแท็บเบราว์เซอร์ (favicon)").setInputFiles({
    name: "tab.png",
    mimeType: "image/png",
    buffer: png(512, 512, [45, 212, 167]),
  });
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByRole("status")).toContainText("บันทึกแล้ว");

  // the sign-in page (signed out) carries the new name, logo and tab icon
  const out = await page.context().browser()!.newContext();
  const anon = await out.newPage();
  await anon.goto("/auth");
  await expect(anon.locator("header")).toContainText("วีต้า");
  await expect(anon.locator("header img")).toHaveAttribute(
    "src",
    "/brand/logo",
  );
  await expect(anon).toHaveTitle(/วีต้า/);
  const iconHref = await anon
    .locator('link[rel="icon"]')
    .first()
    .getAttribute("href");
  expect(iconHref).toMatch(/^\/brand\/favicon\?v=\d+/);
  await out.close();

  // each route keeps its own settings copy for up to 30 s, so give the picture routes time to catch up
  await expect
    .poll(
      async () => {
        const r = await request.get("/brand/logo");
        return (await r.body()).equals(png(256, 256, [255, 122, 107]));
      },
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe(true);
  const logo = await request.get("/brand/logo");
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toBe("image/png");
  const tab = await request.get(iconHref!);
  expect(tab.headers()["content-type"]).toBe("image/png");
  const again = await request.get("/brand/favicon", {
    headers: { "If-None-Match": tab.headers()["etag"] },
  });
  expect(again.status()).toBe(304);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("วีต้า");
  expect(manifest.name).toContain("Vita");

  // English shows the English name
  await page.goto("/today");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "English" })
    .click();
  await expect(
    page.getByRole("banner").getByText("Vita", { exact: true }),
  ).toBeVisible();

  // back to Thai, then to the built-in name and pictures
  await page.getByRole("banner").getByRole("button", { name: "ไทย" }).click();
  await expect(page.getByRole("banner").getByText("วีต้า")).toBeVisible();
  await page.goto("/admin/branding");
  await page.getByLabel("ชื่อแอป (ไทย)").fill("รู้สุข");
  await page.getByLabel("ชื่อแอป (อังกฤษ)").fill("RooSuk");
  await page.getByRole("button", { name: "บันทึก" }).click();
  await expect(page.getByRole("status")).toContainText("บันทึกแล้ว");
  for (const kind of ["logo", "favicon"]) {
    const remove = page.locator(`form:has(input[value="${kind}"]) button`);
    await remove.click();
    await expect(remove).toHaveCount(0);
  }
  const reset = await db()
    .from("platform_settings")
    .select("brand")
    .eq("id", true)
    .single();
  expect(reset.data!.brand).toEqual({});
  await expect
    .poll(
      async () =>
        (await request.get("/brand/logo", { maxRedirects: 0 })).status(),
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe(307);
});
