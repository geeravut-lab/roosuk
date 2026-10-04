import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

const expect = baseExpect.configure({ timeout: 30_000 });

/** Shared helpers of the newer live specs (users are created, and removed with everything they own). */
export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const liveEnabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

export const db = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function makeUser(
  created: string[],
  email?: string,
): Promise<TestUser> {
  const mail =
    email ??
    lineSyntheticEmail(`e2e${Date.now()}${randomBytes(3).toString("hex")}`);
  const password = `Pw-${randomBytes(9).toString("hex")}`;
  const { data, error } = await db().auth.admin.createUser({
    email: mail,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error("createUser returned no user");
  created.push(data.user.id);
  return { id: data.user.id, email: mail, password };
}

export async function signInAndConsent(
  page: Page,
  user: TestUser,
  opts: { photos?: boolean } = {},
) {
  await page.goto("/auth");
  // the form is a POST form until React has hydrated it: wait, or an early click is a plain page reload
  await page.waitForLoadState("networkidle");
  await page.getByLabel("อีเมล").fill(user.email);
  await page.getByLabel("รหัสผ่าน").fill(user.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/consent/);
  await page.waitForLoadState("networkidle");
  for (const box of await page
    .locator('input[type="checkbox"][required]')
    .all())
    await box.check();
  if (opts.photos) await page.locator('input[name="consent_photos"]').check();
  await page.getByRole("button", { name: "ยืนยันและเริ่มใช้งาน" }).click();
  await expect(page).toHaveURL(/\/today/);
}

export async function seriousViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

export async function removeUsers(ids: string[]) {
  for (const id of ids) await db().auth.admin.deleteUser(id);
}

/** Ends the Premium trial so the person is on Free-lite. */
export async function endTrial(userId: string) {
  const { data } = await db()
    .from("profiles")
    .update({
      trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    })
    .eq("id", userId)
    .select("id");
  expect(data).toHaveLength(1);
}
