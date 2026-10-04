import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live PromptPay flow against the REAL Supabase project (see auth-flow.spec.ts
 * for the rules). It creates its own users, deletes them AND the ledger rows
 * they produced (payments outlive accounts by design), and restores the
 * PromptPay id it changes.
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

async function seriousViolations(page: Page): Promise<string[]> {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return axe.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

let originalPromptpay: string | null = null;

test.afterAll(async () => {
  const d = db();
  await removeAdminNoticesSince(d, startedAt);
  if (createdIds.length) {
    await d.from("user_subscriptions").delete().in("user_id", createdIds);
    await d.from("payments").delete().in("user_id", createdIds);
    for (const id of createdIds) await d.auth.admin.deleteUser(id);
  }
  await d
    .from("platform_settings")
    .update({ promptpay_id: originalPromptpay })
    .eq("id", true);
});

test("PromptPay: order → report → rejected → report again → confirmed grants the plan", async ({
  page,
  browser,
  baseURL,
}) => {
  const d = db();
  originalPromptpay =
    (
      await d
        .from("platform_settings")
        .select("promptpay_id")
        .eq("id", true)
        .single()
    ).data?.promptpay_id ?? null;
  await d
    .from("platform_settings")
    .update({ promptpay_id: null })
    .eq("id", true);

  const payer = await makeUser();
  const adminUser = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: adminUser.id })).error,
  ).toBeNull();

  const adminCtx = await browser.newContext({ baseURL });
  const adminPage = await adminCtx.newPage();

  try {
    await signInAndConsent(page, payer.email, payer.password);
    await signInAndConsent(adminPage, adminUser.email, adminUser.password);

    // Payments are closed until the admin sets a PromptPay id.
    await page.goto("/subscription");
    const goldCard = () =>
      page
        .locator("li")
        .filter({ has: page.getByRole("heading", { name: "Gold" }) })
        .last();
    await goldCard().getByRole("button", { name: "รายเดือน ฿49" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "ยังไม่เปิดรับชำระเงิน" }),
    ).toBeVisible();

    // Admin: invalid id refused, valid id (with dashes) saved as digits only.
    await adminPage.goto("/admin/payments");
    const idField = adminPage.getByLabel("เลขพร้อมเพย์รับเงิน");
    await idField.fill("12345");
    await adminPage
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await expect(
      adminPage
        .getByRole("alert")
        .filter({ hasText: "เลขพร้อมเพย์ไม่ถูกต้อง" }),
    ).toBeVisible();
    await idField.fill("081-234-5678");
    await adminPage
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await expect(adminPage.getByText("บันทึกแล้ว")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await d
              .from("platform_settings")
              .select("promptpay_id")
              .eq("id", true)
              .single()
          ).data?.promptpay_id,
      )
      .toBe("0812345678");

    // Payer: order Gold monthly → QR carries the amount, row is a draft with the frozen id.
    await page.goto("/subscription");
    await goldCard().getByRole("button", { name: "รายเดือน ฿49" }).click();
    await expect(page).toHaveURL(/\/subscription\/pay\/[0-9a-f-]{36}/);
    const paymentId = page.url().split("/").pop()!;
    await expect(
      page.getByRole("img", { name: "QR PromptPay สำหรับโอน ฿49" }),
    ).toHaveAttribute("src", "https://promptpay.io/0812345678/49.00");
    const draft = (
      await d
        .from("payments")
        .select("status, amount, promptpay_id, plan_tier")
        .eq("id", paymentId)
        .single()
    ).data;
    expect(draft).toEqual({
      status: "draft",
      amount: 49,
      promptpay_id: "0812345678",
      plan_tier: "gold",
    });

    expect(await seriousViolations(page)).toEqual([]);

    // The reference is mandatory (checked on the server, not just by the browser).
    await page
      .locator("main form")
      .evaluate((f) => f.setAttribute("novalidate", ""));
    await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "กรุณากรอกเลขอ้างอิง" }),
    ).toBeVisible();

    // Reporting moves it to review — and does NOT grant anything.
    await page.getByLabel("เลขอ้างอิงบนสลิป").fill("SLIP-001");
    await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
    await expect(page.getByText("ได้รับแจ้งการโอนแล้ว")).toBeVisible();
    expect(
      (
        await d
          .from("payments")
          .select("status, payer_ref")
          .eq("id", paymentId)
          .single()
      ).data,
    ).toEqual({
      status: "review",
      payer_ref: "SLIP-001",
    });
    expect(
      (await d.from("profiles").select("plan_tier").eq("id", payer.id).single())
        .data?.plan_tier,
    ).toBe("free");

    // Admin: sees it with the reference, rejects with a note.
    await adminPage.goto("/admin/payments");
    const item = adminPage.locator("li").filter({ hasText: "SLIP-001" });
    await expect(item).toContainText("฿49");
    expect(await seriousViolations(adminPage)).toEqual([]);
    await item.getByLabel("หมายเหตุถึงผู้จ่าย").fill("ไม่พบยอดวันนี้");
    await item.getByRole("button", { name: "ตรวจไม่พบการโอน" }).click();
    await expect(
      adminPage
        .locator("li")
        .filter({ hasText: "SLIP-001" })
        .getByRole("button", { name: "ตรวจไม่พบการโอน" }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (
            await d
              .from("payments")
              .select("status")
              .eq("id", paymentId)
              .single()
          ).data?.status,
      )
      .toBe("rejected");

    // Payer: sees the reason and can report again with a new reference.
    await page.reload();
    await expect(page.getByText("ตรวจไม่พบการโอน").first()).toBeVisible();
    await expect(page.getByText("ไม่พบยอดวันนี้")).toBeVisible();
    await page.getByLabel("เลขอ้างอิงบนสลิป").fill("SLIP-002");
    await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
    await expect(page.getByText("ได้รับแจ้งการโอนแล้ว")).toBeVisible();

    // Admin confirms → paid, ledger row, plan granted for about a month.
    await adminPage.goto("/admin/payments");
    await adminPage
      .locator("li")
      .filter({ hasText: "SLIP-002" })
      .getByRole("button", { name: "ยืนยันว่าได้รับเงิน" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await d
              .from("payments")
              .select("status")
              .eq("id", paymentId)
              .single()
          ).data?.status,
      )
      .toBe("paid");

    const prof = (
      await d
        .from("profiles")
        .select("plan_tier, plan_expires_at")
        .eq("id", payer.id)
        .single()
    ).data!;
    expect(prof.plan_tier).toBe("gold");
    const days =
      (new Date(prof.plan_expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    const subs = (
      await d
        .from("user_subscriptions")
        .select("payment_id, plan_tier")
        .eq("user_id", payer.id)
    ).data;
    expect(subs).toEqual([{ payment_id: paymentId, plan_tier: "gold" }]);

    await page.reload();
    await expect(page.getByText("ชำระเงินเรียบร้อย")).toBeVisible();
    await page.goto("/subscription");
    await expect(page.getByText(/ใช้งานได้ถึง/)).toBeVisible();

    // A user can neither read another user's payment page nor write payments with their own JWT.
    const other = await makeUser();
    const c = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect((await c.auth.signInWithPassword(other)).error).toBeNull();
    expect(
      (await c.from("payments").select("id").eq("id", paymentId)).data,
    ).toEqual([]);
    expect(
      (
        await c
          .from("payments")
          .update({ status: "paid" })
          .eq("id", paymentId)
          .select("id")
      ).data ?? [],
    ).toHaveLength(0);
    expect(
      (
        await c.rpc("confirm_payment", {
          p_payment: paymentId,
          p_admin: other.id,
        })
      ).error,
    ).not.toBeNull();
  } finally {
    await adminCtx.close();
  }
});
