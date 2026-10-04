import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live monthly report: figures come from the person's own data, a quiet month
 * is not "reported", the AI recap is optional (its call is real, so both a
 * success and an unavailable provider are accepted — what is asserted is that
 * each leaves the database and the allowance consistent), and the feature
 * switch turns the page off.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

const expect = baseExpect.configure({ timeout: 30_000 });

test.skip(
  !enabled,
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

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

async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

let originalFlags: unknown = {};

test.afterAll(async () => {
  const d = db();
  await d
    .from("platform_settings")
    .update({ feature_flags: originalFlags })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

const bangkokToday = () =>
  new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function lastMonth() {
  const [y, m] = bangkokToday().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

test("monthly report: figures, quiet month, optional AI recap, feature switch", async ({
  page,
}) => {
  const d = db();
  originalFlags =
    (
      await d
        .from("platform_settings")
        .select("feature_flags")
        .eq("id", true)
        .single()
    ).data?.feature_flags ?? {};
  const user = await makeUser();
  const month = lastMonth();
  await signInAndConsent(page, user.email, user.password);

  // ── nothing logged: the page still works, and the AI button is not offered ──
  await page.goto(`/report?month=${month}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "รายงานสุขภาพรายเดือน" }),
  ).toBeVisible();
  await expect(page.getByText("เช็กอิน 0 วัน")).toBeVisible();
  await expect(
    page.getByText(/เดือนนี้มีเช็กอินน้อยเกินกว่าจะสรุป/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ให้ AI สรุปเดือนนี้" }),
  ).toHaveCount(0);

  // ── seed last month: 5 consecutive check-ins, 2 meals on one day, a lab report ──
  const dates = [1, 2, 3, 4, 5].map((n) => `${month}-0${n}`);
  expect(
    (
      await d.from("daily_checkins").insert(
        dates.map((checkin_date) => ({
          user_id: user.id,
          checkin_date,
          sleep_band: 3,
          activity_band: 2,
          energy: 4,
          mood: 4,
          nutrition: 3,
        })),
      )
    ).error,
  ).toBeNull();
  for (const kcal of [400, 500])
    expect(
      (
        await d.from("meal_logs").insert({
          user_id: user.id,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          meal_date: `${month}-02`,
          kcal,
          protein_g: 10,
          carbs_g: 50,
          fat_g: 10,
          items: [{ name: "x", kcal }],
          model: "test/none",
        })
      ).error,
    ).toBeNull();
  expect(
    (
      await d.from("lab_reports").insert({
        user_id: user.id,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        collected_on: `${month}-03`,
        items: [
          {
            name: "LDL-C",
            marker_key: "ldl",
            value: 150,
            unit: "mg/dL",
            value_std: 150,
            status: "watch",
            printed_range: "",
            confidence: 0.95,
          },
        ],
        model: "test/none",
      })
    ).error,
  ).toBeNull();

  await page.goto(`/report?month=${month}`);
  const figures = page.getByRole("region", { name: /\d{4}/ }).first();
  await expect(figures).toContainText("เช็กอิน 5 วัน");
  await expect(figures).toContainText("ต่อเนื่องนานที่สุด 5 วัน");
  await expect(figures).toContainText("บันทึกมื้ออาหาร 2 มื้อ ใน 1 วัน");
  await expect(figures).toContainText("เพิ่มผลตรวจ 1 ฉบับ");
  await expect(figures).toContainText("ไขมันเลว (LDL)"); // the NAME only…
  await expect(figures).not.toContainText("150"); // …never the value
  expect(await serious(page)).toEqual([]);

  // junk month falls back to the newest month; this month is not offered as an old one
  expect((await page.goto("/report?month=abc"))?.status()).toBe(200);
  await expect(
    page
      .getByRole("navigation", { name: "เลือกเดือน" })
      .getByRole("link")
      .first(),
  ).toHaveAttribute("aria-current", "page");

  // ── the AI recap: either outcome leaves things consistent ──
  await page.goto(`/report?month=${month}`);
  await page.getByRole("button", { name: "ให้ AI สรุปเดือนนี้" }).click();
  await expect(
    page
      .getByRole("button", { name: "ลบสรุปนี้ (เพื่อให้เขียนใหม่)" })
      .or(page.getByRole("alert").filter({ hasText: /\S/ })),
  ).toBeVisible({ timeout: 120_000 });
  const rows = (
    await d.from("monthly_reports").select("summary").eq("user_id", user.id)
  ).data!;
  const usage =
    (
      await d
        .from("ai_usage")
        .select("used")
        .eq("user_id", user.id)
        .eq("feature", "aiChat")
    ).data ?? [];
  const used = usage.reduce((n, r) => n + Number(r.used), 0);
  if (rows.length === 1) {
    expect(used).toBe(1);
    await expect(page.getByText(rows[0].summary.slice(0, 20))).toBeVisible();
    await expect(page.getByText(/ไม่ใช่การวินิจฉัย/)).toBeVisible();
    expect(
      (
        (
          await d
            .from("ai_conversations")
            .select("id")
            .eq("user_id", user.id)
            .eq("kind", "monthly_report")
        ).data ?? []
      ).length,
    ).toBe(1);
    // deleting lets it be written again
    await page
      .getByRole("button", { name: "ลบสรุปนี้ (เพื่อให้เขียนใหม่)" })
      .click();
    await expect(
      page.getByRole("button", { name: "ให้ AI สรุปเดือนนี้" }),
    ).toBeVisible();
    expect(
      (
        (await d.from("monthly_reports").select("month").eq("user_id", user.id))
          .data ?? []
      ).length,
    ).toBe(0);
  } else {
    expect(rows).toHaveLength(0);
    expect(used).toBe(0); // refunded
  }

  // ── a person cannot write a recap themselves ──
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  expect(
    (
      await c.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await c.from("monthly_reports").insert({
        user_id: user.id,
        month: `${month}-01`,
        summary: "I wrote this myself.",
      })
    ).error,
  ).not.toBeNull();

  // ── the feature switch turns the page off ──
  expect(
    (
      await d
        .from("platform_settings")
        .update({ feature_flags: { monthly_report: false } })
        .eq("id", true)
    ).error,
  ).toBeNull();
  await page.waitForTimeout(1500); // the settings cache
  await expect
    .poll(async () => (await page.goto(`/report?month=${month}`))?.status(), {
      timeout: 70_000,
    })
    .toBe(404);
});
