import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live notifications against the REAL Supabase project (see auth-flow.spec.ts for
 * the rules): the in-app inbox and bell, the LINE queue (written, never sent from
 * a request), the user's switches, the scheduled tick's security, reminder rule
 * and dedupe, and the admin rules page. LINE itself is never called: no token is
 * set in this suite. The tick steps need CRON_SECRET in the environment.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

const expect = baseExpect.configure({ timeout: 30_000 });

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
test.setTimeout(240_000);

const db = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdIds: string[] = [];
let originalRules: { key: string; enabled: boolean; params: unknown }[] = [];
let originalPromptpay: string | null = null;

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
  await removeAdminNoticesSince(d, startedAt);
  for (const r of originalRules)
    await d
      .from("automation_rules")
      .update({ enabled: r.enabled, params: r.params })
      .eq("key", r.key);
  await d
    .from("platform_settings")
    .update({ promptpay_id: originalPromptpay })
    .eq("id", true);
  for (const id of createdIds) {
    await d.from("user_subscriptions").delete().eq("user_id", id);
    await d.from("payments").delete().eq("user_id", id);
    await d.auth.admin.deleteUser(id);
  }
});

test("inbox + LINE queue from a payment, user switches, tick security and reminder rule, admin rules", async ({
  page,
  browser,
  baseURL,
}) => {
  const d = db();
  originalRules =
    (await d.from("automation_rules").select("key, enabled, params")).data ??
    [];
  originalPromptpay =
    (
      await d
        .from("platform_settings")
        .select("promptpay_id")
        .eq("id", true)
        .single()
    ).data?.promptpay_id ?? null;
  // Keep other people's data out of this test: only the reminder rule stays on.
  await d
    .from("automation_rules")
    .update({ enabled: false })
    .in("key", ["trial_ending", "plan_expiring"]);
  await d
    .from("platform_settings")
    .update({ promptpay_id: "0812345678" })
    .eq("id", true);

  const payer = await makeUser();
  const adminUser = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: adminUser.id })).error,
  ).toBeNull();
  // The payer has linked LINE (a fake id: LINE is never called here).
  expect(
    (
      await d.from("line_links").insert({
        user_id: payer.id,
        line_sub: `U${randomBytes(8).toString("hex")}`,
        display_name: "E2E",
      })
    ).error,
  ).toBeNull();

  const adminCtx = await browser.newContext({ baseURL });
  const ap = await adminCtx.newPage();
  try {
    await signInAndConsent(page, payer.email, payer.password);
    await signInAndConsent(ap, adminUser.email, adminUser.password);

    // ── the payer reports a transfer → every admin is told ───────────────────
    await page.goto("/subscription");
    await page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Gold" }) })
      .last()
      .getByRole("button", { name: "รายเดือน ฿49" })
      .click();
    await expect(page).toHaveURL(/\/subscription\/pay\/[0-9a-f-]{36}/);
    const paymentId = page.url().split("/").pop()!;
    await page.getByLabel("เลขอ้างอิงบนสลิป").fill("NOTIF-1");
    await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
    await expect(page.getByText("ได้รับแจ้งการโอนแล้ว")).toBeVisible();

    await expect
      .poll(
        async () =>
          (
            await d
              .from("app_notifications")
              .select("kind, href")
              .eq("user_id", adminUser.id)
          ).data?.length,
      )
      .toBe(1);
    const adminNotice = (
      await d
        .from("app_notifications")
        .select("kind, href, title, body")
        .eq("user_id", adminUser.id)
    ).data![0];
    expect(adminNotice).toMatchObject({
      kind: "payment_review",
      href: "/admin/payments",
    });
    expect(adminNotice.body).toContain("NOTIF-1");
    // the admin is not LINE-linked, so nothing is queued for them
    expect(
      (
        await d
          .from("notification_queue")
          .select("id")
          .eq("user_id", adminUser.id)
      ).data,
    ).toEqual([]);

    // bell with a count, the inbox page, then "mark all read"
    await ap.goto("/admin/payments");
    await expect(
      ap.getByRole("link", { name: /แจ้งเตือน: มี 1 รายการที่ยังไม่ได้อ่าน/ }),
    ).toBeVisible();
    await ap.getByRole("link", { name: /แจ้งเตือน: มี 1/ }).click();
    await expect(
      ap.getByRole("heading", { level: 1, name: "การแจ้งเตือน" }),
    ).toBeVisible();
    await expect(ap.getByText("มีรายการรอตรวจสลิป")).toBeVisible();
    await expect(ap.getByText("NOTIF-1")).toBeVisible();
    expect(await serious(ap)).toEqual([]);
    await ap
      .getByRole("button", { name: "ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว" })
      .click();
    await expect(
      ap.getByRole("button", { name: "ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว" }),
    ).toHaveCount(0);
    await expect(ap.getByRole("link", { name: /แจ้งเตือน: มี/ })).toHaveCount(
      0,
    );

    // ── admin confirms → the payer gets an inbox row AND an urgent LINE queue row (text copied) ──
    await ap.goto("/admin/payments");
    await ap
      .locator("li")
      .filter({ hasText: "NOTIF-1" })
      .getByRole("button", { name: "ยืนยันว่าได้รับเงิน" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await d
              .from("notification_queue")
              .select("id")
              .eq("user_id", payer.id)
          ).data?.length,
      )
      .toBe(1);
    const q = (
      await d.from("notification_queue").select("*").eq("user_id", payer.id)
    ).data![0];
    expect(q).toMatchObject({
      status: "queued",
      urgent: true,
      channel: "line",
      dedupe_key: `payment:${paymentId}:paid`,
      href: `/subscription/pay/${paymentId}`,
      attempts: 0,
    });
    expect(q.title).toBe("ชำระเงินเรียบร้อย");
    expect(q.body).toContain("Gold");
    const inbox = (
      await d
        .from("app_notifications")
        .select("kind, title")
        .eq("user_id", payer.id)
    ).data!;
    expect(inbox).toEqual([
      { kind: "payment_paid", title: "ชำระเงินเรียบร้อย" },
    ]);

    // The payer sees it, and it survives the inbox row being deleted (the queue holds its own copy).
    await page.goto("/notifications");
    await expect(page.getByText("ชำระเงินเรียบร้อย").first()).toBeVisible();
    await d.from("app_notifications").delete().eq("user_id", payer.id);
    expect(
      (
        await d
          .from("notification_queue")
          .select("title, notification_id")
          .eq("user_id", payer.id)
      ).data,
    ).toEqual([{ title: "ชำระเงินเรียบร้อย", notification_id: null }]);

    // ── RLS with a real JWT ──────────────────────────────────────────────────
    const c = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect((await c.auth.signInWithPassword(payer)).error).toBeNull();
    expect(
      (await c.from("notification_queue").select("id")).error,
    ).not.toBeNull();
    expect(
      (await c.from("automation_rules").select("key")).error,
    ).not.toBeNull();
    expect(
      (await c.from("notification_settings").select("id")).error,
    ).not.toBeNull();
    expect(
      (
        await c
          .from("app_notifications")
          .insert({ user_id: payer.id, kind: "x", title: "forged" })
      ).error,
    ).not.toBeNull();

    // ── the user's own switches (Settings) ───────────────────────────────────
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "การแจ้งเตือนทาง LINE" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("ผลการชำระเงินและแพ็กเกจใกล้หมด"),
    ).toBeChecked();
    await expect(page.getByLabel(/เตือนเช็กอินรายวัน/)).not.toBeChecked(); // reminders are opt-in
    expect(await serious(page)).toEqual([]);
    await page.getByLabel(/เตือนเช็กอินรายวัน/).check();
    await page
      .getByRole("button", { name: "บันทึก", exact: true })
      .first()
      .click();
    await expect(page.getByText("บันทึกการตั้งค่าแล้ว")).toBeVisible();
    expect(
      (
        await d
          .from("notification_prefs")
          .select("line_transactional, line_reminders")
          .eq("user_id", payer.id)
      ).data,
    ).toEqual([{ line_transactional: true, line_reminders: true }]);

    // ── the scheduled tick ───────────────────────────────────────────────────
    // closed to the public
    const noAuth = await page.request.post("/api/cron/notify");
    expect([401, 503]).toContain(noAuth.status());
    const wrong = await page.request.post("/api/cron/notify", {
      headers: { Authorization: "Bearer not-the-secret" },
    });
    expect([401, 503]).toContain(wrong.status());

    if (cronSecret) {
      expect(noAuth.status()).toBe(401);
      expect(wrong.status()).toBe(401);
      const tick = () =>
        page.request.post("/api/cron/notify", {
          headers: { Authorization: `Bearer ${cronSecret}` },
        });

      // admin: make the reminder fire at any hour, via the admin rules page
      await ap.goto("/admin/rules");
      await expect(
        ap.getByRole("heading", { level: 1, name: "กฎอัตโนมัติและ LINE" }),
      ).toBeVisible();
      expect(await serious(ap)).toEqual([]);
      const rule = ap.locator("li").filter({ hasText: "checkin_reminder" });
      await rule.getByLabel("ชั่วโมงเวลาไทย (0–23)").fill("0");
      await rule.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await d
                .from("automation_rules")
                .select("params")
                .eq("key", "checkin_reminder")
                .single()
            ).data?.params,
        )
        .toMatchObject({ hour: 0 });

      const r1 = await tick();
      expect(r1.status()).toBe(200);
      const j1 = await r1.json();
      expect(j1.ok).toBe(true);
      expect(j1.rules.checkin_reminder).toBeGreaterThanOrEqual(1);
      expect(j1.rules.trial_ending).toBe(-1); // switched off ≠ "found nothing"
      const reminders = (
        await d
          .from("notification_queue")
          .select("dedupe_key, urgent, status")
          .eq("user_id", payer.id)
          .like("dedupe_key", "checkin:%")
      ).data!;
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({ urgent: false, status: "queued" });

      // a second tick the same day writes nothing new (one reminder per day)
      await tick();
      expect(
        (
          await d
            .from("notification_queue")
            .select("id")
            .eq("user_id", payer.id)
            .like("dedupe_key", "checkin:%")
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await d
            .from("app_notifications")
            .select("id")
            .eq("user_id", payer.id)
            .eq("kind", "checkin_reminder")
        ).data,
      ).toHaveLength(1);

      // once the user has checked in, no reminder is queued for a new day's key
      await d.from("daily_checkins").insert({
        user_id: payer.id,
        checkin_date: new Date(Date.now() + 7 * 3_600_000)
          .toISOString()
          .slice(0, 10),
        sleep_band: 3,
        activity_band: 3,
        energy: 4,
        mood: 4,
        nutrition: 4,
      });
      await d
        .from("notification_queue")
        .delete()
        .eq("user_id", payer.id)
        .like("dedupe_key", "checkin:%");
      await d
        .from("app_notifications")
        .delete()
        .eq("user_id", payer.id)
        .eq("kind", "checkin_reminder");
      await tick();
      expect(
        (
          await d
            .from("notification_queue")
            .select("id")
            .eq("user_id", payer.id)
            .like("dedupe_key", "checkin:%")
        ).data,
      ).toEqual([]);

      // the tick left a record, and without a LINE token nothing is sent
      const ticks = (
        await d
          .from("cron_ticks")
          .select("summary, finished_at")
          .order("started_at", { ascending: false })
          .limit(3)
      ).data!;
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks[0].finished_at).not.toBeNull();
      if (!process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
        expect(j1.line.stopped).toBe("no_token");
        expect(
          (
            await d
              .from("notification_queue")
              .select("status")
              .eq("user_id", payer.id)
          ).data!.every((r) => r.status === "queued"),
        ).toBe(true);
      }

      // admin switches the rule off → the next tick reports -1 and queues nothing
      await ap.goto("/admin/rules");
      const rule2 = ap.locator("li").filter({ hasText: "checkin_reminder" });
      await rule2.getByLabel("เปิดใช้งาน").uncheck();
      await rule2.getByRole("button", { name: "บันทึก", exact: true }).click();
      await expect
        .poll(
          async () =>
            (
              await d
                .from("automation_rules")
                .select("enabled")
                .eq("key", "checkin_reminder")
                .single()
            ).data?.enabled,
        )
        .toBe(false);
      const j3 = await (await tick()).json();
      expect(j3.rules.checkin_reminder).toBe(-1);
    }

    // a non-admin cannot open the rules page
    expect((await page.goto("/admin/rules"))?.status()).toBe(404);
  } finally {
    await adminCtx.close();
  }
});
