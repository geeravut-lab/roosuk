import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live /admin/ai against the REAL Supabase project (see auth-flow.spec.ts for
 * the rules). No real AI call is made here — model "Test" buttons cost money and
 * are exercised by hand. Restores the ai_settings row it edits.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

const expect = baseExpect.configure({ timeout: 20_000 });

test.skip(
  !enabled,
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const db = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdIds: string[] = [];
let original: { route_overrides: unknown; model_overrides: unknown } | null =
  null;

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

test.afterAll(async () => {
  const d = db();
  if (original)
    await d
      .from("ai_settings")
      .update({
        route_overrides: original.route_overrides,
        model_overrides: original.model_overrides,
        updated_by: null,
      })
      .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

test("only admins reach /admin/ai; an admin edits routing, which is stored and validated", async ({
  page,
}) => {
  const d = db();
  original = (
    await d
      .from("ai_settings")
      .select("route_overrides, model_overrides")
      .eq("id", true)
      .single()
  ).data;
  await d
    .from("ai_settings")
    .update({ route_overrides: {}, model_overrides: {} })
    .eq("id", true);

  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  // A non-admin gets a 404 — and the settings tables are unreadable with a user JWT.
  expect((await page.goto("/admin/ai"))?.status()).toBe(404);
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  expect((await c.from("ai_settings").select("*")).error).not.toBeNull();
  expect((await c.from("ai_events").select("*")).error).not.toBeNull();
  expect(
    (
      await c
        .from("ai_settings")
        .update({ route_overrides: { chat: { primary: "google" } } })
        .eq("id", true)
        .select("id")
    ).data ?? [],
  ).toHaveLength(0);

  expect(
    (await d.from("admins").insert({ user_id: user.id })).error,
  ).toBeNull();
  await page.goto("/admin/ai");
  await expect(
    page.getByRole("heading", { level: 1, name: "ตั้งค่า AI" }),
  ).toBeVisible();
  await expect(page.getByText("มีผลภายใน 1 นาที")).toBeVisible();

  // Key status reflects the environment: Google is set, Anthropic is not (yet) in this sandbox.
  const keys = page.locator("section", {
    has: page.getByRole("heading", { name: "API key" }),
  });
  await expect(keys.locator("li", { hasText: "Google Gemini" })).toContainText(
    "ตั้งค่าแล้ว",
  );

  // Pick a model override for Gemini on food scans and turn the fallback off.
  const foodCard = page.locator("li", {
    has: page.getByRole("heading", { name: "สแกนอาหาร (รูป)" }),
  });
  await foodCard.getByLabel("ผู้ให้บริการสำรอง").selectOption("none");
  await foodCard.getByText("รุ่นโมเดล", { exact: true }).click();
  await foodCard.getByLabel("Google Gemini").fill("gemini-flash-lite-latest");
  expect(
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
      .then((r) =>
        r.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map((v) => v.id),
      ),
  ).toEqual([]);
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();

  const saved = (
    await d
      .from("ai_settings")
      .select("route_overrides, model_overrides, updated_by")
      .eq("id", true)
      .single()
  ).data!;
  expect(saved.route_overrides).toEqual({ food_scan: { fallback: "none" } });
  expect(saved.model_overrides).toEqual({
    google: { food_scan: "gemini-flash-lite-latest" },
  });
  expect(saved.updated_by).toBe(user.id);

  // A model id with junk characters is refused, nothing is stored.
  await foodCard
    .locator("details")
    .evaluate((d: HTMLDetailsElement) => (d.open = true));
  await foodCard.getByLabel("Google Gemini").fill("bad model!");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "กรุณาตรวจสอบข้อมูลที่กรอกอีกครั้ง" }),
  ).toBeVisible();
  expect(
    (
      await d
        .from("ai_settings")
        .select("model_overrides")
        .eq("id", true)
        .single()
    ).data!.model_overrides,
  ).toEqual({ google: { food_scan: "gemini-flash-lite-latest" } });
});
