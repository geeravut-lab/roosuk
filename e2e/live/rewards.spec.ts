import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live rewards: an invite link remembers a code, consent attaches it, a friend
 * who has checked in enough days earns the inviter the admin's amount (once),
 * the person can use credit on a payment (spent when the transfer is reported,
 * returned if rejected, kept when paid), junk codes do nothing, and nobody can
 * write the wallet. Restores the settings it changes.
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
test.setTimeout(300_000);

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

const REWARD_COLUMNS = [
  "reward_referral_thb",
  "reward_referee_thb",
  "reward_challenge_thb",
  "redeem_max_subscription_thb",
  "redeem_max_other_thb",
  "referral_min_checkin_days",
  "referral_max_rewards",
  "challenge_max_rewards_per_month",
  "promptpay_id",
];

test.afterAll(async () => {
  const d = db();
  await removeAdminNoticesSince(d, startedAt);
  if (createdIds.length) {
    await d.from("user_subscriptions").delete().in("user_id", createdIds);
    await d.from("payments").delete().in("user_id", createdIds);
    await d.from("app_notifications").delete().in("user_id", createdIds);
    for (const id of createdIds) await d.auth.admin.deleteUser(id);
  }
  await d.from("platform_settings").update(original).eq("id", true);
});

const day = (offset: number) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const checkinRows = (id: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    user_id: id,
    checkin_date: day(-i),
    sleep_band: 3,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  }));
const balance = async (id: string) =>
  (
    (await db().from("reward_ledger").select("amount_thb").eq("user_id", id))
      .data ?? []
  ).reduce((n, r) => n + r.amount_thb, 0);

test("rewards: invite link → consent attaches → friend shows up → credit → pay with it", async ({
  page,
  browser,
}) => {
  const d = db();
  const snap = (
    await d
      .from("platform_settings")
      .select(REWARD_COLUMNS.join(","))
      .eq("id", true)
      .single()
  ).data as unknown as Record<string, unknown>;
  original = snap;
  expect(
    (
      await d
        .from("platform_settings")
        .update({
          reward_referral_thb: 10,
          reward_referee_thb: 0,
          redeem_max_subscription_thb: 10,
          redeem_max_other_thb: 20,
          referral_min_checkin_days: 3,
          referral_max_rewards: 20,
          promptpay_id: "0812345678",
        })
        .eq("id", true)
    ).error,
  ).toBeNull();
  await new Promise((r) => setTimeout(r, 1000));

  const a = await makeUser(); // the inviter
  const b = await makeUser(); // invited by a link
  const c = await makeUser(); // junk code
  const dd = await makeUser(); // types a code by hand
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();

  // ── the inviter: a code and a link ──
  await signInAndConsent(page, a.email, a.password);
  await page.goto("/rewards");
  await expect(
    page.getByRole("heading", { level: 1, name: "รางวัลของฉัน" }),
  ).toBeVisible();
  const code = ((await page.locator("p.tracking-widest").textContent()) ?? "")
    .replace(/.*:\s*/, "")
    .trim();
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
  await expect(page.getByText(new RegExp(`/r/${code}$`))).toBeVisible();
  await expect(page.getByText("฿0").first()).toBeVisible();
  await expect(page.getByText(/ไม่เกิน ฿10/).first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  expect(
    (await d.from("referral_codes").select("code").eq("user_id", a.id).single())
      .data?.code,
  ).toBe(code);

  // ── a friend opens the link, then signs in and gives consent ──
  const ctxB = await browser.newContext();
  const pb = await ctxB.newPage();
  const res = await pb.goto(`/r/${code.toLowerCase()}`);
  expect(res?.status()).toBe(200); // redirected to the front page
  await expect(pb).toHaveURL(/\/$/);
  const cookie = (await ctxB.cookies()).find((k) => k.name === "roosuk-ref");
  expect(cookie?.value).toBe(code);
  expect(cookie?.httpOnly).toBe(true);
  await signInAndConsent(pb, b.email, b.password);
  const link = (
    await d
      .from("referrals")
      .select("referrer_id, qualified_at")
      .eq("referee_id", b.id)
      .single()
  ).data!;
  expect(link).toEqual({ referrer_id: a.id, qualified_at: null });
  expect(
    (await ctxB.cookies()).find((k) => k.name === "roosuk-ref"),
  ).toBeUndefined(); // used once

  // not yet: no reward before the friend has shown up
  await pb.goto("/today");
  expect(await balance(a.id)).toBe(0);
  // after 3 check-in days, the next visit earns the inviter ฿10
  await d.from("daily_checkins").insert(checkinRows(b.id, 3));
  await pb.goto("/today");
  await expect.poll(() => balance(a.id)).toBe(10);
  await pb.goto("/today");
  expect(await balance(a.id)).toBe(10); // once
  await ctxB.close();

  // the inviter sees it, and was told
  await page.goto("/rewards");
  await expect(page.getByText("฿10").first()).toBeVisible();
  await expect(page.getByText("ชวนเพื่อนสำเร็จ")).toBeVisible();
  await expect(
    page.getByText("ชวนแล้ว 1 คน · ได้รางวัลแล้ว 1 คน"),
  ).toBeVisible();
  expect(
    (
      (
        await d
          .from("app_notifications")
          .select("title")
          .eq("user_id", a.id)
          .eq("kind", "reward_earned")
      ).data ?? []
    ).length,
  ).toBe(1);

  // ── junk: a bad code in the cookie and in the form attach nothing ──
  const ctxC = await browser.newContext();
  const pc = await ctxC.newPage();
  await pc.goto("/r/NOT-A-CODE!");
  expect(
    (await ctxC.cookies()).find((k) => k.name === "roosuk-ref"),
  ).toBeUndefined();
  await signInAndConsent(pc, c.email, c.password);
  expect(
    (
      (await d.from("referrals").select("referee_id").eq("referee_id", c.id))
        .data ?? []
    ).length,
  ).toBe(0);
  await pc.goto("/rewards");
  await pc.getByLabel("รหัสของเพื่อน").fill("ZZZZZZZ");
  await pc.getByRole("button", { name: "ใช้รหัส" }).click();
  await expect(
    pc.getByRole("alert").filter({ hasText: "รหัสไม่ถูกต้อง" }),
  ).toBeVisible();
  const mine = (
    await d.from("referral_codes").select("code").eq("user_id", c.id).single()
  ).data!.code;
  await pc.getByLabel("รหัสของเพื่อน").fill(mine);
  await pc.getByRole("button", { name: "ใช้รหัส" }).click();
  await expect(
    pc.getByRole("alert").filter({ hasText: "ใช้รหัสของตัวเองไม่ได้" }),
  ).toBeVisible();
  await ctxC.close();

  // ── typing a friend's code by hand works once ──
  const ctxD = await browser.newContext();
  const pd = await ctxD.newPage();
  await signInAndConsent(pd, dd.email, dd.password);
  await pd.goto("/rewards");
  await pd.getByLabel("รหัสของเพื่อน").fill(code);
  await pd.getByRole("button", { name: "ใช้รหัส" }).click();
  await expect(
    pd.getByRole("status").filter({ hasText: "ใช้รหัสแล้ว" }),
  ).toBeVisible();
  await expect(pd.getByLabel("รหัสของเพื่อน")).toHaveCount(0); // no second code
  await ctxD.close();

  // ── credit on a payment: priced now, spent when reported, returned if rejected, kept when paid ──
  await d.from("reward_ledger").insert({
    user_id: a.id,
    kind: "admin_adjust",
    amount_thb: 20,
    note: "e2e",
  }); // a has ฿30
  const price = Number(
    (
      await d
        .from("platform_settings")
        .select("price_gold_monthly")
        .eq("id", true)
        .single()
    ).data?.price_gold_monthly ?? 49,
  );
  await page.goto("/subscription");
  const gold = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: /Gold/ }) });
  await expect(gold.getByLabel(/ใช้เครดิตสะสม/)).toBeVisible();
  await expect(gold.getByText(/คุณมี ฿30/)).toBeVisible();
  await gold.getByLabel(/ใช้เครดิตสะสม/).check();
  await gold
    .getByRole("button", { name: new RegExp(`รายเดือน ฿${price}`) })
    .click();
  await expect(page).toHaveURL(/\/subscription\/pay\/[0-9a-f-]{36}/);
  const paymentId = page.url().split("/").pop()!;
  await expect(
    page.getByText(`฿${price - 10}`, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("ใช้เครดิตสะสมลดไปแล้ว ฿10")).toBeVisible();
  const draft = (
    await d
      .from("payments")
      .select("amount, credit_applied_thb, credit_consumed, status")
      .eq("id", paymentId)
      .single()
  ).data!;
  expect(draft).toEqual({
    amount: price - 10,
    credit_applied_thb: 10,
    credit_consumed: false,
    status: "draft",
  });
  expect(await balance(a.id)).toBe(30); // not spent yet

  await page.getByLabel("เลขอ้างอิงบนสลิป").fill("CREDIT-001");
  await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
  await expect(page.getByText("ได้รับแจ้งการโอนแล้ว")).toBeVisible();
  expect(await balance(a.id)).toBe(20); // spent once the transfer is reported
  expect(
    (
      await d
        .from("payments")
        .select("credit_consumed")
        .eq("id", paymentId)
        .single()
    ).data?.credit_consumed,
  ).toBe(true);

  const ctxAdmin = await browser.newContext();
  const ap = await ctxAdmin.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin/payments");
  const item = ap.locator("li").filter({ hasText: "CREDIT-001" });
  await expect(item).toContainText(`฿${price - 10}`);
  await expect(item).toContainText("ใช้เครดิตสะสม ฿10");
  await item.getByRole("button", { name: "ตรวจไม่พบการโอน" }).click();
  await expect
    .poll(
      async () =>
        (await d.from("payments").select("status").eq("id", paymentId).single())
          .data?.status,
    )
    .toBe("rejected");
  await expect.poll(() => balance(a.id)).toBe(30); // a rejected transfer gives the credit back

  await page.reload();
  await page.getByLabel("เลขอ้างอิงบนสลิป").fill("CREDIT-002");
  await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
  await expect(page.getByText("ได้รับแจ้งการโอนแล้ว")).toBeVisible();
  expect(await balance(a.id)).toBe(20); // spent again, once
  await ap.goto("/admin/payments");
  await ap
    .locator("li")
    .filter({ hasText: "CREDIT-002" })
    .getByRole("button", { name: "ยืนยันว่าได้รับเงิน" })
    .click();
  await expect
    .poll(
      async () =>
        (await d.from("payments").select("status").eq("id", paymentId).single())
          .data?.status,
    )
    .toBe("paid");
  expect(await balance(a.id)).toBe(20); // kept

  await page.goto("/rewards");
  await expect(
    page.getByText("ใช้เป็นส่วนลดค่าสมาชิก", { exact: true }),
  ).toHaveCount(2); // spent, returned, spent again
  await expect(page.getByText(/^คืนเครดิต/)).toHaveCount(1);

  // ── nobody can write the wallet or the settings ──
  const cl = createClient(url!, anonKey!, { auth: { persistSession: false } });
  expect(
    (await cl.auth.signInWithPassword({ email: a.email, password: a.password }))
      .error,
  ).toBeNull();
  expect(
    (
      await cl
        .from("reward_ledger")
        .insert({ user_id: a.id, kind: "admin_adjust", amount_thb: 999 })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await cl.rpc("redeem_credit", {
        p_user: a.id,
        p_amount: 1,
        p_kind: "redeem_subscription",
        p_ref: "x",
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await cl
        .from("platform_settings")
        .update({ reward_referral_thb: 1000 })
        .eq("id", true)
    ).data ?? null,
  ).toBeNull();
  expect(await balance(a.id)).toBe(20);
  await ctxAdmin.close();
});

test("admin rewards page: sets the amounts, refuses junk, and a normal user cannot open it", async ({
  page,
  browser,
}) => {
  const d = db();
  const user = await makeUser();
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();
  await signInAndConsent(page, user.email, user.password);
  expect([403, 404]).toContain((await page.goto("/admin/rewards"))?.status());

  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin");
  await ap.getByRole("link", { name: "รางวัลและเครดิต" }).click();
  await expect(ap).toHaveURL(/\/admin\/rewards$/);
  expect(await seriousViolations(ap)).toEqual([]);
  await ap
    .locator("main form")
    .first()
    .evaluate((f) => f.setAttribute("novalidate", ""));
  await ap.locator("#rw-referralThb").fill("-5");
  await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    ap.getByRole("alert").filter({ hasText: "ค่าที่กรอกไม่ถูกต้อง" }),
  ).toBeVisible();
  await ap.locator("#rw-referralThb").fill("12");
  await ap.locator("#rw-challengeThb").fill("15");
  await ap.locator("#rw-redeemMaxSubscriptionThb").fill("10");
  await ap.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    ap.getByRole("status").filter({ hasText: "บันทึกแล้ว" }),
  ).toBeVisible();
  const row = (
    await d
      .from("platform_settings")
      .select(
        "reward_referral_thb, reward_challenge_thb, redeem_max_subscription_thb",
      )
      .eq("id", true)
      .single()
  ).data;
  expect(row).toEqual({
    reward_referral_thb: 12,
    reward_challenge_thb: 15,
    redeem_max_subscription_thb: 10,
  });
  await ctx.close();
});
