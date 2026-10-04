import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";
import { BUCKET } from "./files-util";

/**
 * Live dark mode: the Settings switch saves the choice (a cookie) and every
 * signed-in page passes the contrast/accessibility audit in dark.
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

async function signInAndConsent(
  page: Page,
  email: string,
  password: string,
  withPhotos: boolean,
) {
  await page.goto("/auth");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/consent/);
  for (const box of await page
    .locator('input[type="checkbox"][required]')
    .all())
    await box.check();
  if (withPhotos) await page.locator('input[name="consent_photos"]').check();
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
  for (const id of createdIds) {
    const objs = (await d.storage.from(BUCKET).list(id)).data ?? [];
    if (objs.length)
      await d.storage.from(BUCKET).remove(objs.map((o) => `${id}/${o.name}`));
    await d.auth.admin.deleteUser(id);
  }
});

test("dark mode: settings switch persists, and signed-in pages pass axe in dark", async ({
  page,
}) => {
  const a = await makeUser();
  await signInAndConsent(page, a.email, a.password, true);

  await page.goto("/settings");
  const group = page.getByRole("group", { name: "ธีมสี" });
  await expect(
    group.getByRole("button", { name: "ตามอุปกรณ์" }),
  ).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "มืด" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(group.getByRole("button", { name: "มืด" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).toBe("rgb(14, 25, 28)");

  // the choice follows the person across pages
  for (const path of [
    "/today",
    "/timeline",
    "/scan",
    "/ask",
    "/report",
    "/vault",
    "/achievements",
    "/subscription",
    "/notifications",
    "/profile",
    "/settings",
    "/checkup-interest",
    "/scan/body",
  ]) {
    await page.goto(path);
    await expect(page.locator("html"), path).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(await serious(page), path).toEqual([]);
  }

  await page.screenshot({
    path: process.env.THEME_SHOT ?? "test-results/theme-dark.png",
    fullPage: true,
  });

  // back to light
  await page.goto("/settings");
  await group.getByRole("button", { name: "สว่าง" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await serious(page)).toEqual([]);
});
