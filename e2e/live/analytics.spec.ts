import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live usage analytics: the events a real session writes (signup once, active
 * once a day, paywall view), what the admin dashboard shows from them, and that
 * a normal user cannot open it. No AI call.
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
test.setTimeout(150_000);

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
  for (const id of createdIds) await db().auth.admin.deleteUser(id); // their events go with them
});

const eventsOf = async (userId: string) =>
  (
    await db()
      .from("product_events")
      .select("event, detail")
      .eq("user_id", userId)
  ).data ?? [];

test("a session writes signup, active and paywall events; the dashboard reads them; users cannot open it", async ({
  page,
  browser,
}) => {
  const d = db();
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  // consent → one signup; the layout (after the page is sent) → one active
  await expect
    .poll(async () => (await eventsOf(user.id)).map((e) => e.event).sort())
    .toEqual(["active", "signup"]);

  // many page views in one day still make ONE active; viewing the plans page is recorded
  await page.goto("/timeline");
  await page.goto("/subscription");
  await expect
    .poll(
      async () =>
        (await eventsOf(user.id)).filter((e) => e.event === "paywall_viewed")
          .length,
    )
    .toBeGreaterThanOrEqual(1);
  const now = (await eventsOf(user.id)).map((e) => e.event);
  expect(now.filter((e) => e === "active")).toHaveLength(1);
  expect(now.filter((e) => e === "signup")).toHaveLength(1);

  // the events hold no content
  for (const e of await eventsOf(user.id)) expect(e.detail).toBeNull();

  // a normal user cannot open the dashboard
  const denied = await page.goto("/admin/analytics");
  expect([403, 404]).toContain(denied?.status());
  expect(await page.getByText("สถิติการใช้งาน").count()).toBe(0);

  // an admin can, and sees the numbers
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();
  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin");
  await ap.getByRole("link", { name: "สถิติการใช้งาน" }).click();
  await expect(ap).toHaveURL(/\/admin\/analytics$/);
  await expect(
    ap.getByRole("heading", { level: 1, name: "สถิติการใช้งาน" }),
  ).toBeVisible();
  for (const h of [
    "ผู้ใช้ที่ใช้งาน",
    "เส้นทางผู้ใช้ (funnel)",
    "กลับมาใช้ซ้ำ",
    "การใช้งานแต่ละอย่าง",
  ])
    await expect(ap.getByRole("heading", { name: h })).toBeVisible();
  // our two active users show in today's count, and the funnel steps are listed in order
  const dau = ap.locator("dl").first().locator("div").first();
  await expect(dau.locator("dt")).toHaveText("วันนี้");
  expect(Number(await dau.locator("dd").innerText())).toBeGreaterThanOrEqual(2);
  await expect(
    ap.getByRole("listitem").filter({ hasText: "สมัครและยินยอม" }).first(),
  ).toBeVisible();
  await expect(ap.getByText("เปิดหน้าแพ็กเกจ").first()).toBeVisible();
  expect(await serious(ap)).toEqual([]);
  // the window switch
  await ap.getByRole("link", { name: "7 วัน" }).click();
  await expect(ap).toHaveURL(/days=7/);
  await expect(ap.getByRole("link", { name: "7 วัน" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // an unknown window falls back to the default instead of failing
  expect((await ap.goto("/admin/analytics?days=999"))?.status()).toBe(200);
  await expect(ap.getByRole("link", { name: "30 วัน" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await ctx.close();
});
