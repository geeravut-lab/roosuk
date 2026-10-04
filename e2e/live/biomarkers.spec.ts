import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live "unknown lab items": a confirmed report with an unrecognised test name is
 * counted (name + unit only — no value, no user), an admin turns it into a DRAFT
 * range that judges nothing, and only after a doctor's sign-off does "judge again"
 * use it. The AI-draft button is not clicked here (a real, paid call).
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
test.setTimeout(150_000);

const db = (): SupabaseClient =>
  createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdIds: string[] = [];
const NAME = `Zq Marker ${randomBytes(3).toString("hex")}`;
const KEY = `zq_${randomBytes(3).toString("hex")}`;

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
  await d.from("biomarker_extras").delete().eq("key", KEY);
  await d
    .from("lab_unknown_markers")
    .delete()
    .eq("normalized_name", NAME.toLowerCase());
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

test("unknown test → counted without values → admin draft (not used) → doctor approval → judge again", async ({
  page,
  browser,
}) => {
  const d = db();
  const user = await makeUser();
  const admin = await makeUser();
  expect(
    (await d.from("admins").insert({ user_id: admin.id })).error,
  ).toBeNull();

  // ── a user confirms a report that contains a test the app does not know ────
  const seeded = await d
    .from("lab_reports")
    .insert({
      user_id: user.id,
      status: "draft",
      collected_on: "2026-09-01",
      items: [
        {
          name: NAME,
          marker_key: null,
          value: 7,
          unit: "u/L",
          value_std: null,
          status: "unknown",
          printed_range: "",
          confidence: 0.95,
        },
      ],
      model: "test/none",
    })
    .select("id");
  expect(seeded.error).toBeNull();
  const reportId = seeded.data![0].id as string;

  await signInAndConsent(page, user.email, user.password);
  await page.goto(`/scan/lab/${reportId}`);
  await page.getByLabel("วันที่เก็บตัวอย่าง").fill("2026-09-01");
  await page.getByRole("button", { name: "บันทึกผลตรวจ" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "ผลตรวจของคุณ" }),
  ).toBeVisible();
  await expect(page.getByText("ไม่ได้ประเมิน").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "ประเมินใหม่ด้วยค่าอ้างอิงล่าสุด" }),
  ).toBeVisible();

  // counted: the printed name, a sample unit and a count — nothing about the person or the value
  const row = (
    await d
      .from("lab_unknown_markers")
      .select("*")
      .eq("normalized_name", NAME.toLowerCase())
      .single()
  ).data!;
  expect(row).toMatchObject({
    times_seen: 1,
    unit_sample: "u/L",
    status: "new",
  });
  expect(Object.keys(row).sort()).toEqual(
    [
      "display_name",
      "first_seen_at",
      "last_seen_at",
      "normalized_name",
      "resolved_key",
      "status",
      "times_seen",
      "unit_sample",
    ].sort(),
  );

  // nobody but an admin can read the queue or the extras table
  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false },
  });
  expect(
    ((await anon.from("lab_unknown_markers").select("*")).data ?? []).length,
  ).toBe(0);
  expect(
    ((await anon.from("biomarker_extras").select("*")).data ?? []).length,
  ).toBe(0);

  // ── admin: queue → create a draft ─────────────────────────────────────────
  expect([403, 404]).toContain(
    (await page.goto("/admin/biomarkers"))?.status(),
  );
  const ctx = await browser.newContext();
  const ap = await ctx.newPage();
  await signInAndConsent(ap, admin.email, admin.password);
  await ap.goto("/admin");
  await ap.getByRole("link", { name: /ค่าอ้างอิงแล็บที่เพิ่มเอง/ }).click();
  await expect(ap).toHaveURL(/\/admin\/biomarkers$/);
  const queued = ap.getByRole("listitem").filter({ hasText: NAME });
  await expect(queued).toContainText("พบ 1 ครั้ง");
  await expect(queued).toContainText("u/L");
  expect(await serious(ap)).toEqual([]);

  await queued.getByText("สร้างค่าอ้างอิง").click();
  await queued.getByLabel(/^รหัส/).fill(KEY);
  await queued.getByLabel("ชื่อภาษาไทย").fill("ตัวทดสอบ Zq");
  await queued.getByLabel("หน่วยของช่วงค่า", { exact: true }).fill("u/L");
  await queued.getByLabel(/^ปกติ ตั้งแต่/).fill("1");
  await queued.getByLabel(/^ปกติ ไม่เกิน/).fill("10");
  await queued.getByLabel("ที่มาของช่วงค่า (บังคับ)").fill("E2E test sheet");
  await queued.getByRole("button", { name: "บันทึกเป็นร่าง" }).click();
  await expect(queued.getByRole("status")).toContainText(KEY);
  const draft = (
    await d
      .from("biomarker_extras")
      .select("status, approved_by")
      .eq("key", KEY)
      .single()
  ).data!;
  expect(draft).toEqual({ status: "draft", approved_by: null });

  // a draft judges nothing: judging again changes nothing
  await page.goto(`/scan/lab/${reportId}`);
  await page
    .getByRole("button", { name: "ประเมินใหม่ด้วยค่าอ้างอิงล่าสุด" })
    .click();
  await expect(page.getByText("ไม่มีรายการที่เปลี่ยนจากเดิม")).toBeVisible();

  // ── doctor sign-off is required (the server refuses without the tick) ──────
  await ap.reload();
  const extra = ap.getByRole("listitem").filter({ hasText: KEY });
  await expect(extra).toContainText("ร่าง (ยังไม่ใช้ตัดสินค่า)");
  await extra
    .getByRole("checkbox", { name: "แพทย์ตรวจและรับรองช่วงค่านี้แล้ว" })
    .check();
  await extra.getByRole("button", { name: "รับรองและเริ่มใช้" }).click();
  // the status chip itself (the edit note under it also says "รับรองแล้ว", so the bare word proves nothing)
  await expect(ap.getByRole("listitem").filter({ hasText: KEY })).toContainText(
    "รับรองแล้ว (ใช้ตัดสินค่าจริง)",
  );
  const approved = (
    await d
      .from("biomarker_extras")
      .select("status, approved_by")
      .eq("key", KEY)
      .single()
  ).data!;
  expect(approved).toEqual({ status: "approved", approved_by: admin.id });
  // the queue entry is closed
  expect(
    (
      await d
        .from("lab_unknown_markers")
        .select("status, resolved_key")
        .eq("normalized_name", NAME.toLowerCase())
        .single()
    ).data,
  ).toEqual({
    status: "resolved",
    resolved_key: KEY,
  });

  // ── now judging again uses it: 7 u/L is inside 1–10 → normal ──────────────
  await page.goto(`/scan/lab/${reportId}`);
  await page
    .getByRole("button", { name: "ประเมินใหม่ด้วยค่าอ้างอิงล่าสุด" })
    .click();
  await expect(page.getByText("มีรายการที่เปลี่ยนไป")).toBeVisible();
  await expect(page.getByText("ปกติ", { exact: true }).first()).toBeVisible();
  const stored = (
    await d.from("lab_reports").select("items").eq("id", reportId).single()
  ).data!.items as { status: string; marker_key: string }[];
  expect(stored[0]).toMatchObject({ status: "normal", marker_key: KEY });

  // ── withdrawing puts it back to a draft ───────────────────────────────────
  await ap.reload();
  await ap
    .getByRole("listitem")
    .filter({ hasText: KEY })
    .getByRole("button", { name: "ถอนการรับรอง" })
    .click();
  await expect(ap.getByRole("listitem").filter({ hasText: KEY })).toContainText(
    "ร่าง (ยังไม่ใช้ตัดสินค่า)",
  );
  await ctx.close();
});
