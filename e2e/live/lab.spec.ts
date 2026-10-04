import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live Lab Scan against the REAL Supabase project (see auth-flow.spec.ts for the
 * rules). No AI call is made: draft reports are seeded with the service role,
 * which is what a successful scan writes. The extraction logic is unit tested
 * with mocked providers.
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
let originalFlags: unknown = {};

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
  await d
    .from("platform_settings")
    .update({ feature_flags: originalFlags })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

const item = (o: Record<string, unknown>) => ({
  marker_key: null,
  value_std: null,
  status: "unknown",
  printed_range: "",
  confidence: 0.95,
  unit: "",
  ...o,
});

test("lab scan: input checks cost nothing; review recomputes status; confirm → results → timeline → delete; RLS; feature switch", async ({
  page,
}) => {
  const d = db();
  originalFlags = (
    await d
      .from("platform_settings")
      .select("feature_flags")
      .eq("id", true)
      .single()
  ).data!.feature_flags;
  const flagsOn = { ...(originalFlags as Record<string, unknown>) };
  delete flagsOn.lab_scan;
  await d
    .from("platform_settings")
    .update({ feature_flags: flagsOn })
    .eq("id", true);

  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  // Hub → page.
  await page.goto("/scan");
  await page.getByRole("link", { name: /สแกนผลแล็บ/ }).click();
  await expect(page).toHaveURL(/\/scan\/lab$/);
  expect(await serious(page)).toEqual([]);

  // A file that is neither PDF nor image is refused before any quota or AI is touched.
  await page.locator("#file").setInputFiles({
    name: "x.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>not a pdf</html>"),
  });
  await page.getByRole("button", { name: "อ่านผลตรวจ" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "รองรับเฉพาะไฟล์ PDF" }),
  ).toBeVisible();
  expect(
    (
      await d
        .from("ai_usage")
        .select("used")
        .eq("user_id", user.id)
        .eq("feature", "labImport")
    ).data ?? [],
  ).toHaveLength(0);

  // An earlier confirmed report gives a "previous value" to compare with.
  const older = await d
    .from("lab_reports")
    .insert({
      user_id: user.id,
      status: "confirmed",
      collected_on: "2026-03-01",
      confirmed_at: new Date().toISOString(),
      items: [
        item({
          name: "FBS",
          marker_key: "fasting_glucose",
          value: 95,
          unit: "mg/dL",
          value_std: 95,
          status: "normal",
        }),
      ],
    })
    .select("id");
  expect(older.error).toBeNull();
  expect(
    (
      await d.from("lab_results").insert({
        user_id: user.id,
        report_id: older.data![0].id,
        marker_key: "fasting_glucose",
        name: "FBS",
        value: 95,
        unit: "mg/dL",
        value_std: 95,
        status: "normal",
        collected_on: "2026-03-01",
      })
    ).error,
  ).toBeNull();

  // Seed what a successful scan writes (the "status" values here are what the code decided at scan time).
  const items = [
    item({
      name: "FBS",
      marker_key: "fasting_glucose",
      value: 104,
      unit: "mg/dL",
      value_std: 104,
      status: "watch",
      printed_range: "70-99",
    }),
    item({
      name: "HbA1c",
      marker_key: "hba1c",
      value: 5.3,
      unit: "%",
      value_std: 5.3,
      status: "normal",
    }),
    item({
      name: "LDL-C",
      marker_key: "ldl",
      value: 170,
      unit: "mg/dL",
      value_std: 170,
      status: "abnormal",
    }),
    item({ name: "Mystery marker", value: 3, unit: "u", confidence: 0.4 }),
  ];
  const seeded = await d
    .from("lab_reports")
    .insert({
      user_id: user.id,
      status: "draft",
      collected_on: "2026-09-01",
      items,
      model: "test/none",
    })
    .select("id");
  expect(seeded.error).toBeNull();
  const reportId = seeded.data![0].id;

  await page.goto(`/scan/lab/${reportId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "ตรวจทานผลตรวจ" }),
  ).toBeVisible();
  await expect(page.getByText("AI ไม่ค่อยมั่นใจรายการนี้")).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // A missing date is refused by the server (browser validation switched off to prove it).
  await page
    .locator("main form")
    .first()
    .evaluate((f) => f.setAttribute("novalidate", ""));
  await page.getByLabel("วันที่เก็บตัวอย่าง").fill("");
  await page.getByRole("button", { name: "บันทึกผลตรวจ" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "กรุณาระบุวันที่เก็บตัวอย่างที่ถูกต้อง" }),
  ).toBeVisible();
  expect(
    (await d.from("lab_reports").select("status").eq("id", reportId).single())
      .data!.status,
  ).toBe("draft");

  // Fix a misread number (104 → 88) and drop the unknown row; set the date; save.
  await page.getByLabel("วันที่เก็บตัวอย่าง").fill("2026-09-01");
  await page.locator("#value-0").fill("88");
  await page.locator('input[name="remove.3"]').check();
  await page.getByRole("button", { name: "บันทึกผลตรวจ" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "ผลตรวจของคุณ" }),
  ).toBeVisible();

  // Status was recomputed by the server from the corrected value, and results were written.
  const rep = (
    await d
      .from("lab_reports")
      .select("status, collected_on")
      .eq("id", reportId)
      .single()
  ).data!;
  expect(rep).toEqual({ status: "confirmed", collected_on: "2026-09-01" });
  const res = (
    await d
      .from("lab_results")
      .select("marker_key, value, status")
      .eq("report_id", reportId)
  ).data!;
  expect(
    res.map((r) => [r.marker_key, Number(r.value), r.status]).sort(),
  ).toEqual([
    ["fasting_glucose", 88, "normal"],
    ["hba1c", 5.3, "normal"],
    ["ldl", 170, "abnormal"],
  ]);

  // The summary, the worst-first order, the chips (icon + words) and the previous value.
  await expect(
    page.getByText("พบ 1 รายการที่อยู่นอกช่วงอ้างอิงทั่วไป"),
  ).toBeVisible();
  const first = page.locator("main ul > li").first();
  await expect(first).toContainText("ผิดปกติ ควรปรึกษาแพทย์");
  await expect(
    page.locator("li").filter({ hasText: "น้ำตาลในเลือดหลังอดอาหาร" }),
  ).toContainText("ครั้งก่อน 95 mg/dL");
  await expect(page.getByText(/รู้สุขไม่ได้วินิจฉัยโรค/)).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // Timeline lists it.
  await page.goto("/timeline");
  await expect(
    page.getByRole("heading", { name: "ผลตรวจสุขภาพ" }),
  ).toBeVisible();
  await expect(page.getByText("นอกช่วง 1 รายการ")).toBeVisible();

  // RLS with a real JWT.
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  expect(((await c.from("lab_reports").select("id")).data ?? []).length).toBe(
    2,
  );
  expect(
    (
      await c
        .from("lab_results")
        .update({ status: "normal" })
        .eq("report_id", reportId)
        .select("id")
    ).error,
  ).not.toBeNull();
  expect(
    (await c.from("lab_reports").insert({ user_id: user.id, items })).error,
  ).not.toBeNull();
  expect(
    (
      await c.rpc("confirm_lab_report", {
        p_report: reportId,
        p_user: user.id,
        p_collected_on: "2026-09-01",
        p_items: items,
      })
    ).error,
  ).not.toBeNull();
  const other = await makeUser();
  const c2 = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c2.auth.signInWithPassword(other);
  expect((await c2.from("lab_results").select("id")).data).toEqual([]);

  // Delete removes the report and its results.
  await page.goto(`/scan/lab/${reportId}`);
  await page.getByRole("button", { name: "ลบผลตรวจนี้" }).click();
  await expect(page).toHaveURL(/\/timeline/);
  expect(
    (await d.from("lab_reports").select("id").eq("id", reportId)).data,
  ).toEqual([]);
  expect(
    (await d.from("lab_results").select("id").eq("report_id", reportId)).data,
  ).toEqual([]);

  // Switching the feature off removes the page and the hub card.
  await d
    .from("platform_settings")
    .update({ feature_flags: { ...flagsOn, lab_scan: false } })
    .eq("id", true);
  await expect
    .poll(async () => (await page.goto("/scan/lab"))?.status(), {
      timeout: 60_000,
    })
    .toBe(404);
  await page.goto("/scan");
  await expect(page.getByRole("link", { name: /สแกนผลแล็บ/ })).toHaveCount(0);
});
