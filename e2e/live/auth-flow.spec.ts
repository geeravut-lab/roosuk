import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live end-to-end test against the REAL Supabase project (dev == prod until
 * launch). Opt in with E2E_LIVE=1. It creates its own throw-away users and
 * deletes them afterwards (rows cascade), and restores any flag it toggles.
 * Never run it against a project that holds real users' data.
 */
// Every step crosses the network to Supabase (and the sandbox proxy): wait longer than the 5 s default.
const expect = baseExpect.configure({ timeout: 20_000 });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

test.skip(
  !enabled,
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
// The suite mutates shared state (one platform_settings row), so run it in a single project only.
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });

const admin = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Reuse the LINE synthetic domain on purpose: it proves Supabase accepts such addresses.
const newEmail = () =>
  lineSyntheticEmail(`e2e${Date.now()}${randomBytes(3).toString("hex")}`);
const newPassword = () => `Pw-${randomBytes(9).toString("hex")}`;

const createdIds: string[] = [];

async function makeUser(): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const email = newEmail();
  const password = newPassword();
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error("createUser returned no user");
  createdIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
}

async function acceptConsent(page: Page) {
  await expect(page).toHaveURL(/\/consent/);
  for (const box of await page
    .locator('input[type="checkbox"][required]')
    .all())
    await box.check();
  await page.getByRole("button", { name: "ยืนยันและเริ่มใช้งาน" }).click();
  // the redirect after consent must land before the test navigates elsewhere
  await expect(page).not.toHaveURL(/\/consent/);
}

test.afterAll(async () => {
  for (const id of createdIds) await admin().auth.admin.deleteUser(id);
  // Everything the users owned must have cascaded away.
  if (createdIds.length) {
    const { data } = await admin()
      .from("consent_records")
      .select("id")
      .in("user_id", createdIds);
    expect(data ?? []).toHaveLength(0);
  }
});

test("a new user signs in, must consent, reaches the app, and can sign out", async ({
  page,
}) => {
  const user = await makeUser();

  // wrong password is rejected with a readable message
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(user.email);
  await page.getByLabel("รหัสผ่าน").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  );
  // the error does not wipe the form: the e-mail is still there to correct the password
  await expect(page.getByLabel("อีเมล")).toHaveValue(user.email);

  await signIn(page, user.email, user.password);

  // no consent yet → forced to /consent, and the app is out of reach until then
  await expect(page).toHaveURL(/\/consent/);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/consent/);

  // required items cannot be skipped (server-side check, not just the browser's `required`)
  await page.locator("form").evaluate((f) => f.setAttribute("novalidate", ""));
  await page.getByRole("button", { name: "ยืนยันและเริ่มใช้งาน" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "กรุณายอมรับข้อที่จำเป็นทั้งหมด",
  );

  await acceptConsent(page);
  await expect(page).toHaveURL(/\/today/);
  await expect(
    page.getByRole("heading", { level: 1, name: "วันนี้" }),
  ).toBeVisible();

  // consent was stored item by item with a server timestamp
  const { data: consent } = await admin()
    .from("consent_records")
    .select("policy_version, items, accepted_at")
    .eq("user_id", user.id);
  expect(consent).toHaveLength(1);
  expect(consent![0].items.sensitive_health_data).toBe(true);
  expect(consent![0].items.marketing).toBe(false);
  expect(
    Math.abs(Date.now() - new Date(consent![0].accepted_at).getTime()),
  ).toBeLessThan(120_000);

  // settings shows what was agreed
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "ความยินยอมที่ให้ไว้" }),
  ).toBeVisible();

  // a non-admin gets a 404 for admin pages — they should not learn the page exists
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);

  // sign out → protected pages bounce to /auth again
  await page.goto("/settings");
  await page.getByRole("button", { name: "ออกจากระบบ" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/auth/);
});

test("sign-up creates the account and profile and goes straight to consent", async ({
  page,
}) => {
  const email = newEmail();
  const password = newPassword();
  await page.goto("/auth?mode=signup");
  await page.getByLabel("ชื่อที่ใช้แสดง (ไม่บังคับ)").fill("ผู้ทดสอบ E2E");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await expect(page).toHaveURL(/\/consent/);

  const { data: users } = await admin().auth.admin.listUsers({ perPage: 200 });
  const created = users?.users.find((u) => u.email === email);
  expect(created).toBeTruthy();
  createdIds.push(created!.id);

  const { data: profile } = await admin()
    .from("profiles")
    .select("display_name, language")
    .eq("id", created!.id)
    .single();
  expect(profile).toEqual({ display_name: "ผู้ทดสอบ E2E", language: "th" });

  // too-short password is refused
  await page.context().clearCookies();
  await page.goto("/auth?mode=signup");
  await page.getByLabel("อีเมล").fill(newEmail());
  await page.getByLabel("รหัสผ่าน").fill("short");
  await page
    .locator("form")
    .first()
    .evaluate((f) => f.setAttribute("novalidate", ""));
  await page.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "รหัสผ่านง่ายเกินไป",
  );

  // signing up again with the same address is refused
  await page.goto("/auth?mode=signup");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(newPassword());
  await page.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "อีเมลนี้มีบัญชีอยู่แล้ว",
  );
});

test("row-level security holds with real JWTs", async () => {
  const [a, b] = [await makeUser(), await makeUser()];
  const client = async (u: { email: string; password: string }) => {
    const c = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword(u);
    if (error) throw error;
    return c;
  };
  const ca = await client(a);

  const own = await ca.from("profiles").select("id");
  expect(own.data?.map((r) => r.id)).toEqual([a.id]); // sees only itself, not b

  const forged = await ca
    .from("consent_records")
    .insert({ user_id: b.id, policy_version: "x", items: {} });
  expect(forged.error).not.toBeNull();

  const promote = await ca.from("admins").insert({ user_id: a.id });
  expect(promote.error).not.toBeNull();

  const flags = await ca
    .from("platform_settings")
    .update({ feature_flags: { voice: false } })
    .eq("id", true)
    .select("id");
  expect(flags.data ?? []).toHaveLength(0); // no policy/grant → nothing written

  const lang = await ca
    .from("profiles")
    .update({ language: "en" })
    .eq("id", a.id)
    .select("language");
  expect(lang.data).toEqual([{ language: "en" }]);

  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false },
  });
  expect((await anon.from("profiles").select("id")).error).not.toBeNull();
  expect(
    (await anon.from("platform_settings").select("id")).error,
  ).not.toBeNull();
});

test("an admin can open the admin area and switch a feature off and on", async ({
  page,
}) => {
  const user = await makeUser();
  const db = admin();
  const { error } = await db.from("admins").insert({ user_id: user.id });
  expect(error).toBeNull();

  const readFlags = async () =>
    (
      await db
        .from("platform_settings")
        .select("feature_flags")
        .eq("id", true)
        .single()
    ).data!.feature_flags;
  const original = await readFlags();
  // Start from a known state (voice ON) whatever a previous run left behind.
  const withoutVoice: Record<string, unknown> = { ...original };
  delete withoutVoice.voice;
  await db
    .from("platform_settings")
    .update({ feature_flags: withoutVoice })
    .eq("id", true);

  try {
    await signIn(page, user.email, user.password);
    await acceptConsent(page);
    await expect(page).toHaveURL(/\/today/);

    await page.goto("/admin/flags");
    await expect(
      page.getByRole("heading", { level: 1, name: "สวิตช์ฟีเจอร์" }),
    ).toBeVisible();
    const row = page.locator("li").filter({ hasText: "สั่งงานด้วยเสียง" });

    // Thai "เปิดอยู่" (on) contains "ปิดอยู่" (off) as a substring, so match the status text exactly.
    await row.getByRole("button", { name: "ปิด", exact: true }).click();
    await expect(row.getByText("ปิดอยู่", { exact: true })).toBeVisible();
    await expect.poll(readFlags).toMatchObject({ voice: false });

    await row.getByRole("button", { name: "เปิด", exact: true }).click();
    await expect(row.getByText("เปิดอยู่", { exact: true })).toBeVisible();
    await expect.poll(async () => (await readFlags()).voice).toBeUndefined(); // ON deletes the key
  } finally {
    // Let any in-flight server action land first, otherwise it could overwrite this restore.
    await page.waitForLoadState("networkidle").catch(() => {});
    await db
      .from("platform_settings")
      .update({ feature_flags: original })
      .eq("id", true);
  }
});

test("the Premium trial starts on consent and the plan page reflects plan and usage", async ({
  page,
}) => {
  const user = await makeUser();
  const db = admin();

  const before = (
    await db
      .from("profiles")
      .select("trial_started_at, trial_ends_at, plan_tier")
      .eq("id", user.id)
      .single()
  ).data!;
  expect(before).toEqual({
    trial_started_at: null,
    trial_ends_at: null,
    plan_tier: "free",
  });

  await signIn(page, user.email, user.password);
  await acceptConsent(page);
  await expect(page).toHaveURL(/\/today/);
  await expect(
    page.getByText("กำลังทดลองใช้ Premium เหลืออีก 14 วัน"),
  ).toBeVisible();

  // trial stored server-side for exactly 14 days, and starting it twice changes nothing
  const trial = (
    await db
      .from("profiles")
      .select("trial_started_at, trial_ends_at")
      .eq("id", user.id)
      .single()
  ).data!;
  const days =
    (new Date(trial.trial_ends_at).getTime() -
      new Date(trial.trial_started_at).getTime()) /
    86_400_000;
  expect(days).toBeCloseTo(14, 5);
  await page.goto("/subscription");
  await page.goto("/today");
  const again = (
    await db
      .from("profiles")
      .select("trial_started_at")
      .eq("id", user.id)
      .single()
  ).data!;
  expect(again.trial_started_at).toBe(trial.trial_started_at);

  // plan page: current plan, unlimited meters, comparison with the owner's prices
  await page.goto("/subscription");
  await expect(
    page.getByRole("heading", { level: 1, name: "แพ็กเกจของคุณ" }),
  ).toBeVisible();
  await expect(
    page.getByText("กำลังทดลองใช้ Premium", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("เหลืออีก 14 วัน", { exact: false }),
  ).toBeVisible();
  const chat = page.locator("li").filter({ hasText: "ถาม AI" }).first();
  await expect(chat).toContainText("ใช้ไปแล้ว 0 ครั้ง");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);
  await expect(page.getByText("฿49 / เดือน")).toBeVisible();
  await expect(page.getByText("฿490 / ปี")).toBeVisible();
  await expect(page.getByText("฿89 / เดือน")).toBeVisible();
  await expect(page.getByText("฿890 / ปี")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  // the gate counts even unlimited use, and the page shows it
  const month =
    new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7) + "-01";
  for (let i = 0; i < 2; i++) {
    const r = await db.rpc("consume_usage", {
      p_user: user.id,
      p_feature: "aiChat",
      p_month: month,
      p_window_start: month,
      p_limit: null,
      p_month_cap: 200,
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ allowed: true });
  }
  await page.reload();
  await expect(
    page.locator("li").filter({ hasText: "ถาม AI" }).first(),
  ).toContainText("ใช้ไปแล้ว 2 ครั้ง");
});

test("after the trial the user is on Free-lite and the real counter enforces its limits", async ({
  page,
}) => {
  const user = await makeUser();
  const db = admin();
  const longAgo = new Date(Date.now() - 20 * 86_400_000).toISOString();
  const ended = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const { data: set } = await db
    .from("profiles")
    .update({ trial_started_at: longAgo, trial_ends_at: ended })
    .eq("id", user.id)
    .select("id");
  expect(set).toHaveLength(1);

  await signIn(page, user.email, user.password);
  await acceptConsent(page);
  await page.goto("/subscription");
  await expect(
    page.getByText("ช่วงทดลองใช้ Premium สิ้นสุดแล้ว"),
  ).toBeVisible();
  await expect(
    page.getByText("Free-lite", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator("li").filter({ hasText: "ถาม AI" }).first(),
  ).toContainText("0 / 5 ครั้ง");
  // an ended trial must not be restarted by the self-heal
  const p = (
    await db
      .from("profiles")
      .select("trial_started_at, trial_ends_at")
      .eq("id", user.id)
      .single()
  ).data!;
  expect(new Date(p.trial_started_at).toISOString()).toBe(longAgo);
  expect(new Date(p.trial_ends_at).toISOString()).toBe(ended);

  // Free-lite chat limit is 5 → the 6th call is refused by the real database function
  const month =
    new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7) + "-01";
  const call = () =>
    db.rpc("consume_usage", {
      p_user: user.id,
      p_feature: "aiChat",
      p_month: month,
      p_window_start: month,
      p_limit: 5,
      p_month_cap: 0,
    });
  const results = [];
  for (let i = 0; i < 6; i++)
    results.push((await call()).data as { allowed: boolean; reason: string });
  expect(results.map((r) => r.allowed)).toEqual([
    true,
    true,
    true,
    true,
    true,
    false,
  ]);
  expect(results[5].reason).toBe("quota_exhausted");

  await page.reload();
  const chat = page.locator("li").filter({ hasText: "ถาม AI" }).first();
  await expect(chat).toContainText("5 / 5 ครั้ง");
  await expect(chat).toContainText("ครบแล้ว");
  await expect(chat.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
});
