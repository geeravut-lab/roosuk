import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live voice typing: the fake microphone plays a Thai sentence (spoken by a
 * speech synthesiser, e2e/fixtures/voice-th.wav); the browser records it, turns
 * it into a 16 kHz WAV, the server transcribes it with the real speech model and
 * the words land in the Ask box for checking — and one voice allowance is used.
 * Bad uploads are refused before any allowance is used, and nobody can use voice
 * with the feature switched off.
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
test.setTimeout(180_000);

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

let originalFlags: unknown = {};

test.afterAll(async () => {
  const d = db();
  await d
    .from("platform_settings")
    .update({ feature_flags: originalFlags })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

test("voice typing: speak → text in the box → one allowance; refusals cost nothing; switchable", async ({
  page,
}) => {
  const d = db();
  originalFlags =
    (
      await d
        .from("platform_settings")
        .select("feature_flags")
        .eq("id", true)
        .single()
    ).data?.feature_flags ?? {};
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);
  await page.goto("/ask");
  await expect(
    page.getByRole("button", { name: "พูดแทนการพิมพ์" }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  const used = async () =>
    (
      (
        await d
          .from("ai_usage")
          .select("used")
          .eq("user_id", user.id)
          .eq("feature", "voice")
      ).data ?? []
    ).reduce((n, r) => n + Number(r.used), 0);

  // ── record the fake microphone's sentence ──
  await page.locator("#message").fill("ก่อนหน้านี้:");
  await page.getByRole("button", { name: "พูดแทนการพิมพ์" }).click();
  await expect(page.getByText(/กำลังฟัง/)).toBeVisible();
  await page.waitForTimeout(5500); // the sentence is about 4 seconds
  await page.getByRole("button", { name: "หยุดพูด" }).click();
  await expect(page.getByText("ถอดเสียงแล้ว")).toBeVisible({ timeout: 90_000 });
  const text = await page.locator("#message").inputValue();
  expect(text.startsWith("ก่อนหน้านี้:")).toBe(true); // added after what was typed
  expect(text).toMatch(/นอนไม่หลับ/); // what was said
  expect(await used()).toBe(1);

  // the words are only text in a box: nothing was sent
  expect(
    (
      (await d.from("ai_conversations").select("id").eq("user_id", user.id))
        .data ?? []
    ).length,
  ).toBe(0);

  // ── the switch: with voice off the same recording is refused and costs nothing ──
  expect(
    (
      await d
        .from("platform_settings")
        .update({ feature_flags: { voice: false } })
        .eq("id", true)
    ).error,
  ).toBeNull();
  await page.waitForTimeout(35_000); // the settings cache (30 s) must have expired
  await page.goto("/ask");
  await page.getByRole("button", { name: "พูดแทนการพิมพ์" }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "หยุดพูด" }).click();
  await expect(page.getByText("ปิดใช้งานชั่วคราว")).toBeVisible({
    timeout: 30_000,
  });
  expect(await used()).toBe(1);
});
