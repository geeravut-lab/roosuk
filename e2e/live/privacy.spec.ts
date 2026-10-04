import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { OWNED_TABLES } from "../../src/config/user-data";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live PDPA rights against the REAL Supabase project (see auth-flow.spec.ts for
 * the rules): the data export (complete, mine only, no other person's id), the
 * optional-consent change (appends history), and account deletion (typed phrase
 * checked on the server too, everything erased, money detached not dropped).
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

async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

/** Give a user a little data in every kind of table. */
async function seed(d: SupabaseClient, userId: string, tag: string) {
  const ok = async (
    p: PromiseLike<{ error: { message: string } | null }>,
    what: string,
  ) => {
    const { error } = await p;
    expect(error, what).toBeNull();
  };
  const items = [
    {
      name: "FBS",
      marker_key: "fasting_glucose",
      value: 104,
      unit: "mg/dL",
      value_std: 104,
      status: "watch",
      printed_range: "",
      confidence: 1,
    },
  ];
  await ok(
    d.from("health_profiles").insert({
      user_id: userId,
      birth_year: 1985,
      sex: "female",
      conditions: ["thyroid"],
    }),
    "profile",
  );
  await ok(
    d.from("daily_checkins").insert(
      [0, 1].map((o) => ({
        user_id: userId,
        checkin_date: new Date(Date.now() + 7 * 3_600_000 - o * 86_400_000)
          .toISOString()
          .slice(0, 10),
        sleep_band: 3,
        activity_band: 3,
        energy: 4,
        mood: 4,
        nutrition: 4,
      })),
    ),
    "checkins",
  );
  await ok(
    d.from("action_completions").insert({
      user_id: userId,
      action_date: new Date(Date.now() + 7 * 3_600_000)
        .toISOString()
        .slice(0, 10),
      action_key: "move_walk",
    }),
    "actions",
  );
  await ok(
    d.from("meal_logs").insert({
      user_id: userId,
      meal_date: "2026-10-10",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      items: [{ name: `meal-${tag}` }],
      kcal: 500,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
    }),
    "meal",
  );
  const rep = await d
    .from("lab_reports")
    .insert({
      user_id: userId,
      status: "confirmed",
      collected_on: "2026-09-01",
      confirmed_at: new Date().toISOString(),
      items,
    })
    .select("id");
  await ok(Promise.resolve({ error: rep.error }), "lab report");
  await ok(
    d.from("lab_results").insert({
      user_id: userId,
      report_id: rep.data![0].id,
      marker_key: "fasting_glucose",
      name: "FBS",
      value: 104,
      unit: "mg/dL",
      value_std: 104,
      status: "watch",
      collected_on: "2026-09-01",
    }),
    "lab result",
  );
  await ok(
    d.from("quiz_results").insert({
      user_id: userId,
      answers: { tag },
      score: 70,
      chrono_age: 41,
      delta_years: -1,
      levers: [],
      plan: [1, 2, 3, 4, 5, 6, 7],
      plan_source: "template",
    }),
    "quiz",
  );
  const conv = await d
    .from("ai_conversations")
    .insert({ user_id: userId, kind: "chat" })
    .select("id");
  await ok(Promise.resolve({ error: conv.error }), "conversation");
  await ok(
    d.from("ai_messages").insert([
      {
        conversation_id: conv.data![0].id,
        user_id: userId,
        role: "user",
        content: `question-${tag}`,
      },
      {
        conversation_id: conv.data![0].id,
        user_id: userId,
        role: "assistant",
        content: "answer",
      },
    ]),
    "messages",
  );
  await ok(
    d.from("ai_usage").insert({
      user_id: userId,
      feature: "aiChat",
      period_start: "2026-10-01",
      used: 2,
    }),
    "usage",
  );
  await ok(
    d
      .from("app_notifications")
      .insert({ user_id: userId, kind: "x", title: `note-${tag}` }),
    "notification",
  );
  await ok(d.from("notification_prefs").insert({ user_id: userId }), "prefs");
  await ok(
    d
      .from("notification_queue")
      .insert({ user_id: userId, title: `queued-${tag}` }),
    "queue",
  );
  await ok(
    d.from("line_links").insert({
      user_id: userId,
      line_sub: `U${randomBytes(8).toString("hex")}`,
    }),
    "line link",
  );
  const pay = await d
    .from("payments")
    .insert({
      user_id: userId,
      plan_tier: "gold",
      period: "monthly",
      amount: 49,
      promptpay_id: "0812345678",
      status: "paid",
      payer_ref: `ref-${tag}`,
      paid_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    })
    .select("id");
  await ok(Promise.resolve({ error: pay.error }), "payment");
  await ok(
    d.from("user_subscriptions").insert({
      user_id: userId,
      payment_id: pay.data![0].id,
      plan_tier: "gold",
      period: "monthly",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
    }),
    "subscription",
  );
}

async function count(
  d: SupabaseClient,
  table: string,
  column: string,
  id: string,
) {
  return (
    (
      await d
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, id)
    ).count ?? 0
  );
}

test.afterAll(async () => {
  const d = db();
  for (const id of createdIds) {
    await d.from("user_subscriptions").delete().eq("user_id", id);
    await d.from("payments").delete().eq("user_id", id);
    await d.auth.admin.deleteUser(id);
  }
  // the deleted user's money rows are detached by design: clean up the test's own
  await d
    .from("payments")
    .delete()
    .is("user_id", null)
    .like("payer_ref", "ref-privacy%");
  await d
    .from("privacy_audit_log")
    .delete()
    .is("user_id", null)
    .like("detail", "erased%")
    .eq("action", "account_deleted");
});

test("export is complete and mine only; optional consent appends; deletion erases and detaches", async ({
  page,
}) => {
  const d = db();
  const me = await makeUser();
  const other = await makeUser();
  await seed(d, me.id, "privacy-me");
  await seed(d, other.id, "privacy-other");
  await signInAndConsent(page, me.email, me.password);

  // ── the cards ──────────────────────────────────────────────────────────────
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "สิทธิของคุณตามกฎหมาย" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ที่เก็บข้อมูลของคุณ" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "พื้นที่อันตราย" }),
  ).toBeVisible();
  await expect(page.getByText("ap-southeast-1").first()).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // ── export ─────────────────────────────────────────────────────────────────
  const expected: Record<string, number> = {};
  for (const t of OWNED_TABLES)
    expected[t.table] = await count(d, t.table, t.column, me.id);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /ดาวน์โหลดข้อมูลของฉัน/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^roosuk-my-data-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const text = readFileSync(await file.path(), "utf8");
  const doc = JSON.parse(text);
  expect(doc.account.id).toBe(me.id);
  expect(doc.account.email).toBeNull(); // a made-up LINE-style address is not the user's data
  expect(doc.manifest.skipped).toEqual({});
  for (const t of OWNED_TABLES) {
    expect(doc.tables[t.table], t.table).toHaveLength(expected[t.table]);
    expect(doc.manifest.tables[t.table], t.table).toBe(expected[t.table]);
  }
  // every kind of data is there, and only mine
  for (const needle of [
    "privacy-me",
    "question-privacy-me",
    "note-privacy-me",
    "queued-privacy-me",
    "ref-privacy-me",
  ])
    expect(text).toContain(needle);
  expect(text).not.toContain(other.id);
  expect(text).not.toContain("privacy-other");
  expect(text).not.toContain("reviewed_by");
  expect(doc.notIncluded.length).toBeGreaterThan(0);
  await expect(page.getByText(/ดาวน์โหลดแล้ว \(\d+ รายการ\)/)).toBeVisible();
  // the export itself was audited
  expect(await count(d, "privacy_audit_log", "user_id", me.id)).toBe(1);
  expect(
    (await d.from("privacy_audit_log").select("action").eq("user_id", me.id))
      .data,
  ).toEqual([{ action: "data_export" }]);

  // ── optional consent: history grows, required items stay ───────────────────
  const before = (
    await d.from("consent_records").select("id").eq("user_id", me.id)
  ).data!.length;
  await page.getByLabel(/ฉันยินยอมให้เก็บรูปอาหาร/).check();
  await page.getByRole("button", { name: "บันทึกการเปลี่ยนแปลง" }).click();
  await expect(page.getByText(/บันทึกความยินยอมแล้ว/)).toBeVisible();
  const consents = (
    await d
      .from("consent_records")
      .select("items, accepted_at")
      .eq("user_id", me.id)
      .order("accepted_at", { ascending: false })
  ).data!;
  expect(consents).toHaveLength(before + 1);
  expect(consents[0].items.photos).toBe(true);
  expect(consents[0].items.sensitive_health_data).toBe(true);
  expect(consents[1].items.photos).toBe(false); // the old record is kept
  expect(await count(d, "privacy_audit_log", "user_id", me.id)).toBe(2);

  // ── deletion: the preview is honest, the phrase is required, the server checks it too ──
  await page.getByRole("button", { name: "ลบบัญชีและข้อมูลทั้งหมด" }).click();
  await expect(
    page.getByText(/ข้อมูลของคุณ \d+ รายการจะถูกลบถาวร/),
  ).toBeVisible();
  await expect(
    page.getByText(/รายการชำระเงินและบันทึกการใช้สิทธิ \d+ รายการจะถูกเก็บไว้/),
  ).toBeVisible();
  const confirm = page.getByRole("button", { name: "ลบบัญชีถาวร" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/พิมพ์ “ลบบัญชี” เพื่อยืนยัน/).fill("ลบ");
  await expect(confirm).toBeDisabled();
  // bypass the disabled button: the server must refuse a wrong phrase on its own
  await confirm.evaluate((b: HTMLButtonElement) =>
    b.removeAttribute("disabled"),
  );
  await confirm.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "พิมพ์คำยืนยันให้ถูกต้อง" }),
  ).toBeVisible();
  expect((await d.auth.admin.getUserById(me.id)).data.user).not.toBeNull();
  expect(await count(d, "daily_checkins", "user_id", me.id)).toBe(2);

  const paymentsBefore = await count(d, "payments", "user_id", me.id);
  expect(paymentsBefore).toBe(1);
  await page.getByLabel(/พิมพ์ “ลบบัญชี” เพื่อยืนยัน/).fill("ลบบัญชี");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/\/\?deleted=1/, { timeout: 60_000 });
  await expect(
    page.getByText("ลบบัญชีและข้อมูลของคุณเรียบร้อยแล้ว"),
  ).toBeVisible();

  // gone: the account and every erased table
  expect((await d.auth.admin.getUserById(me.id)).data.user).toBeNull();
  for (const t of OWNED_TABLES.filter((x) => x.onDelete === "erased"))
    expect(await count(d, t.table, t.column, me.id), t.table).toBe(0);
  // kept, detached from the person
  const money = (
    await d
      .from("payments")
      .select("user_id, amount, payer_ref")
      .like("payer_ref", "ref-privacy-me")
  ).data!;
  expect(money).toEqual([
    { user_id: null, amount: 49, payer_ref: "ref-privacy-me" },
  ]);
  expect(
    (
      await d
        .from("user_subscriptions")
        .select("id")
        .is("user_id", null)
        .not("payment_id", "is", null)
    ).data!.length,
  ).toBeGreaterThan(0);
  const audit = (
    await d
      .from("privacy_audit_log")
      .select("user_id, action, detail, meta")
      .is("user_id", null)
      .eq("action", "account_deleted")
      .order("created_at", { ascending: false })
      .limit(1)
  ).data![0];
  expect(audit.detail).toMatch(/^erased \d+ rows, retained 4 detached rows$/);
  expect(audit.meta.counts.daily_checkins).toBe(2);
  expect(JSON.stringify(audit)).not.toContain("privacy-me"); // counts only, never content

  // the other person is untouched
  expect(await count(d, "daily_checkins", "user_id", other.id)).toBe(2);
  expect(await count(d, "payments", "user_id", other.id)).toBe(1);

  // and the deleted account can no longer sign in
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(me.email);
  await page.getByLabel("รหัสผ่าน").fill(me.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  );
});
