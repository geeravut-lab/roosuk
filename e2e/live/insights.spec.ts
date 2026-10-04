import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live insights on Today: a pattern found by code (score drop, then a worse lab
 * result which outranks it), a next step with a link, an optional AI explanation
 * (a real call: success or unavailable are both accepted, each leaves the
 * database and the allowance consistent), quiet when nothing changed, and the
 * feature switch hides it.
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

let originalFlags: unknown = {};

test.afterAll(async () => {
  const d = db();
  await d
    .from("platform_settings")
    .update({ feature_flags: originalFlags })
    .eq("id", true);
  for (const id of createdIds) await d.auth.admin.deleteUser(id);
});

const day = (offset: number) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);

const checkin = (user_id: string, offset: number, poor: boolean) => ({
  user_id,
  checkin_date: day(offset),
  sleep_band: poor ? 2 : 3,
  activity_band: poor ? 1 : 3,
  energy: poor ? 2 : 4,
  mood: poor ? 2 : 4,
  nutrition: poor ? 2 : 4,
});

test("insights: found by code, a next step, optional AI explanation, quiet when steady, switchable", async ({
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
  const steady = await makeUser();
  const user = await makeUser();

  // ── a steady person: nothing to say ──
  await d
    .from("daily_checkins")
    .insert(
      Array.from({ length: 14 }, (_, i) => checkin(steady.id, -i, false)),
    );
  await signInAndConsent(page, steady.email, steady.password);
  await page.goto("/today");
  await expect(
    page.getByRole("region", {
      name: /ข้อสังเกต|ผลตรวจบางรายการ|คะแนนสัปดาห์นี้|นอนไม่ถึง|อยากให้คุณกลับมา/,
    }),
  ).toHaveCount(0);
  await expect(page.locator("#insight")).toHaveCount(0);

  // ── a week that dropped: the card, a plain fact, a next step ──
  await d
    .from("daily_checkins")
    .insert([
      ...Array.from({ length: 7 }, (_, i) => checkin(user.id, -(i + 7), false)),
      ...Array.from({ length: 7 }, (_, i) => checkin(user.id, -i, true)),
    ]);
  const ctx = await page.context().browser()!.newContext();
  const p = await ctx.newPage();
  await signInAndConsent(p, user.email, user.password);
  await p.goto("/today");
  const card = p.locator("#insight");
  await expect(card).toContainText("คะแนนสัปดาห์นี้ต่ำกว่าสัปดาห์ก่อน");
  await expect(card).toContainText("คะแนนเฉลี่ย");
  await expect(card).toContainText("ไม่ใช่การวินิจฉัย");
  await expect(card.getByRole("link", { name: "ดูไทม์ไลน์" })).toHaveAttribute(
    "href",
    /\/timeline/,
  );
  expect(await serious(p)).toEqual([]);

  // ── the optional AI explanation: either outcome is consistent ──
  await card.getByRole("button", { name: "ให้ AI อธิบายเพิ่ม" }).click();
  await expect(
    p
      .locator("#insight")
      .getByText("AI อธิบายเพิ่ม")
      .or(p.getByRole("alert").filter({ hasText: /\S/ })),
  ).toBeVisible({ timeout: 120_000 });
  const notes = (
    await d.from("insight_notes").select("kind, summary").eq("user_id", user.id)
  ).data!;
  const used = (
    (
      await d
        .from("ai_usage")
        .select("used")
        .eq("user_id", user.id)
        .eq("feature", "aiChat")
    ).data ?? []
  ).reduce((n, r) => n + Number(r.used), 0);
  if (notes.length === 1) {
    expect(notes[0].kind).toBe("score_drop");
    expect(used).toBe(1);
    await expect(p.locator("#insight")).toContainText(
      notes[0].summary.slice(0, 15),
    );
    await expect(p.locator("#insight")).toContainText("ไม่ใช่การวินิจฉัย");
    await expect(
      p.getByRole("button", { name: "ให้ AI อธิบายเพิ่ม" }),
    ).toHaveCount(0); // paid once
    expect(
      (
        (
          await d
            .from("ai_conversations")
            .select("id")
            .eq("user_id", user.id)
            .eq("kind", "insight")
        ).data ?? []
      ).length,
    ).toBe(1);
  } else {
    expect(notes).toHaveLength(0);
    expect(used).toBe(0); // refunded
  }

  // a person cannot write a note themselves
  const c = createClient(url!, anonKey!, { auth: { persistSession: false } });
  expect(
    (
      await c.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await c.from("insight_notes").insert({
        user_id: user.id,
        kind: "score_drop",
        anchor: "x",
        summary: "I wrote this myself.",
      })
    ).error,
  ).not.toBeNull();

  // ── a worse lab result outranks it, and points at the report ──
  const rep = async (collected: string, status: string) => {
    const r = await d
      .from("lab_reports")
      .insert({
        user_id: user.id,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        collected_on: collected,
        items: [
          {
            name: "LDL-C",
            marker_key: "ldl",
            value: 150,
            unit: "mg/dL",
            value_std: 150,
            status,
            printed_range: "",
            confidence: 0.9,
          },
        ],
        model: "test/none",
      })
      .select("id");
    expect(r.error).toBeNull();
    expect(
      (
        await d.from("lab_results").insert({
          user_id: user.id,
          report_id: r.data![0].id,
          marker_key: "ldl",
          name: "LDL-C",
          value: 150,
          unit: "mg/dL",
          value_std: 150,
          status,
          collected_on: collected,
        })
      ).error,
    ).toBeNull();
    return r.data![0].id as string;
  };
  await rep(day(-150), "normal");
  const newest = await rep(day(-20), "watch");
  await p.goto("/today");
  const lab = p.locator("#insight");
  await expect(lab).toContainText("ผลตรวจบางรายการเปลี่ยนไปจากครั้งก่อน");
  await expect(lab).toContainText("ไขมันเลว");
  await expect(lab).not.toContainText("150"); // names, never values
  await expect(lab.getByRole("link", { name: "ดูผลตรวจ" })).toHaveAttribute(
    "href",
    new RegExp(`/scan/lab/${newest}`),
  );
  await expect(lab).toContainText("พูดคุยกับแพทย์");

  // ── the switch hides it ──
  expect(
    (
      await d
        .from("platform_settings")
        .update({ feature_flags: { insights: false } })
        .eq("id", true)
    ).error,
  ).toBeNull();
  await expect
    .poll(
      async () => {
        await p.goto("/today");
        return await p.locator("#insight").count();
      },
      { timeout: 70_000 },
    )
    .toBe(0);
  await ctx.close();
});
