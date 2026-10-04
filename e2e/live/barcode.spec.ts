import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live barcode lookup against a LOCAL stub of Open Food Facts (the sandbox cannot
 * reach the real one): bad numbers are refused before any lookup, a found
 * product becomes a draft meal with the label's numbers (no AI allowance used),
 * and not-found / no-nutrition / outage each say so. Run with
 * OPEN_FOOD_FACTS_URL=http://127.0.0.1:4010 so the app under test uses the stub.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

// Every step crosses the network to Supabase (and the sandbox proxy): wait longer than the 5 s default.
const expect = baseExpect.configure({ timeout: 20_000 });

const STUB = process.env.OPEN_FOOD_FACTS_URL ?? "";
test.skip(
  !enabled || !STUB.startsWith("http://127.0.0.1:"),
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
// Real network round trips (and two signed-in browsers): give the test and its cleanup room.
test.setTimeout(240_000);

const db = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdIds: string[] = [];

async function makeUser() {
  const email = lineSyntheticEmail(
    `e2e${Date.now()}${randomBytes(3).toString("hex")}`,
  );
  const password = `Pw-${randomBytes(9).toString("hex")}`;
  const { data, error } = await db().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error("createUser returned no user");
  createdIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signInAndConsent(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/consent/);
  for (const box of await page
    .locator('input[type="checkbox"][required]')
    .all())
    await box.check();
  await page.getByRole("button", { name: "ยืนยันและเริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

async function seriousViolations(page: Page): Promise<string[]> {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return axe.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

let server: Server | undefined;

test.afterAll(async () => {
  server?.close();
  for (const id of createdIds) await db().auth.admin.deleteUser(id);
});

const NOODLES = {
  status: 1,
  product: {
    product_name: "Instant noodles",
    product_name_th: "บะหมี่ทดสอบ",
    brands: "TestBrand",
    nutriments: {
      "energy-kcal_serving": 330,
      proteins_serving: 7,
      carbohydrates_serving: 45,
      fat_serving: 13.5,
    },
  },
};

test("barcode: invalid numbers refused, a found product becomes a draft meal, failures are explained", async ({
  page,
}) => {
  const hits: string[] = [];
  server = createServer((req, res) => {
    const code = /\/product\/(\d+)\.json/.exec(req.url ?? "")?.[1] ?? "";
    hits.push(code);
    res.setHeader("content-type", "application/json");
    if (code === "4006381333931") return void res.end(JSON.stringify(NOODLES));
    if (code === "96385074")
      return void res.end(
        JSON.stringify({ status: 0, status_verbose: "product not found" }),
      );
    if (code === "0036000291452")
      return void res.end(
        JSON.stringify({ status: 1, product: { product_name: "No data" } }),
      );
    res.statusCode = 503;
    res.end("{}");
  });
  await new Promise<void>((r) =>
    server!.listen(Number(new URL(STUB).port), "127.0.0.1", r),
  );

  const d = db();
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);
  await page.goto("/scan/food");
  const box = page.getByRole("region", { name: "สแกนบาร์โค้ดสินค้า" });
  await expect(box).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // refused before any lookup
  for (const bad of ["123", "4006381333932", "abcdefghijklm"]) {
    await box.getByLabel("เลขบาร์โค้ด").fill(bad);
    await box.getByRole("button", { name: "ค้นหาสินค้า" }).click();
    await expect(
      box.getByRole("alert").filter({ hasText: "เลขบาร์โค้ดไม่ถูกต้อง" }),
    ).toBeVisible();
  }
  expect(hits).toEqual([]);

  // not found / no nutrition / outage
  await box.getByLabel("เลขบาร์โค้ด").fill("96385074");
  await box.getByRole("button", { name: "ค้นหาสินค้า" }).click();
  await expect(
    box.getByRole("alert").filter({ hasText: "ไม่พบสินค้านี้" }),
  ).toBeVisible();
  await box.getByLabel("เลขบาร์โค้ด").fill("0360 0029 1452");
  await box.getByRole("button", { name: "ค้นหาสินค้า" }).click();
  await expect(
    box.getByRole("alert").filter({ hasText: "ไม่มีข้อมูลโภชนาการ" }),
  ).toBeVisible();
  await box.getByLabel("เลขบาร์โค้ด").fill("5449000000996");
  await box.getByRole("button", { name: "ค้นหาสินค้า" }).click();
  await expect(
    box.getByRole("alert").filter({ hasText: "ค้นหาบาร์โค้ดไม่ได้" }),
  ).toBeVisible();
  expect(
    ((await d.from("meal_logs").select("id").eq("user_id", user.id)).data ?? [])
      .length,
  ).toBe(0);

  // found: a draft with the label's numbers, shown as such, no AI allowance used
  await box.getByLabel("เลขบาร์โค้ด").fill("4006381 333931");
  await box.getByRole("button", { name: "ค้นหาสินค้า" }).click();
  await expect(page).toHaveURL(/\/scan\/food\/[0-9a-f-]{36}/);
  await expect(page.getByText("บะหมี่ทดสอบ (TestBrand)")).toBeVisible();
  await expect(page.getByText(/Open Food Facts/).first()).toBeVisible();
  await expect(page.getByText(/330/).first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  const meal = (
    await d
      .from("meal_logs")
      .select("status, kcal, protein_g, items, model")
      .eq("user_id", user.id)
      .single()
  ).data!;
  expect(meal).toMatchObject({
    status: "draft",
    kcal: 330,
    model: "barcode/openfoodfacts",
  });
  expect(
    (meal.items as { source: string; catalog_key: string }[])[0],
  ).toMatchObject({ source: "barcode", catalog_key: "ean:4006381333931" });
  expect(
    (
      (await d.from("ai_usage").select("used").eq("user_id", user.id)).data ??
      []
    ).length,
  ).toBe(0);

  // it saves like any other meal
  await page.getByRole("button", { name: "บันทึกมื้อนี้" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "บันทึกมื้ออาหารแล้ว" }),
  ).toBeVisible();
  expect(
    (await d.from("meal_logs").select("status").eq("user_id", user.id).single())
      .data?.status,
  ).toBe("confirmed");
  expect(hits.filter((h) => h === "4006381333931")).toHaveLength(1);

  // the camera opens (fake device) and closes again
  await page.goto("/scan/food");
  await page.getByRole("button", { name: "สแกนด้วยกล้อง" }).click();
  await expect(page.getByText("เล็งกล้องไปที่บาร์โค้ด")).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  await page.getByRole("button", { name: "ปิดกล้อง" }).click();
  await expect(page.locator("video")).toHaveCount(0);
});
