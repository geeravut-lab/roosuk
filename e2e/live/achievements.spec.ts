import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live achievements: badges are awarded from the person's own history on
 * Today / Achievements, show progress for the rest, and cannot be written by the
 * person.
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
test.setTimeout(120_000);

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

test.afterAll(async () => {
  for (const id of createdIds) await db().auth.admin.deleteUser(id);
});

const day = (offset: number) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

test("achievements: earned from real history, progress for the rest, not writable", async ({
  page,
}) => {
  const d = db();
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  await page.goto("/achievements");
  await expect(
    page.getByRole("heading", { level: 1, name: "ความสำเร็จ" }),
  ).toBeVisible();
  await expect(page.getByText("ได้แล้ว 0 จาก 13")).toBeVisible();
  await expect(page.getByText("ไม่เกี่ยวกับรูปร่างหรือน้ำหนัก")).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // three days in a row → first check-in + 3-day streak, awarded on the next Today visit
  const checkins = [0, 1, 2].map((i) => ({
    user_id: user.id,
    checkin_date: day(-i),
    sleep_band: 3,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  }));
  expect((await d.from("daily_checkins").insert(checkins)).error).toBeNull();
  await page.goto("/today");
  await expect(page.getByRole("link", { name: /ดูความสำเร็จ/ })).toContainText(
    "ได้แล้ว 2 จาก 13",
  );
  await page.getByRole("link", { name: /ดูความสำเร็จ/ }).click();
  await expect(page).toHaveURL(/\/achievements/);

  const first = page.getByRole("listitem").filter({ hasText: "เช็กอินวันแรก" });
  await expect(first).toContainText("ได้เมื่อ");
  await expect(first).toContainText("ใหม่");
  await expect(
    page.getByRole("listitem").filter({ hasText: "ต่อเนื่อง 3 วัน" }),
  ).toContainText("ได้เมื่อ");
  // not yet: progress is shown, and it is a real number
  const seven = page
    .getByRole("listitem")
    .filter({ hasText: "ต่อเนื่อง 7 วัน" });
  await expect(seven).not.toContainText("ได้เมื่อ");
  await expect(seven).toContainText("3 / 7");
  expect(await serious(page)).toEqual([]);

  // rows in the database are exactly those two, dated today (Bangkok)
  const rows = (
    await d
      .from("user_achievements")
      .select("key, earned_on")
      .eq("user_id", user.id)
  ).data!;
  expect(rows.map((r) => r.key).sort()).toEqual(["checkin_first", "streak_3"]);
  expect(rows.every((r) => r.earned_on === day(0))).toBe(true);

  // the person cannot award themselves anything
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
      await c
        .from("user_achievements")
        .insert({ user_id: user.id, key: "streak_30", earned_on: day(0) })
    ).error,
  ).not.toBeNull();
  expect(
    (await c.rpc("award_achievements", { p_user: user.id })).error,
  ).not.toBeNull();
  expect(
    ((await c.from("user_achievements").select("key")).data ?? []).length,
  ).toBe(2);
});
