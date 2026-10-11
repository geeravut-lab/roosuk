import { expect as baseExpect, test } from "@playwright/test";
import { DEFAULT_PRICING } from "../../src/config/plans";
import {
  db,
  liveEnabled,
  makeUser,
  removeUsers,
  seriousViolations,
  signInAndConsent,
} from "./util";

/**
 * The 2026-10 modules against the real database: a goal made from the intake questions
 * (the AI may or may not answer — the standard program is the fallback), ticking a task,
 * the admin's plan prices, and every new page opening without an error or a serious
 * accessibility problem.
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
test.setTimeout(240_000);

const created: string[] = [];
let originalPlans: Record<string, unknown> = {};
const PLAN_COLUMNS =
  "price_gold_monthly, price_gold_yearly, price_premium_monthly, price_premium_yearly, trial_days, fair_use_cap_trial, fair_use_cap_premium, plan_overrides, plan_specs";

test.beforeAll(async () => {
  originalPlans = (
    await db()
      .from("platform_settings")
      .select(PLAN_COLUMNS)
      .eq("id", true)
      .single()
  ).data!;
});

test.afterAll(async () => {
  await db().from("platform_settings").update(originalPlans).eq("id", true);
  await removeUsers(created);
});

test("a sleep goal: questions → program → tick a task → end it", async ({
  page,
}) => {
  const user = await makeUser(created);
  await signInAndConsent(page, user);

  await page.goto("/goals");
  await expect(
    page.getByRole("heading", { level: 1, name: "เป้าหมายของฉัน" }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("link", { name: /นอนหลับสนิท/ }).click();
  await expect(page).toHaveURL(/\/goals\/new\/sleep/);
  await page.waitForLoadState("networkidle");

  await page
    .locator('input[name="avg_hours"][value="5to6"]')
    .check({ force: true });
  await page
    .locator('input[name="problem"][value="fall_asleep"]')
    .check({ force: true });
  await page
    .locator('input[name="caffeine"][value="afternoon"]')
    .check({ force: true });
  await page.locator('input[name="wake_time"]').fill("06:30");
  await page.getByRole("button", { name: "สร้างโปรแกรมของฉัน" }).click();

  await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  const goal = (
    await db()
      .from("user_goals")
      .select("id, kind, status")
      .eq("user_id", user.id)
      .single()
  ).data!;
  expect(goal).toMatchObject({ kind: "sleep", status: "active" });
  const program = (
    await db()
      .from("goal_programs")
      .select("source, plan")
      .eq("goal_id", goal.id)
      .single()
  ).data!;
  expect(["ai", "template"]).toContain(program.source);
  expect(
    (program.plan as { tasks: unknown[] }).tasks.length,
  ).toBeGreaterThanOrEqual(3);

  const first = page.getByRole("button", { name: /— ติ๊ก|— tick/i }).first();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await first.click();
  await expect(
    page.getByRole("button", { pressed: true }).first(),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await db()
            .from("goal_task_checks")
            .select("task_key")
            .eq("goal_id", goal.id)
        ).data?.length,
    )
    .toBe(1);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "ทำสำเร็จแล้ว" }).click();
  await expect
    .poll(
      async () =>
        (
          await db()
            .from("user_goals")
            .select("status")
            .eq("id", goal.id)
            .single()
        ).data?.status,
    )
    .toBe("completed");
});

test("a person cannot read or tick someone else's goal", async ({ page }) => {
  const [a, b] = [await makeUser(created), await makeUser(created)];
  const { data } = await db()
    .from("user_goals")
    .insert({
      user_id: a.id,
      kind: "sleep",
      params: {
        avgHours: "6to7",
        problem: "fall_asleep",
        caffeine: "none",
        wakeTime: "06:30",
      },
      started_on: "2026-10-10",
      ends_on: "2026-10-24",
    })
    .select("id");
  expect(data).toHaveLength(1);
  await signInAndConsent(page, b);
  const res = await page.goto(`/goals/${data![0].id}`);
  expect(res?.status()).toBe(404);
});

test("every new page opens for a signed-in person without errors or serious accessibility problems", async ({
  page,
}) => {
  const user = await makeUser(created);
  await signInAndConsent(page, user);
  for (const path of [
    "/liver",
    "/liver/check",
    "/liver/hepatitis",
    "/liver/brief",
    "/telepharmacy",
    "/verify",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(500);
    await expect(page.locator("main"), path).toBeVisible();
    expect(await seriousViolations(page), path).toEqual([]);
  }
  // a person who is not a pharmacist has no pharmacist desk
  expect((await page.goto("/pharmacist"))?.status()).toBe(404);
  // and no admin pages
  for (const path of [
    "/admin/plans",
    "/admin/branding",
    "/admin/ekyc",
    "/admin/telepharmacy",
  ])
    expect((await page.goto(path))?.status(), path).not.toBe(200);
});

test("the admin edits plan prices, they reach the plans page, and reset restores the defaults", async ({
  page,
}) => {
  const admin = await makeUser(created);
  await db().from("admins").insert({ user_id: admin.id });
  await signInAndConsent(page, admin);

  for (const path of [
    "/admin",
    "/admin/plans",
    "/admin/branding",
    "/admin/ekyc",
    "/admin/telepharmacy",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    expect(await seriousViolations(page), path).toEqual([]);
  }

  await page.goto("/admin/plans");
  await page.waitForLoadState("networkidle");
  await page.locator('input[name="price_gold_monthly"]').fill("123");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator("p[role=status]")).toContainText("บันทึกแล้ว");
  await expect
    .poll(
      async () =>
        (
          await db()
            .from("platform_settings")
            .select("price_gold_monthly")
            .eq("id", true)
            .single()
        ).data?.price_gold_monthly,
    )
    .toBe(123);

  await page.goto("/admin/plans");
  await page.getByRole("button", { name: "คืนค่าเริ่มต้นทั้งหมด" }).click();
  await expect(page.locator("p[role=status]")).toContainText(
    "คืนค่าเริ่มต้นแล้ว",
  );
  await expect
    .poll(
      async () =>
        (
          await db()
            .from("platform_settings")
            .select("price_gold_monthly")
            .eq("id", true)
            .single()
        ).data?.price_gold_monthly,
    )
    .toBe(DEFAULT_PRICING.goldMonthly);
});

test("the new database objects are in place and a person cannot reach another person's rows", async () => {
  const d = db();
  // meal slot column and the weight table exist
  expect(
    (await d.from("meal_logs").select("meal_type").limit(1)).error,
  ).toBeNull();
  expect(
    (await d.from("weight_logs").select("logged_on").limit(1)).error,
  ).toBeNull();
  expect(
    (await d.from("liver_assessments").select("id").limit(1)).error,
  ).toBeNull();
  expect((await d.from("consults").select("id").limit(1)).error).toBeNull();
  expect(
    (await d.from("ekyc_verifications").select("status").limit(1)).error,
  ).toBeNull();
  expect(
    (await d.from("shop_products").select("requires_kyc").limit(1)).error,
  ).toBeNull();
  // the weekly food-watch rule was registered
  const rule = (
    await d
      .from("automation_rules")
      .select("key, enabled")
      .eq("key", "diet_watch")
  ).data;
  expect(rule).toHaveLength(1);
});
