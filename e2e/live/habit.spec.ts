import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { addDays, bangkokDate } from "../../src/lib/health/dates";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live daily-habit loop against the REAL Supabase project (see auth-flow.spec.ts
 * for the rules): check-in → score → Today's 3 Actions → streak → timeline,
 * plus the date rule enforced by RLS with a real JWT. Creates and deletes its
 * own user (rows cascade).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

// Every step crosses the network to Supabase (and the sandbox proxy): wait longer than the 5 s default.
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

async function seriousViolations(page: Page): Promise<string[]> {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return axe.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

test.afterAll(async () => {
  for (const id of createdIds) await db().auth.admin.deleteUser(id);
  if (createdIds.length) {
    const { data } = await db()
      .from("daily_checkins")
      .select("user_id")
      .in("user_id", createdIds);
    expect(data ?? []).toHaveLength(0);
  }
});

test("check-in → score → actions → streak → timeline, and RLS pins check-ins to today", async ({
  page,
}) => {
  const user = await makeUser();
  const d = db();
  const today = bangkokDate(new Date());
  await signInAndConsent(page, user.email, user.password);

  // Nothing yet: invitation, empty score, 0/3 actions, a streak to start.
  await expect(
    page.getByRole("link", { name: /เช็กอินสุขภาพวันนี้/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("เช็กอินครั้งแรกเพื่อดูคะแนนสุขภาพของคุณ"),
  ).toBeVisible();
  await expect(page.getByText("ทำแล้ว 0 จาก 3")).toBeVisible();
  await expect(
    page.getByText("เริ่มต้นความต่อเนื่องของคุณวันนี้"),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // The check-in: five taps.
  await page
    .getByRole("link", { name: /เช็กอินสุขภาพวันนี้/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/today\/checkin/);
  const pick = (legend: string, option: string) =>
    page
      .getByRole("group", { name: legend })
      .getByText(option, { exact: true })
      .click();
  await pick("เมื่อคืนคุณนอนประมาณกี่ชั่วโมง?", "7–8 ชม.");
  await pick("วันนี้ขยับตัวหรือออกกำลังกายไปแล้วนานแค่ไหน?", "30–60 นาที");
  await pick("ตอนนี้พลังงานของคุณเป็นอย่างไร?", "ดี");
  await pick("วันนี้อารมณ์ของคุณเป็นอย่างไร?", "ดี");
  await pick("วันนี้อาหารที่กินสมดุลแค่ไหน?", "ค่อนข้างสมดุล");
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "บันทึกเช็กอิน" }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText("เช็กอินวันนี้แล้ว")).toBeVisible();
  const row = (
    await d.from("daily_checkins").select("*").eq("user_id", user.id)
  ).data!;
  expect(row).toHaveLength(1);
  expect(row[0]).toMatchObject({
    checkin_date: today,
    sleep_band: 3,
    activity_band: 3,
    energy: 4,
    mood: 4,
    nutrition: 4,
  });

  // Score and streak are shown; the check-in action counts as done.
  await expect(
    page.getByText("คำนวณจากเช็กอิน 1 วันในช่วง 7 วันล่าสุด"),
  ).toBeVisible();
  await expect(page.getByText("1 วันติดต่อกัน")).toBeVisible();
  await expect(page.getByText("ทำแล้ว 1 จาก 3")).toBeVisible();

  // Tick another action, then undo it.
  const actions = page.locator("section", {
    has: page.getByRole("heading", { name: "3 สิ่งที่ควรทำวันนี้" }),
  });
  await actions
    .getByRole("button", { name: /^ทำแล้ว:/ })
    .first()
    .click();
  await expect(page.getByText("ทำแล้ว 2 จาก 3")).toBeVisible();
  expect(
    (
      await d
        .from("action_completions")
        .select("action_key")
        .eq("user_id", user.id)
    ).data,
  ).toHaveLength(1);
  await actions.getByRole("button", { name: /^ยกเลิกการติ๊ก:/ }).click();
  await expect(page.getByText("ทำแล้ว 1 จาก 3")).toBeVisible();
  expect(
    (
      await d
        .from("action_completions")
        .select("action_key")
        .eq("user_id", user.id)
    ).data,
  ).toHaveLength(0);
  expect(await seriousViolations(page)).toEqual([]);

  // Editing the same day updates the one row (no duplicate, no crash).
  await page.getByRole("link", { name: "แก้ไขคำตอบ" }).click();
  await expect(
    page
      .getByRole("group", { name: "วันนี้อารมณ์ของคุณเป็นอย่างไร?" })
      .getByRole("radio", { name: "ดี", exact: true }),
  ).toBeChecked();
  await pick("วันนี้อารมณ์ของคุณเป็นอย่างไร?", "ดีมาก");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const edited = (
    await d.from("daily_checkins").select("mood").eq("user_id", user.id)
  ).data!;
  expect(edited).toEqual([{ mood: 5 }]);

  // Timeline lists the day with its score.
  await page.goto("/timeline");
  await expect(
    page.getByRole("heading", { name: "ประวัติเช็กอิน" }),
  ).toBeVisible();
  await expect(page.getByText(/^คะแนน \d+$/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // RLS with a real JWT: today only, own rows only.
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  const answers = {
    sleep_band: 3,
    activity_band: 3,
    energy: 3,
    mood: 3,
    nutrition: 3,
  };
  const old = await c
    .from("daily_checkins")
    .insert({ user_id: user.id, checkin_date: addDays(today, -1), ...answers });
  expect(old.error).not.toBeNull();
  const future = await c
    .from("daily_checkins")
    .insert({ user_id: user.id, checkin_date: addDays(today, 1), ...answers });
  expect(future.error).not.toBeNull();
  const other = await makeUser();
  const forged = await c
    .from("daily_checkins")
    .insert({ user_id: other.id, checkin_date: today, ...answers });
  expect(forged.error).not.toBeNull();
  const moved = await c
    .from("daily_checkins")
    .update({ checkin_date: addDays(today, -1) })
    .eq("user_id", user.id)
    .select("user_id");
  expect(moved.error).not.toBeNull(); // no UPDATE right on the date column

  // A streak of three days with the lowest mood each day → streak 3 and the supportive note.
  const lowMood = [-1, -2].map((o) => ({
    user_id: user.id,
    checkin_date: addDays(today, o),
    ...answers,
    mood: 1,
  }));
  expect((await d.from("daily_checkins").insert(lowMood)).error).toBeNull();
  expect(
    (
      await d
        .from("daily_checkins")
        .update({ mood: 1 })
        .eq("user_id", user.id)
        .eq("checkin_date", today)
    ).error,
  ).toBeNull();
  await page.goto("/today");
  await expect(page.getByText("3 วันติดต่อกัน")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "ช่วงนี้ดูเหมือนคุณเหนื่อยใจอยู่" }),
  ).toBeVisible();
  await expect(page.getByText(/1323/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
