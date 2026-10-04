import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live user-guide link: without an admin-set URL the menu entry is greyed out
 * and not a link; once an admin saves an https URL it opens that document in a
 * new tab; junk is refused; a normal user cannot reach the admin page.
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

let original = "";

test.afterAll(async () => {
  const d = db();
  await d
    .from("platform_settings")
    .update({ manual_url: original })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

const more = async (page: Page) => {
  await page.getByRole("button", { name: "เพิ่มเติม" }).click();
};

test("user guide link: greyed out until an admin sets it, then opens the document", async ({
  page,
  browser,
}) => {
  const d = db();
  original =
    (
      await d
        .from("platform_settings")
        .select("manual_url")
        .eq("id", true)
        .single()
    ).data?.manual_url ?? "";
  expect(
    (
      await d
        .from("platform_settings")
        .update({ manual_url: "" })
        .eq("id", true)
    ).error,
  ).toBeNull();
  const user = await makeUser();
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();

  // ── no link yet ──
  await signInAndConsent(page, user.email, user.password);
  await more(page);
  const sheet = page.getByRole("dialog").or(page.locator("[id*=more]")).first();
  const entry = page
    .locator('[aria-disabled="true"]')
    .filter({ hasText: "คู่มือการใช้งาน" })
    .last();
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("ยังไม่พร้อมใช้งาน");
  expect(await entry.evaluate((e) => e.tagName)).toBe("SPAN"); // not a link: it cannot be pressed
  await expect(page.getByRole("link", { name: "คู่มือการใช้งาน" })).toHaveCount(
    0,
  );
  expect(await serious(page)).toEqual([]);
  void sheet;

  // a normal user cannot open the admin page
  expect([403, 404]).toContain((await page.goto("/admin/manual"))?.status());

  // ── the admin sets it (junk first) ──
  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin");
  await ap.getByRole("link", { name: /คู่มือการใช้งาน \(ลิงก์\)/ }).click();
  await expect(ap).toHaveURL(/\/admin\/manual$/);
  expect(await serious(ap)).toEqual([]);
  for (const bad of [
    "http://example.com/guide.pdf",
    "javascript:alert(1)",
    "example.com/guide",
    "https://user:pw@example.com/x",
  ]) {
    await ap.getByLabel("ลิงก์คู่มือ (https)").fill(bad);
    await ap
      .locator("main form")
      .first()
      .evaluate((f) => f.setAttribute("novalidate", ""));
    await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(
      ap.getByRole("alert").filter({ hasText: /ลิงก์ไม่ถูกต้อง/ }),
    ).toBeVisible();
  }
  expect(
    (
      await d
        .from("platform_settings")
        .select("manual_url")
        .eq("id", true)
        .single()
    ).data?.manual_url,
  ).toBe("");

  const good = "https://example.com/roosuk-guide.pdf";
  await ap.getByLabel("ลิงก์คู่มือ (https)").fill(good);
  await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "บันทึกลิงก์แล้ว" }),
  ).toBeVisible();
  expect(
    (
      await d
        .from("platform_settings")
        .select("manual_url")
        .eq("id", true)
        .single()
    ).data?.manual_url,
  ).toBe(good);

  // ── the user now gets a real link that opens in a new tab ──
  await expect
    .poll(
      async () => {
        await page.goto("/today");
        await more(page);
        return await page
          .getByRole("link", { name: "คู่มือการใช้งาน" })
          .count();
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  const link = page.getByRole("link", { name: "คู่มือการใช้งาน" }).last();
  await expect(link).toHaveAttribute("href", good);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noreferrer/);

  // ── clearing it greys the entry again ──
  await ap.getByLabel("ลิงก์คู่มือ (https)").fill("");
  await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "ล้างลิงก์แล้ว" }),
  ).toBeVisible();
  await ctx.close();
});
