import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live Health Profile against the REAL Supabase project (see auth-flow.spec.ts
 * for the rules): fill, save, edit, skip, validation, and RLS with a real JWT.
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
  for (const id of createdIds) await db().auth.admin.deleteUser(id);
});

test("health profile: nudge → fill → save → edit/skip → validation → RLS", async ({
  page,
}) => {
  const d = db();
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  // Today nudges a user with no profile.
  await page.getByRole("link", { name: /ตั้งค่าโปรไฟล์สุขภาพ/ }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "โปรไฟล์สุขภาพ" }),
  ).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // No weight / height / body-shape questions anywhere.
  await expect(page.getByText(/น้ำหนัก|ส่วนสูง|BMI/).first()).toContainText(
    "ไม่ถาม",
  );

  const pick = (legend: string, option: string) =>
    page
      .getByRole("group", { name: legend })
      .getByText(option, { exact: true })
      .click();
  await page.getByLabel("ปีเกิด (ค.ศ.)").fill("1985");
  await pick("เพศ", "หญิง");
  await pick("การสูบบุหรี่", "ไม่เคยสูบ");
  await pick("การดื่มแอลกอฮอล์", "นาน ๆ ครั้ง");
  await pick(
    "ขยับตัวหรือออกกำลังกายต่อเนื่องอย่างน้อย 30 นาที กี่วันต่อสัปดาห์?",
    "3",
  );
  await pick("โรคประจำตัวที่แพทย์เคยวินิจฉัย", "ความดันโลหิตสูง");
  await pick("อยากให้รู้สุขช่วยเรื่องอะไร", "นอนหลับดีขึ้น");
  await pick("อยากให้รู้สุขช่วยเรื่องอะไร", "เข้าใจผลตรวจสุขภาพ");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeVisible();

  const row = (
    await d.from("health_profiles").select("*").eq("user_id", user.id)
  ).data!;
  expect(row).toHaveLength(1);
  expect(row[0]).toMatchObject({
    birth_year: 1985,
    sex: "female",
    smoking: "never",
    alcohol: "occasional",
    exercise_days: 3,
    conditions: ["hypertension"],
  });
  expect([...row[0].goals].sort()).toEqual(["sleep", "understand_labs"]);

  // The nudge is gone once a profile exists.
  await page.goto("/today");
  await expect(
    page.getByRole("link", { name: /ตั้งค่าโปรไฟล์สุขภาพ/ }),
  ).toHaveCount(0);

  // Editing keeps one row; "skip" clears an answer.
  await page.goto("/profile");
  await expect(
    page
      .getByRole("group", { name: "เพศ" })
      .getByRole("radio", { name: "หญิง" }),
  ).toBeChecked();
  await pick("การสูบบุหรี่", "ข้าม");
  await pick(
    "ขยับตัวหรือออกกำลังกายต่อเนื่องอย่างน้อย 30 นาที กี่วันต่อสัปดาห์?",
    "0",
  );
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByText("บันทึกโปรไฟล์แล้ว")).toBeVisible();
  const edited = (
    await d
      .from("health_profiles")
      .select("smoking, exercise_days")
      .eq("user_id", user.id)
  ).data!;
  expect(edited).toEqual([{ smoking: null, exercise_days: 0 }]);
  expect(await serious(page)).toEqual([]);

  // An implausible birth year is refused by the server.
  await page.getByLabel("ปีเกิด (ค.ศ.)").evaluate((el: HTMLInputElement) => {
    el.removeAttribute("min");
    el.removeAttribute("max");
  });
  await page.getByLabel("ปีเกิด (ค.ศ.)").fill("2025");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "ข้อมูลโปรไฟล์ไม่ถูกต้อง" }),
  ).toBeVisible();
  expect(
    (
      await d
        .from("health_profiles")
        .select("birth_year")
        .eq("user_id", user.id)
        .single()
    ).data!.birth_year,
  ).toBe(1985);

  // RLS with a real JWT: own row only, owner column immutable.
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  expect((await c.from("health_profiles").select("user_id")).data).toEqual([
    { user_id: user.id },
  ]);
  const other = await makeUser();
  expect(
    (await c.from("health_profiles").insert({ user_id: other.id })).error,
  ).not.toBeNull();
  expect(
    (
      await c
        .from("health_profiles")
        .update({ user_id: other.id })
        .eq("user_id", user.id)
        .select("user_id")
    ).error,
  ).not.toBeNull();
  const c2 = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c2.auth.signInWithPassword(other);
  expect((await c2.from("health_profiles").select("user_id")).data).toEqual([]);
});
