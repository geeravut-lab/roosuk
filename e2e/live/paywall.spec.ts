import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";
import { variantFor } from "../../src/lib/paywall/paywall";

/**
 * Live paywall A/B: the two versions show the SAME plans and prices (only order
 * and wording differ), a person always sees the same version, funnel events are
 * tagged with it, the admin can pin or switch it off, and the admin page counts
 * distinct people per version.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

// Every step crosses the network to Supabase (and the sandbox proxy): wait longer than the 5 s default.
const expect = baseExpect.configure({ timeout: 20_000 });

const startedAt = new Date(Date.now() - 5_000).toISOString();

test.skip(
  !enabled,
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

let original: Record<string, unknown> = {};

test.afterAll(async () => {
  const d = db();
  await removeAdminNoticesSince(d, startedAt);
  if (createdIds.length) {
    await d.from("payments").delete().in("user_id", createdIds);
    for (const id of createdIds) await d.auth.admin.deleteUser(id);
  }
  await d.from("platform_settings").update(original).eq("id", true);
});

const setMode = async (mode: string) => {
  const r = await db()
    .from("platform_settings")
    .update({ paywall_ab: mode })
    .eq("id", true);
  expect(r.error).toBeNull();
  await new Promise((res) => setTimeout(res, 31_000)); // the settings cache is 30 s
};

test("paywall A/B: same plans, different order; stable; tagged; switchable; counted", async ({
  page,
  browser,
}) => {
  const d = db();
  original = ((
    await d
      .from("platform_settings")
      .select("paywall_ab, promptpay_id")
      .eq("id", true)
      .single()
  ).data ?? {}) as Record<string, unknown>;
  await d
    .from("platform_settings")
    .update({ promptpay_id: "0812345678" })
    .eq("id", true);
  const pricing = (
    await d
      .from("platform_settings")
      .select("price_gold_monthly, price_gold_yearly")
      .eq("id", true)
      .single()
  ).data!;
  const monthly = Number(pricing.price_gold_monthly ?? 49);
  const yearly = Number(pricing.price_gold_yearly ?? 490);

  // one person who will see A and one who will see B under the split
  let ua = await makeUser();
  let ub = await makeUser();
  for (let i = 0; i < 40 && variantFor(ua.id, "ab") !== "a"; i++)
    ua = await makeUser();
  for (let i = 0; i < 40 && variantFor(ub.id, "ab") !== "b"; i++)
    ub = await makeUser();
  expect(variantFor(ua.id, "ab")).toBe("a");
  expect(variantFor(ub.id, "ab")).toBe("b");
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();

  const gold = (p: Page) =>
    p
      .getByRole("listitem")
      .filter({ has: p.getByRole("heading", { name: /Gold/ }) });
  const firstPayButton = async (p: Page) =>
    (await gold(p).locator("form button[name=period]").first().textContent()) ??
    "";
  const priceLines = async (p: Page) =>
    (await gold(p).locator("h3 + p, h3 ~ p").allTextContents()).join(" | ");

  // ── the split: each person sees their own version, the same one every time ──
  await setMode("ab");
  await signInAndConsent(page, ua.email, ua.password);
  await page.goto("/subscription");
  expect(await firstPayButton(page)).toContain("รายเดือน");
  await expect(page.getByText(/ไม่มีการต่ออายุอัตโนมัติ/)).toHaveCount(0);
  const aLines = await priceLines(page);
  expect(aLines).toContain(`฿${monthly}`);
  expect(aLines).toContain(`฿${yearly}`);
  await page.reload();
  expect(await firstPayButton(page)).toContain("รายเดือน"); // stable

  const ctxB = await browser.newContext();
  const pb = await ctxB.newPage();
  await signInAndConsent(pb, ub.email, ub.password);
  await pb.goto("/subscription");
  expect(await firstPayButton(pb)).toContain("รายปี");
  await expect(pb.getByText(/ไม่มีการต่ออายุอัตโนมัติ/)).toBeVisible();
  const bLines = await priceLines(pb);
  expect(bLines).toContain(`฿${monthly}`); // the same prices, only the order differs
  expect(bLines).toContain(`฿${yearly}`);
  expect(bLines).toMatch(/ประหยัด \d+%/);
  expect(await seriousViolations(pb)).toEqual([]);
  expect(await seriousViolations(page)).toEqual([]);

  // ── the events carry the version ──
  await expect
    .poll(async () =>
      (
        (
          await d
            .from("product_events")
            .select("detail")
            .eq("user_id", ua.id)
            .eq("event", "paywall_viewed")
        ).data ?? []
      )
        .map((r) => r.detail)
        .includes("pw_a"),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      (
        (
          await d
            .from("product_events")
            .select("detail")
            .eq("user_id", ub.id)
            .eq("event", "paywall_viewed")
        ).data ?? []
      )
        .map((r) => r.detail)
        .includes("pw_b"),
    )
    .toBe(true);
  await pb
    .getByRole("listitem")
    .filter({ has: pb.getByRole("heading", { name: /Gold/ }) })
    .locator("form button[name=period]")
    .first()
    .click();
  await expect(pb).toHaveURL(/\/subscription\/pay\//);
  await expect
    .poll(async () =>
      (
        (
          await d
            .from("product_events")
            .select("detail")
            .eq("user_id", ub.id)
            .eq("event", "order_created")
        ).data ?? []
      ).map((r) => r.detail),
    )
    .toEqual(["pw_b"]);
  await ctxB.close();

  // ── the admin page counts distinct people per version, and says when it is too early ──
  const ctxA = await browser.newContext();
  const ap = await ctxA.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin");
  await ap.getByRole("link", { name: /ทดสอบหน้าสมัครสมาชิก/ }).click();
  await expect(ap).toHaveURL(/\/admin\/paywall$/);
  expect(await seriousViolations(ap)).toEqual([]);
  await expect(
    ap.getByRole("listitem").filter({ hasText: "แบบ A" }),
  ).toContainText("เห็นหน้านี้");
  await expect(ap.getByText(/น้อยกว่า 30 คนต่อแบบ/)).toBeVisible();

  // ── pinned: everyone sees B; then switched off: everyone sees A ──
  await ap.getByLabel("ทุกคนเห็น B").check();
  await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "บันทึกโหมดแล้ว" }),
  ).toBeVisible();
  await page.waitForTimeout(31_000);
  await page.goto("/subscription");
  expect(await firstPayButton(page)).toContain("รายปี");
  await ap.getByLabel("ปิดการทดสอบ").check();
  await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "บันทึกโหมดแล้ว" }),
  ).toBeVisible();
  await page.waitForTimeout(31_000);
  await page.goto("/subscription");
  expect(await firstPayButton(page)).toContain("รายเดือน");
  expect(
    (
      await d
        .from("platform_settings")
        .select("paywall_ab")
        .eq("id", true)
        .single()
    ).data?.paywall_ab,
  ).toBe("off");

  // a normal user cannot open the admin page
  expect([403, 404]).toContain((await page.goto("/admin/paywall"))?.status());
  await ctxA.close();
});
