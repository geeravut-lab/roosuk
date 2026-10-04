import { expect as baseExpect, test } from "@playwright/test";
import {
  db,
  endTrial,
  liveEnabled,
  makeUser,
  removeUsers,
  seriousViolations,
  signInAndConsent,
} from "./util";

/**
 * Live Health Passport: only a Premium person can make a link; what they did not
 * tick is not in it; the public page needs nothing but the link; only a hash of
 * the secret is stored; cancelled and expired links open nothing; nobody else
 * can see someone's links.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const created: string[] = [];
test.afterAll(() => removeUsers(created));

test("a Premium person makes, shares, watches and cancels a link", async ({
  page,
  browser,
}) => {
  const a = await makeUser(created);
  const d = db();
  await signInAndConsent(page, a);

  // some data to share (and some that must not be)
  const year = new Date().getFullYear() - 40;
  await d.from("health_profiles").insert({
    user_id: a.id,
    birth_year: year,
    sex: "female",
    conditions: ["hypertension"],
    goals: ["sleep"],
  });
  const { data: report } = await d
    .from("lab_reports")
    .insert({
      user_id: a.id,
      status: "confirmed",
      collected_on: "2026-09-02",
      confirmed_at: new Date().toISOString(),
      items: [{ name: "LDL" }],
    })
    .select("id");
  await d.from("lab_results").insert({
    user_id: a.id,
    report_id: report![0].id,
    marker_key: "ldl",
    name: "LDL",
    value: 160,
    unit: "mg/dL",
    status: "abnormal",
    collected_on: "2026-09-02",
  });
  await d.from("source_files").select("id").eq("user_id", a.id); // (touch: documents are not shared in this test)

  await page.goto("/passport");
  await expect(
    page.getByRole("heading", { level: 1, name: "พาสปอร์ตสุขภาพ" }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // the acknowledgement is required: without it nothing is made
  await page.getByLabel("ชื่อลิงก์").fill("ตรวจกับหมอสมชาย");
  await page.getByLabel("ชื่อผู้ป่วยที่จะแสดงบนเอกสาร").fill("คุณทดสอบ");
  await page.getByLabel("ผลตรวจเลือดล่าสุด").check();
  await page.getByLabel("โปรไฟล์สุขภาพ").check();
  await page.getByLabel("สรุปการเช็กอิน 30 วัน").uncheck();
  await page.getByLabel(/ฉันเข้าใจว่าผู้ที่มีลิงก์นี้/).check();
  await page.getByRole("button", { name: "สร้างลิงก์" }).click();

  await expect(page.getByText("สร้างลิงก์แล้ว")).toBeVisible();
  await expect(page.getByRole("img", { name: /QR ของลิงก์/ })).toBeVisible();
  const link = (await page.getByTestId("passport-url").innerText()).trim();
  expect(link).toMatch(/\/p\/[A-Za-z0-9_-]{43}$/);
  const token = link.split("/p/")[1];

  // only a hash is kept, and the snapshot holds what was ticked and nothing else
  const { data: row } = await d
    .from("health_passports")
    .select("token_hash, snapshot, sections, holder_name")
    .eq("user_id", a.id)
    .single();
  expect(JSON.stringify(row)).not.toContain(token);
  expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(row!.sections).toEqual(["profile", "labs"]);
  expect(Object.keys(row!.snapshot).sort()).toEqual([
    "generatedOn",
    "labs",
    "profile",
    "sections",
    "v",
  ]);

  // a stranger with only the link: no sign-in, no app shell
  const ctx = await browser.newContext();
  const stranger = await ctx.newPage();
  await stranger.goto(link);
  await expect(
    stranger.getByRole("heading", { level: 1, name: "พาสปอร์ตสุขภาพ" }),
  ).toBeVisible();
  await expect(stranger.getByText("คุณทดสอบ")).toBeVisible();
  await expect(stranger.getByText("LDL")).toBeVisible();
  await expect(stranger.getByText("160 mg/dL")).toBeVisible();
  await expect(stranger.getByText("ผิดปกติ ควรปรึกษาแพทย์")).toBeVisible();
  await expect(stranger.getByText(/ไม่ใช่ผลวินิจฉัย/)).toBeVisible();
  await expect(stranger.getByText("เช็กอิน", { exact: false })).toHaveCount(0); // check-ins were not ticked
  await expect(stranger.getByRole("navigation")).toHaveCount(0);
  expect(
    await stranger.locator('meta[name="robots"]').getAttribute("content"),
  ).toContain("noindex");
  expect(await seriousViolations(stranger)).toEqual([]);
  // a made-up link, and a malformed one, are plain 404s that say nothing
  expect((await stranger.goto(`/p/${"A".repeat(43)}`))?.status()).toBe(404);
  expect((await stranger.goto("/p/short"))?.status()).toBe(404);

  // the owner sees the view counted, and a copy of what is shown
  await page.goto("/passport");
  await expect(page.getByText("เปิดดู 1 ครั้ง")).toBeVisible();
  await page.getByRole("link", { name: "ดูเนื้อหาที่แชร์" }).click();
  await expect(page.getByText("160 mg/dL")).toBeVisible();
  await page.goBack();

  // cancel: the same link now says so, and nothing else
  await page.getByRole("button", { name: "ยกเลิกลิงก์" }).click();
  await expect(page.getByText("ยกเลิกแล้ว")).toBeVisible();
  await stranger.goto(link);
  await expect(
    stranger.getByText("เจ้าของข้อมูลยกเลิกลิงก์นี้แล้ว"),
  ).toBeVisible();
  await expect(stranger.getByText("160 mg/dL")).toHaveCount(0);

  // expiry: a live link whose time has passed opens nothing
  const { data: second } = await d
    .from("health_passports")
    .select("id")
    .eq("user_id", a.id);
  expect(second).toHaveLength(1);
  await d
    .from("health_passports")
    .update({
      revoked_at: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    })
    .eq("user_id", a.id);
  await stranger.goto(link);
  await expect(stranger.getByText(/ลิงก์หมดอายุแล้ว/)).toBeVisible();
  await ctx.close();

  // a dead link can be removed from the list
  await page.goto("/passport");
  await page.getByRole("button", { name: "ลบออกจากรายการ" }).click();
  await expect(page.getByText("ยังไม่มีลิงก์")).toBeVisible();
});

test("nobody else can open the owner's copy, and Free-lite gets the upgrade card instead of the form", async ({
  page,
}) => {
  const a = await makeUser(created);
  const b = await makeUser(created);
  const { data: mine } = await db()
    .from("health_passports")
    .insert({
      user_id: a.id,
      token_hash: "f".repeat(64),
      label: "A's link",
      sections: ["profile"],
      snapshot: { v: 1, generatedOn: "2026-10-01", sections: ["profile"] },
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select("id");
  await endTrial(b.id);
  await signInAndConsent(page, b);

  expect((await page.goto(`/passport/${mine![0].id}`))?.status()).toBe(404);
  await page.goto("/passport");
  await expect(page.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้างลิงก์" })).toHaveCount(0);
  await expect(page.getByText("A's link")).toHaveCount(0);
});

test("the AI brief is added when asked for, never diagnoses, and is in the link", async ({
  page,
  browser,
}) => {
  const a = await makeUser(created);
  await signInAndConsent(page, a);
  await db()
    .from("health_profiles")
    .insert({
      user_id: a.id,
      birth_year: 1985,
      sex: "male",
      conditions: [],
      goals: ["energy"],
    });
  await page.goto("/passport");
  await page.getByLabel("ชื่อลิงก์").fill("พร้อมสรุป");
  await page.getByLabel("โปรไฟล์สุขภาพ").check();
  await page.getByLabel("ให้ AI เขียนสรุปก่อนพบแพทย์").check();
  await page.getByLabel(/ฉันเข้าใจว่าผู้ที่มีลิงก์นี้/).check();
  await page.getByRole("button", { name: "สร้างลิงก์" }).click();
  await expect(page.getByText("สร้างลิงก์แล้ว")).toBeVisible({
    timeout: 90_000,
  });
  const link = (await page.getByTestId("passport-url").innerText()).trim();

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await expect(p.getByText("สรุปก่อนพบแพทย์ (เขียนโดย AI)")).toBeVisible();
  await expect(p.getByText("ไม่ใช่การวินิจฉัย")).toBeVisible();
  await expect(p.getByText("คำถามที่อาจถามแพทย์")).toBeVisible();
  await ctx.close();

  // the conversation is logged for audit
  const { data: conv } = await db()
    .from("ai_conversations")
    .select("id")
    .eq("user_id", a.id)
    .eq("kind", "doctor_brief");
  expect(conv).toHaveLength(1);
});
