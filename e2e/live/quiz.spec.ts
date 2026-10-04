import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live Health Quiz against the REAL Supabase project (see auth-flow.spec.ts for
 * the rules): the public funnel (nothing stored), the signed-in saved result
 * with a 7-day plan (AI when a provider answers, template otherwise — both are
 * valid), the quota denial, and RLS. The plan call may reach a real provider.
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

async function serious(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => v.id);
}

const pick = (page: Page, legend: string, option: string) =>
  page
    .getByRole("group", { name: legend })
    .getByText(option, { exact: true })
    .click();

async function fillQuiz(page: Page, opts: { year?: boolean } = {}) {
  if (opts.year !== false) await page.getByLabel("ปีเกิด (ค.ศ.)").fill("1985");
  await pick(page, "การสูบบุหรี่", "ยังสูบอยู่");
  await pick(page, "การดื่มแอลกอฮอล์", "นาน ๆ ครั้ง");
  await pick(
    page,
    "ขยับตัวหรือออกกำลังกายต่อเนื่องอย่างน้อย 30 นาที กี่วันต่อสัปดาห์?",
    "1",
  );
  await pick(page, "เมื่อคืนคุณนอนประมาณกี่ชั่วโมง?", "5–6 ชม.");
  await pick(
    page,
    "ปกติกินผักและผลไม้รวมกันวันละกี่ส่วน? (1 ส่วน ≈ 1 กำมือ)",
    "1–2",
  );
  await pick(page, "ช่วงนี้รู้สึกเครียดแค่ไหน?", "ค่อนข้างเครียด");
  await pick(
    page,
    "ใน 12 เดือนที่ผ่านมา คุณตรวจสุขภาพประจำปีหรือไม่?",
    "ยังไม่ได้ตรวจ",
  );
}

test.afterAll(async () => {
  for (const id of createdIds) await db().auth.admin.deleteUser(id);
});

test("public quiz stores nothing; signed-in quiz saves a result with a plan; quota denial; RLS", async ({
  page,
  browser,
  baseURL,
}) => {
  const d = db();

  // ── anonymous visitor: landing → quiz → result, nothing stored ─────────────
  const anon = await browser.newContext({ baseURL });
  const ap = await anon.newPage();
  await ap.goto("/");
  await ap.getByRole("link", { name: /ลองประเมินสุขภาพฟรี/ }).click();
  await expect(ap).toHaveURL(/\/quiz$/);
  await expect(
    ap.getByRole("heading", { level: 1, name: "ประเมินสุขภาพเบื้องต้น" }),
  ).toBeVisible();
  expect(await serious(ap)).toEqual([]);
  const before = (
    await d.from("quiz_results").select("id", { count: "exact", head: true })
  ).count;
  const lastEvent = (
    await d
      .from("product_events")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
  ).data?.[0]?.id as number | undefined;

  // server-side validation (browser validation switched off to prove it)
  await ap
    .locator("main form")
    .evaluate((f) => f.setAttribute("novalidate", ""));
  await ap.getByRole("button", { name: "ดูผลของฉัน" }).click();
  await expect(
    ap.getByRole("alert").filter({ hasText: "กรุณาตอบให้ครบทุกข้อ" }),
  ).toBeVisible();

  await fillQuiz(ap);
  await ap.getByRole("button", { name: "ดูผลของฉัน" }).click();
  await expect(
    ap.getByRole("heading", { level: 1, name: "ผลประเมินสุขภาพของคุณ" }),
  ).toBeVisible();
  await expect(ap.getByText(/อายุสุขภาพโดยประมาณ/)).toBeVisible();
  await expect(ap.getByText(/อายุจริง 41 ปี/)).toBeVisible();
  await expect(
    ap.getByText(/ไม่ใช่ผลตรวจทางการแพทย์และไม่ใช่การวินิจฉัย/),
  ).toBeVisible();
  await expect(ap.getByRole("link", { name: "สมัครสมาชิก" })).toBeVisible();
  // the result can be shared as a card (the public quiz card, drawn from the three numbers)
  await expect(
    ap.getByRole("heading", { name: "การ์ดสำหรับแชร์" }),
  ).toBeVisible();
  await expect(
    ap.getByRole("img", { name: "ตัวอย่างการ์ดที่จะแชร์" }),
  ).toHaveAttribute("src", /^\/api\/share\/quiz\?score=\d+&health=\d+&real=41/);
  await expect(ap.getByRole("heading", { name: "แผน 7 วัน" })).toHaveCount(0); // the plan is for members
  expect(await serious(ap)).toEqual([]);
  expect(
    (await d.from("quiz_results").select("id", { count: "exact", head: true }))
      .count,
  ).toBe(before);
  // The funnel counts it — as an event with no user and no content.
  const events = (
    await d
      .from("product_events")
      .select("id, user_id, event, detail")
      .eq("event", "quiz_completed")
      .gt("id", lastEvent ?? 0)
  ).data!;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ user_id: null, detail: null });
  await d.from("product_events").delete().eq("id", events[0].id); // keep the shared project clean
  await anon.close();

  // ── signed-in user: prefilled, saved, plan ─────────────────────────────────
  const user = await makeUser();
  await d.from("health_profiles").insert({
    user_id: user.id,
    birth_year: 1985,
    smoking: "never",
    alcohol: "none",
    exercise_days: 4,
  });
  await signInAndConsent(page, user.email, user.password);
  await page.goto("/quiz");
  await expect(page.getByLabel("ปีเกิด (ค.ศ.)")).toHaveValue("1985");
  await expect(
    page
      .getByRole("group", { name: "การสูบบุหรี่" })
      .getByRole("radio", { name: "ไม่เคยสูบ" }),
  ).toBeChecked();

  await pick(page, "เมื่อคืนคุณนอนประมาณกี่ชั่วโมง?", "7–8 ชม.");
  await pick(
    page,
    "ปกติกินผักและผลไม้รวมกันวันละกี่ส่วน? (1 ส่วน ≈ 1 กำมือ)",
    "3–4",
  );
  await pick(page, "ช่วงนี้รู้สึกเครียดแค่ไหน?", "ปานกลาง");
  await pick(
    page,
    "ใน 12 เดือนที่ผ่านมา คุณตรวจสุขภาพประจำปีหรือไม่?",
    "ตรวจแล้ว",
  );
  await page.getByRole("button", { name: "ดูผลของฉัน" }).click();
  await expect(page).toHaveURL(/\/quiz-result\/[0-9a-f-]{36}/, {
    timeout: 90_000,
  });
  await expect(page.getByRole("heading", { name: "แผน 7 วัน" })).toBeVisible();
  await expect(page.locator("ol").last().locator("li")).toHaveCount(7);
  expect(await serious(page)).toEqual([]);

  const saved = (
    await d
      .from("quiz_results")
      .select("score, chrono_age, delta_years, plan_source, plan")
      .eq("user_id", user.id)
  ).data!;
  expect(saved).toHaveLength(1);
  expect(saved[0].chrono_age).toBe(41);
  expect(["ai", "template"]).toContain(saved[0].plan_source);
  expect((saved[0].plan as unknown[]).length).toBe(7);
  expect(
    (
      await d
        .from("ai_usage")
        .select("used")
        .eq("user_id", user.id)
        .eq("feature", "healthQuiz")
    ).data,
  ).toEqual([{ used: 1 }]);

  // ── out of allowance: the numbers still show, nothing is saved ─────────────
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await d
    .from("profiles")
    .update({
      plan_tier: "free",
      trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      trial_ends_at: past,
    })
    .eq("id", user.id);
  await page.goto("/quiz");
  await pick(page, "เมื่อคืนคุณนอนประมาณกี่ชั่วโมง?", "7–8 ชม.");
  await pick(
    page,
    "ปกติกินผักและผลไม้รวมกันวันละกี่ส่วน? (1 ส่วน ≈ 1 กำมือ)",
    "3–4",
  );
  await pick(page, "ช่วงนี้รู้สึกเครียดแค่ไหน?", "ปานกลาง");
  await pick(
    page,
    "ใน 12 เดือนที่ผ่านมา คุณตรวจสุขภาพประจำปีหรือไม่?",
    "ตรวจแล้ว",
  );
  await page.getByRole("button", { name: "ดูผลของฉัน" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "ผลประเมินสุขภาพของคุณ" }),
  ).toBeVisible();
  await expect(
    page.getByText("ครบสิทธิ์ประเมินสุขภาพของแพ็กเกจแล้ว").first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "ดูแพ็กเกจ" })).toBeVisible();
  expect(
    (await d.from("quiz_results").select("id").eq("user_id", user.id)).data,
  ).toHaveLength(1);

  // ── RLS with a real JWT ────────────────────────────────────────────────────
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  expect((await c.from("quiz_results").select("id")).data).toHaveLength(1);
  expect(
    (
      await c
        .from("quiz_results")
        .update({ score: 100 })
        .eq("user_id", user.id)
        .select("id")
    ).error,
  ).not.toBeNull();
  expect(
    (
      await c.from("quiz_results").insert({
        user_id: user.id,
        answers: {},
        score: 1,
        chrono_age: 1,
        delta_years: 0,
        levers: [],
        plan: [1, 2, 3, 4, 5, 6, 7],
        plan_source: "ai",
      })
    ).error,
  ).not.toBeNull();
  const other = await makeUser();
  const c2 = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c2.auth.signInWithPassword(other);
  expect((await c2.from("quiz_results").select("id")).data).toEqual([]);

  // A stranger's result page is a 404.
  const resultId = saved.length
    ? (
        await d
          .from("quiz_results")
          .select("id")
          .eq("user_id", user.id)
          .single()
      ).data!.id
    : "";
  const stranger = await browser.newContext({ baseURL });
  const sp = await stranger.newPage();
  await signInAndConsent(sp, other.email, other.password);
  expect((await sp.goto(`/quiz-result/${resultId}`))?.status()).toBe(404);
  await stranger.close();
});
