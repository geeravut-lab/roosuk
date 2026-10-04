import { removeAdminNoticesSince } from "./cleanup";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live challenges: start alone from a template, one open per template, invite a
 * friend by code or link (two people, early only, not when full), progress of
 * both is shown, finishing pays the admin's amount once, and nobody can write
 * challenges themselves. (A past window is created through the same SQL
 * function with an earlier "today" so finishing needs no future check-ins.)
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

// Every step crosses the network to Supabase (and the sandbox proxy): wait longer than the 5 s default.
const expect = baseExpect.configure({ timeout: 20_000 });

const startedAt = new Date(Date.now() - 5_000).toISOString();

test.skip(
  !enabled,
  "set E2E_LIVE=1 (and the Supabase env vars) to run the live suite",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
// Real network round trips (and two signed-in browsers): give the test and its cleanup room.
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
  const d = db();
  await removeAdminNoticesSince(d, startedAt);
  if (createdIds.length) {
    await d.from("challenges").delete().in("created_by", createdIds);
    await d.from("app_notifications").delete().in("user_id", createdIds);
    for (const id of createdIds) await d.auth.admin.deleteUser(id);
  }
});

const day = (offset: number) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const rows = (id: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    user_id: id,
    checkin_date: day(from + i),
    sleep_band: 3,
    activity_band: 2,
    energy: 4,
    mood: 4,
    nutrition: 3,
  }));
const balance = async (id: string) =>
  (
    (await db().from("reward_ledger").select("amount_thb").eq("user_id", id))
      .data ?? []
  ).reduce((n, r) => n + r.amount_thb, 0);

test("challenges: solo, finishing pays once, friend by code, limits, no writes", async ({
  page,
  browser,
}) => {
  const d = db();
  const reward = Number(
    (
      await d
        .from("platform_settings")
        .select("reward_challenge_thb")
        .eq("id", true)
        .single()
    ).data?.reward_challenge_thb ?? 15,
  );
  const a = await makeUser();
  const b = await makeUser();
  const c = await makeUser();

  await signInAndConsent(page, a.email, a.password);
  await page.goto("/challenges");
  await expect(
    page.getByRole("heading", { level: 1, name: "ชาเลนจ์" }),
  ).toBeVisible();
  await expect(page.getByText(/ไม่เกี่ยวกับน้ำหนักหรือรูปร่าง/)).toBeVisible();
  await expect(page.getByText("ยังไม่มีชาเลนจ์ที่กำลังทำ")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // ── start alone from a template; the same one cannot be opened twice ──
  const card = (name: string) =>
    page
      .getByRole("region", { name: "เริ่มชาเลนจ์ใหม่" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name }) });
  await card("เช็กอินทุกวันใน 7 วัน")
    .getByRole("button", { name: "ทำคนเดียว" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "เริ่มชาเลนจ์แล้ว" }),
  ).toBeVisible();
  const active = page.getByRole("region", { name: "กำลังทำอยู่" });
  await expect(active).toContainText("เช็กอินทุกวันใน 7 วัน");
  await expect(active).toContainText("คุณ 0 จาก 7");
  await expect(card("เช็กอินทุกวันใน 7 วัน")).toContainText(
    "กำลังทำชาเลนจ์นี้อยู่",
  );
  const open = (
    await d
      .from("challenge_participants")
      .select("challenge_id")
      .eq("user_id", a.id)
  ).data!;
  expect(open).toHaveLength(1);
  const solo = (
    await d
      .from("challenges")
      .select("template, mode, target, starts_on, ends_on, invite_code")
      .eq("id", open[0].challenge_id)
      .single()
  ).data!;
  expect(solo).toMatchObject({
    template: "streak7",
    mode: "solo",
    target: 7,
    starts_on: day(0),
    ends_on: day(6),
    invite_code: null,
  });

  // ── finishing: a past window (through the same SQL function), 10 check-in days → the reward, once ──
  const started = await d.rpc("start_challenge", {
    p_user: a.id,
    p_template: "days10of14",
    p_mode: "solo",
    p_metric: "checkin_days",
    p_target: 10,
    p_days: 14,
    p_today: day(-9),
  });
  expect((started.data as { ok: boolean }).ok).toBe(true);
  await d.from("daily_checkins").insert(rows(a.id, -9, 0));
  expect(await balance(a.id)).toBe(0);
  await page.goto("/today"); // the visit completes it
  await expect.poll(() => balance(a.id)).toBe(reward > 0 ? reward : 0);
  await page.goto("/today");
  expect(await balance(a.id)).toBe(reward > 0 ? reward : 0); // once
  if (reward > 0)
    expect(
      (
        (
          await d
            .from("app_notifications")
            .select("title")
            .eq("user_id", a.id)
            .eq("kind", "reward_earned")
        ).data ?? []
      ).length,
    ).toBe(1);
  await page.goto("/challenges");
  await expect(page.getByRole("region", { name: "ที่ผ่านมา" })).toContainText(
    "สำเร็จแล้ว",
  );
  await expect(
    page.getByRole("region", { name: "กำลังทำอยู่" }),
  ).not.toContainText("เช็กอิน 10 วันใน 14 วัน");

  // ── a friend challenge: a code and a link, the friend joins, both progress shown ──
  await card("บันทึกมื้ออาหาร 7 วันใน 14 วัน")
    .getByRole("button", { name: "ชวนเพื่อน" })
    .click();
  const inviteText = await page
    .locator("p.tracking-widest")
    .first()
    .textContent();
  const code = (inviteText ?? "").replace(/.*:\s*/, "").trim();
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
  await expect(
    page.getByText(new RegExp(`/challenges\\?join=${code}$`)),
  ).toBeVisible();

  const ctxB = await browser.newContext();
  const pb = await ctxB.newPage();
  await signInAndConsent(pb, b.email, b.password);
  await pb.goto(`/challenges?join=${code.toLowerCase()}`);
  await expect(pb.getByLabel("รหัสชาเลนจ์ของเพื่อน")).toHaveValue(code); // prefilled from the link
  await pb.getByRole("button", { name: "เข้าร่วม", exact: true }).click();
  await expect(
    pb.getByRole("status").filter({ hasText: "เข้าร่วมชาเลนจ์ของเพื่อนแล้ว" }),
  ).toBeVisible();
  await expect(pb.getByRole("region", { name: "กำลังทำอยู่" })).toContainText(
    "บันทึกมื้ออาหาร 7 วันใน 14 วัน",
  );
  await ctxB.close();

  await page.goto("/challenges");
  await expect(page.getByRole("region", { name: "กำลังทำอยู่" })).toContainText(
    "ทั้งคู่ทำสำเร็จก็ได้เครดิตทั้งคู่",
  );

  // a third person finds it full; a junk code is refused
  const ctxC = await browser.newContext();
  const pc = await ctxC.newPage();
  await signInAndConsent(pc, c.email, c.password);
  await pc.goto(`/challenges?join=${code}`);
  await pc.getByRole("button", { name: "เข้าร่วม", exact: true }).click();
  await expect(
    pc.getByRole("alert").filter({ hasText: "ครบ 2 คนแล้ว" }),
  ).toBeVisible();
  await pc.getByLabel("รหัสชาเลนจ์ของเพื่อน").fill("ZZZZZZZ");
  await pc.getByRole("button", { name: "เข้าร่วม", exact: true }).click();
  await expect(
    pc.getByRole("alert").filter({ hasText: "รหัสไม่ถูกต้อง" }),
  ).toBeVisible();
  await ctxC.close();

  // ── nobody can write challenges themselves ──
  const cl = createClient(url!, anonKey!, { auth: { persistSession: false } });
  expect(
    (await cl.auth.signInWithPassword({ email: a.email, password: a.password }))
      .error,
  ).toBeNull();
  expect(
    (
      await cl
        .from("challenge_participants")
        .update({ completed_at: new Date().toISOString() })
        .eq("user_id", a.id)
        .select("challenge_id")
    ).data ?? [],
  ).toHaveLength(0);
  expect(
    (await cl.rpc("evaluate_challenges", { p_user: a.id, p_today: day(0) }))
      .error,
  ).not.toBeNull();
  expect(
    (
      await cl.rpc("start_challenge", {
        p_user: a.id,
        p_template: "streak7",
        p_mode: "solo",
        p_metric: "checkin_days",
        p_target: 7,
        p_days: 7,
        p_today: day(0),
      })
    ).error,
  ).not.toBeNull();
});
