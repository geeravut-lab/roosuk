import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live timeline: charts over a chosen period, the type filter, a trend chart per
 * lab test (needs 2+ results), and the plan window capping how far back it shows
 * (older data is hidden, never deleted).
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

const day = (offset: number) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

test("timeline: score/kcal/lab-trend charts, period + type filters, plan window", async ({
  page,
}) => {
  const d = db();
  const user = await makeUser();

  // 40 days of check-ins every other day, two meals, two lab reports with the same tests
  const checkins = Array.from({ length: 20 }, (_, i) => ({
    user_id: user.id,
    checkin_date: day(-2 * i),
    sleep_band: 3,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  }));
  expect((await d.from("daily_checkins").insert(checkins)).error).toBeNull();
  for (const [i, kcal] of [450, 600].entries())
    expect(
      (
        await d.from("meal_logs").insert({
          user_id: user.id,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          meal_date: day(-i),
          kcal,
          protein_g: 10,
          carbs_g: 50,
          fat_g: 10,
          items: [{ name: `ข้าวผัด${i}`, kcal }],
          model: "test/none",
        })
      ).error,
    ).toBeNull();

  const mkReport = async (collected: string, ldl: number, status: string) => {
    const r = await d
      .from("lab_reports")
      .insert({
        user_id: user.id,
        status: "confirmed",
        collected_on: collected,
        confirmed_at: new Date().toISOString(),
        items: [
          {
            name: "LDL-C",
            marker_key: "ldl",
            value: ldl,
            unit: "mg/dL",
            value_std: ldl,
            status,
            printed_range: "",
            confidence: 0.95,
          },
        ],
        model: "test/none",
      })
      .select("id");
    expect(r.error).toBeNull();
    expect(
      (
        await d.from("lab_results").insert([
          {
            user_id: user.id,
            report_id: r.data![0].id,
            marker_key: "ldl",
            name: "LDL-C",
            value: ldl,
            unit: "mg/dL",
            value_std: ldl,
            status,
            collected_on: collected,
          },
          {
            user_id: user.id,
            report_id: r.data![0].id,
            marker_key: "hba1c",
            name: "HbA1c",
            value: 5.4,
            unit: "%",
            value_std: 5.4,
            status: "normal",
            collected_on: collected,
          },
        ])
      ).error,
    ).toBeNull();
  };
  await mkReport(day(-20), 150, "watch");
  await mkReport(day(-3), 120, "normal");

  await signInAndConsent(page, user.email, user.password);
  await page.goto("/timeline");

  // ── charts render with a text alternative ─────────────────────────────────
  const score = page.getByRole("region", { name: "คะแนนรายวัน" });
  await expect(score.getByRole("img")).toBeVisible();
  await score.getByText("ดูเป็นตัวเลข").click();
  await expect(score.getByRole("table")).toBeVisible();
  await expect(score.getByRole("row")).toHaveCount(1 + 15); // header + the 15 check-ins inside 30 days (every other day, today incl.)
  await expect(
    page
      .getByRole("region", { name: /พลังงานจากมื้อที่บันทึก/ })
      .getByRole("img"),
  ).toBeVisible();

  // ── lab trend: LDL is picked first (2 results), HbA1c too; abnormal-free here ─
  const trend = page.getByRole("region", { name: "แนวโน้มผลตรวจ" });
  await expect(trend.getByRole("img")).toBeVisible();
  await trend.getByRole("link", { name: /LDL/ }).click();
  await expect(page).toHaveURL(/marker=ldl/);
  await trend.getByText("ดูเป็นตัวเลข").click();
  await expect(trend.getByRole("row", { name: /150/ })).toContainText(
    "ควรติดตาม",
  );
  await expect(trend.getByRole("row", { name: /120/ })).toContainText("ปกติ");
  await trend.getByRole("link", { name: /HbA1c/ }).click();
  await expect(page).toHaveURL(/marker=hba1c/);
  await expect(
    page.getByRole("region", { name: "แนวโน้มผลตรวจ" }).getByRole("img"),
  ).toBeVisible();

  // ── period: 7 days shows fewer check-ins; the choice survives a filter change ─
  await page.getByRole("link", { name: "7 วัน" }).click();
  await expect(page).toHaveURL(/range=7/);
  await page.getByRole("link", { name: "7 วัน" }).waitFor();
  const list7 = page.getByRole("region", { name: "ประวัติเช็กอิน" });
  await expect(list7.getByRole("listitem")).toHaveCount(4); // today, -2, -4, -6
  await page.getByRole("link", { name: "มื้ออาหาร", exact: true }).click();
  await expect(page).toHaveURL(/range=7.*type=meal|type=meal.*range=7/);
  await expect(
    page.getByRole("region", { name: "ประวัติเช็กอิน" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /450/ })).toBeVisible();
  await page.getByRole("link", { name: "ผลตรวจ", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "แนวโน้มผลตรวจ" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "คะแนนรายวัน" })).toHaveCount(
    0,
  );

  // junk params are ignored, not an error
  expect(
    (
      await page.goto("/timeline?range=abc&type=zzz&marker=__proto__")
    )?.status(),
  ).toBe(200);
  await expect(page.getByRole("region", { name: "คะแนนรายวัน" })).toBeVisible();

  // ── accessibility ─────────────────────────────────────────────────────────
  await page.goto("/timeline");
  expect(await serious(page)).toEqual([]);

  // ── plan window: a Free-lite user (trial over) sees 30 days at most; 1 year chip absent ─
  const past = new Date(Date.now() - 86_400_000).toISOString();
  expect(
    (await d.from("profiles").update({ trial_ends_at: past }).eq("id", user.id))
      .error,
  ).toBeNull();
  await d.from("daily_checkins").insert({
    user_id: user.id,
    checkin_date: day(-50),
    sleep_band: 3,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  });
  await page.goto("/timeline?range=365");
  await expect(page.getByRole("link", { name: "1 ปี" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "90 วัน" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "30 วัน" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByText(/เก็บไว้อย่างปลอดภัย|อัปเกรดเพื่อดู/).first(),
  ).toBeVisible();
  // …and nothing was deleted
  expect(
    (
      await d
        .from("daily_checkins")
        .select("checkin_date")
        .eq("user_id", user.id)
    ).data,
  ).toHaveLength(21);
});
