import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { foodByKey } from "../../src/config/thai-foods";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live Food Scan against the REAL Supabase project (see auth-flow.spec.ts for
 * the rules). No AI call is made: draft meals are seeded with the service role,
 * which is what a successful scan would have written. The AI path itself is
 * covered by unit tests with mocked providers and one manual probe.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

const expect = baseExpect.configure({ timeout: 20_000 });

test.skip(
  !enabled,
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const db = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdIds: string[] = [];
let originalFlags: unknown = {};

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

async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

test.afterAll(async () => {
  const d = db();
  await d
    .from("platform_settings")
    .update({ feature_flags: originalFlags })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

const padThai = foodByKey("pad_thai")!;

test("food scan: input checks cost nothing; review → confirm → timeline → delete; RLS; feature switch", async ({
  page,
}) => {
  const d = db();
  originalFlags = (
    await d
      .from("platform_settings")
      .select("feature_flags")
      .eq("id", true)
      .single()
  ).data!.feature_flags;
  const flagsOn = { ...(originalFlags as Record<string, unknown>) };
  delete flagsOn.food_scan;
  await d
    .from("platform_settings")
    .update({ feature_flags: flagsOn })
    .eq("id", true);

  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  // The hub offers food scan; the page and its upload form work.
  await page.goto("/scan");
  await page.getByRole("link", { name: /สแกนอาหาร/ }).click();
  await expect(page).toHaveURL(/\/scan\/food$/);
  expect(await serious(page)).toEqual([]);

  // Two ways in: a camera button (opens the camera directly) and the gallery picker.
  await expect(page.getByText("ถ่ายรูปอาหาร", { exact: true })).toBeVisible();
  await expect(page.locator("#photo-camera")).toHaveAttribute(
    "capture",
    "environment",
  );

  // A file that is not an image is refused by the server — before any quota or AI is touched.
  await page.locator("#photo").setInputFiles({
    name: "evil.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("<?php echo 1; ?>"),
  });
  await page.getByRole("button", { name: "วิเคราะห์อาหาร" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "รองรับเฉพาะรูป JPEG, PNG หรือ WebP" }),
  ).toBeVisible();
  const usage = (
    await d
      .from("ai_usage")
      .select("used")
      .eq("user_id", user.id)
      .eq("feature", "foodSnap")
  ).data;
  expect(usage ?? []).toHaveLength(0);

  // Seed what a successful scan writes: a draft with a catalog item and a low-confidence AI estimate.
  const items = [
    {
      name: padThai.th,
      catalog_key: padThai.key,
      servings: 1,
      source: "catalog",
      confidence: 0.9,
      per_serving: {
        kcal: padThai.kcal,
        protein_g: padThai.protein_g,
        carbs_g: padThai.carbs_g,
        fat_g: padThai.fat_g,
      },
    },
    {
      name: "ขนมแปลก",
      catalog_key: null,
      servings: 1,
      source: "ai",
      confidence: 0.3,
      per_serving: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 2 },
    },
  ];
  const seeded = await d
    .from("meal_logs")
    .insert({
      user_id: user.id,
      meal_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      items,
      kcal: padThai.kcal + 100,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      model: "test/none",
    })
    .select("id");
  expect(seeded.error).toBeNull();
  const mealId = seeded.data![0].id;

  await page.goto(`/scan/food/${mealId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "ตรวจทานมื้อนี้" }),
  ).toBeVisible();
  await expect(page.getByText("AI ประมาณการ ตรวจทานด้วยนะ")).toBeVisible();
  await expect(page.getByText("AI ไม่ค่อยมั่นใจรายการนี้")).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // Double the first item, then save.
  await page.locator("#servings-0").selectOption("2");
  await page.getByRole("button", { name: "บันทึกมื้อนี้" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "บันทึกมื้ออาหารแล้ว" }),
  ).toBeVisible();

  const saved = (
    await d
      .from("meal_logs")
      .select("status, kcal, confirmed_at, items")
      .eq("id", mealId)
      .single()
  ).data!;
  expect(saved.status).toBe("confirmed");
  expect(saved.confirmed_at).not.toBeNull();
  expect(saved.kcal).toBe(padThai.kcal * 2 + 100); // recomputed by the server from the stored per-serving numbers
  expect(
    (saved.items as { servings: number }[]).map((i) => i.servings),
  ).toEqual([2, 1]);
  expect(await serious(page)).toEqual([]);

  // It shows up on the timeline.
  await page.goto("/timeline");
  await expect(page.getByRole("heading", { name: "มื้ออาหาร" })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: new RegExp(`${padThai.kcal * 2 + 100} กิโลแคลอรี`),
    }),
  ).toBeVisible();

  // RLS with a real JWT: read own, never write, never see others'.
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  expect((await c.from("meal_logs").select("id")).data).toEqual([
    { id: mealId },
  ]);
  expect(
    (
      await c
        .from("meal_logs")
        .update({ kcal: 1 })
        .eq("id", mealId)
        .select("id")
    ).error,
  ).not.toBeNull();
  expect(
    (
      await c.from("meal_logs").insert({
        user_id: user.id,
        meal_date: "2026-10-10",
        items,
        kcal: 1,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      })
    ).error,
  ).not.toBeNull();
  const other = await makeUser();
  const c2 = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c2.auth.signInWithPassword(other);
  expect((await c2.from("meal_logs").select("id")).data).toEqual([]);

  // Delete from the meal page.
  await page.goto(`/scan/food/${mealId}`);
  await page.getByRole("button", { name: "ลบมื้อนี้" }).click();
  await expect(page).toHaveURL(/\/timeline/);
  expect(
    (await d.from("meal_logs").select("id").eq("id", mealId)).data,
  ).toEqual([]);

  // Switching the feature off removes the page and the hub card.
  await d
    .from("platform_settings")
    .update({ feature_flags: { ...flagsOn, food_scan: false } })
    .eq("id", true);
  await expect
    .poll(async () => (await page.goto("/scan/food"))?.status(), {
      timeout: 60_000,
    })
    .toBe(404);
  await page.goto("/scan");
  await expect(page.getByRole("link", { name: /สแกนอาหาร/ })).toHaveCount(0);
});
