import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live "สนใจตรวจสุขภาพ" (callback request): the form and its checks, one open
 * request per person, the admin hearing about it (inbox + list) and working it,
 * withdrawing, and the feature switch. No health data is attached to a lead.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

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
test.setTimeout(180_000);

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
    user_metadata: { full_name: "Lead Tester" },
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
  await removeAdminNoticesSince(d, startedAt);
  await d
    .from("platform_settings")
    .update({ feature_flags: originalFlags })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id); // leads, notices and events go with them
});

test("callback request: checked form, one open request, admin inbox and list, withdraw, feature switch", async ({
  page,
  browser,
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
  delete flagsOn.checkup_lead;
  await d
    .from("platform_settings")
    .update({ feature_flags: flagsOn })
    .eq("id", true);

  const user = await makeUser();
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();
  await signInAndConsent(page, user.email, user.password);

  // ── entry point and form ───────────────────────────────────────────────────
  await page.getByRole("link", { name: /สนใจตรวจสุขภาพเชิงลึก/ }).click();
  await expect(page).toHaveURL(/\/checkup-interest$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "สนใจตรวจสุขภาพ" }),
  ).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // server-side checks (browser validation switched off to prove it): no agreement → refused
  await page
    .locator("main form")
    .evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect(
    page.getByText("กรุณายินยอมให้ติดต่อกลับก่อนส่งคำขอ"),
  ).toBeVisible();
  // phone chosen but no number → refused
  await page.getByRole("radio", { name: "โทรศัพท์" }).check();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect(page.getByText("ข้อมูลไม่ครบหรือไม่ถูกต้อง")).toBeVisible();
  // an error does not wipe what was entered
  await expect(page.getByRole("radio", { name: "โทรศัพท์" })).toBeChecked();
  await expect(page.getByRole("checkbox")).toBeChecked();
  expect(
    (await d.from("checkup_leads").select("id").eq("user_id", user.id)).data,
  ).toHaveLength(0);

  // a good request, by phone
  await page.getByRole("radio", { name: "ตรวจสุขภาพที่บ้าน" }).check();
  await page.getByLabel("เบอร์โทรศัพท์").fill("081-234-5678");
  await page
    .getByLabel(/อยากบอกอะไรเพิ่มเติม/)
    .fill("โทรหลัง 5 โมงเย็นได้ครับ");
  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  // the page re-renders into the "waiting for a reply" state
  await expect(
    page.getByRole("heading", { name: "คำขอของคุณรอการติดต่อกลับ" }),
  ).toBeVisible();
  const rows = (
    await d.from("checkup_leads").select("*").eq("user_id", user.id)
  ).data!;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    interest: "home_service",
    contact_method: "phone",
    phone: "081-234-5678",
    note: "โทรหลัง 5 โมงเย็นได้ครับ",
    status: "new",
  });
  // nothing about their health is on the row
  expect(Object.keys(rows[0]).sort()).toEqual(
    [
      "admin_note",
      "consented_at",
      "contact_method",
      "created_at",
      "id",
      "interest",
      "note",
      "phone",
      "status",
      "updated_at",
      "user_id",
    ].sort(),
  );

  // one open request per person: the page now shows it (no second form), and the database refuses a duplicate
  await page.goto("/checkup-interest");
  await expect(
    page.getByRole("heading", { name: "คำขอของคุณรอการติดต่อกลับ" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "ส่งคำขอ" })).toHaveCount(0);
  expect(
    (
      await d.from("checkup_leads").insert({
        user_id: user.id,
        interest: "checkup",
        contact_method: "line",
      })
    ).error?.code,
  ).toBe("23505");

  // ── the team hears about it: inbox notice + the list ───────────────────────
  await expect
    .poll(
      async () =>
        (
          await d
            .from("app_notifications")
            .select("kind")
            .eq("user_id", admin.id)
            .eq("kind", "lead_new")
        ).data?.length,
    )
    .toBe(1);
  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin");
  await expect(
    ap.getByRole("link", { name: /ผู้สนใจตรวจสุขภาพ/ }),
  ).toContainText("รอติดต่อ");
  await ap.getByRole("link", { name: /ผู้สนใจตรวจสุขภาพ/ }).click();
  const card = ap.getByRole("listitem").filter({ hasText: "Lead Tester" });
  await expect(card).toContainText("ตรวจสุขภาพที่บ้าน");
  await expect(card).toContainText("081-234-5678");
  await expect(card).toContainText("โทรหลัง 5 โมงเย็นได้ครับ");
  expect(await serious(ap)).toEqual([]);
  await card.getByLabel("สถานะ").selectOption("contacted");
  await card.getByLabel("บันทึกของทีม").fill("โทรแล้ว นัดตรวจวันเสาร์");
  await card.getByRole("button", { name: "บันทึก" }).click();
  await expect
    .poll(
      async () =>
        (
          await d
            .from("checkup_leads")
            .select("status, admin_note")
            .eq("user_id", user.id)
        ).data?.[0],
    )
    .toEqual({ status: "contacted", admin_note: "โทรแล้ว นัดตรวจวันเสาร์" });

  // a normal user cannot open the admin list
  expect([403, 404]).toContain((await page.goto("/admin/leads"))?.status());

  // handled → the person can ask again; then withdraw it
  await page.goto("/checkup-interest");
  await expect(page.getByRole("button", { name: "ส่งคำขอ" })).toBeVisible();
  await page.getByRole("radio", { name: "ขอคำปรึกษาก่อน" }).check();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "ส่งคำขอ" }).click();
  // the page re-renders into the "waiting for a reply" state
  await expect(
    page.getByRole("heading", { name: "คำขอของคุณรอการติดต่อกลับ" }),
  ).toBeVisible();
  await page.goto("/checkup-interest");
  await page.getByRole("button", { name: "ยกเลิกคำขอ" }).click();
  await expect(page.getByRole("button", { name: "ส่งคำขอ" })).toBeVisible();
  expect(
    (
      await d
        .from("checkup_leads")
        .select("status")
        .eq("user_id", user.id)
        .eq("status", "new")
    ).data,
  ).toHaveLength(0);
  // the handled one is kept for the team's records
  expect(
    (await d.from("checkup_leads").select("id").eq("user_id", user.id)).data,
  ).toHaveLength(1);

  // analytics saw it
  expect(
    (
      await d
        .from("product_events")
        .select("id")
        .eq("user_id", user.id)
        .eq("event", "lead_created")
    ).data?.length,
  ).toBe(2);

  // ── the feature switch removes the page ────────────────────────────────────
  await d
    .from("platform_settings")
    .update({ feature_flags: { ...flagsOn, checkup_lead: false } })
    .eq("id", true);
  await expect
    .poll(async () => (await page.goto("/checkup-interest"))?.status(), {
      timeout: 60_000,
    })
    .toBe(404);
  await ctx.close();
});
