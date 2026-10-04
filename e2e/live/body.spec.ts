import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";
import { PNG_1X1, objectExists, putSourceFile } from "./files-util";

/**
 * Live body scan. The AI reading of a real photo is not repeatable here (and no
 * test may need a photo of a person), so scans are seeded as a successful one
 * would write them. What is checked live: who can reach it, every refusal that
 * happens BEFORE any quota or AI use, a photo the model cannot use being refunded,
 * how a result reads, correcting the real weight, kept photo, RLS, timeline and the switch.
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
test.setTimeout(420_000);

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

async function signInAndConsent(
  page: Page,
  email: string,
  password: string,
  photos = false,
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
  if (photos) await page.locator('input[name="consent_photos"]').check();
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
  for (const id of createdIds) {
    const objs = (await d.storage.from("user-sources").list(id)).data ?? [];
    if (objs.length)
      await d.storage
        .from("user-sources")
        .remove(objs.map((o) => `${id}/${o.name}`));
    await d.auth.admin.deleteUser(id);
  }
});

const usedOf = async (userId: string) =>
  (
    await db()
      .from("ai_usage")
      .select("used")
      .eq("user_id", userId)
      .eq("feature", "bodyScan")
  ).data?.reduce((n, r) => n + (r.used as number), 0) ?? 0;

const seedScan = (userId: string, over: Record<string, unknown> = {}) =>
  db()
    .from("body_scans")
    .insert({
      user_id: userId,
      height_cm: 170,
      est_weight_low: 60,
      est_weight_high: 68,
      bmi_low: 20.8,
      bmi_high: 23.5,
      bmi_band: "healthy",
      bmi_basis: "estimated",
      confidence: 0.7,
      face_note: "possible",
      palm_note: "none",
      ...over,
    })
    .select("id");

test("body scan: who can use it, refusals cost nothing, results read right, weight can be corrected", async ({
  page,
  browser,
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
  delete flagsOn.body_scan;
  await d
    .from("platform_settings")
    .update({ feature_flags: flagsOn })
    .eq("id", true);

  const a = await makeUser(); // adult by profile, consents to keeping photos
  const b = await makeUser(); // no profile: must confirm their age
  const m = await makeUser(); // a minor by profile
  expect(
    (
      await d.from("health_profiles").insert([
        { user_id: a.id, birth_year: 1985, sex: "female" },
        { user_id: m.id, birth_year: new Date().getFullYear() - 14 },
      ])
    ).error,
  ).toBeNull();

  await signInAndConsent(page, a.email, a.password, true);

  // ── the hub offers it, the page has a way back, the form is accessible ─────
  await page.goto("/scan");
  await page.getByRole("link", { name: /สแกนร่างกาย/ }).click();
  await expect(page).toHaveURL(/\/scan\/body$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "สแกนร่างกาย" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "กลับไปสแกน" })).toBeVisible();
  // an adult by profile is not asked their age again; the keep question is there (consent given)
  await expect(page.getByLabel("ฉันอายุ 18 ปีขึ้นไป")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: /เก็บไฟล์ต้นฉบับ/ }),
  ).toBeVisible();
  for (const label of [
    "รูปเต็มตัว (จำเป็น)",
    "รูปใบหน้า (ไม่บังคับ)",
    "รูปฝ่ามือ (ไม่บังคับ)",
  ])
    await expect(page.getByRole("group", { name: label })).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // ── refusals before any quota or AI use (browser validation off to prove the server) ─
  await page
    .locator("main form")
    .evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await page.getByLabel("ส่วนสูง (ซม.)").fill("170");
  await page.getByRole("radio", { name: "ไม่เก็บ" }).check();
  await page.getByRole("button", { name: "ประเมินจากรูป" }).click();
  await expect(page.getByText("กรุณาติ๊กรับทราบข้อความก่อนสแกน")).toBeVisible();
  await expect(page.getByLabel("ส่วนสูง (ซม.)")).toHaveValue("170"); // an error does not wipe the form
  await page.getByLabel("ส่วนสูง (ซม.)").fill("90");
  await page
    .getByRole("checkbox", { name: /ฉันเข้าใจว่ารูปถูกส่งให้ AI/ })
    .check();
  await page.getByRole("button", { name: "ประเมินจากรูป" }).click();
  await expect(page.getByText("กรุณาใส่ส่วนสูง 120–230 ซม.")).toBeVisible();
  await page.getByLabel("ส่วนสูง (ซม.)").fill("170");
  await page.getByLabel(/น้ำหนักปัจจุบัน/).fill("5");
  await page.getByRole("button", { name: "ประเมินจากรูป" }).click();
  await expect(page.getByText("กรุณาใส่ส่วนสูง 120–230 ซม.")).toBeVisible();
  await page.getByLabel(/น้ำหนักปัจจุบัน/).fill("");
  await page.getByRole("button", { name: "ประเมินจากรูป" }).click(); // no photo
  await expect(page.getByText("กรุณาเลือกรูปเต็มตัว")).toBeVisible();
  expect(await usedOf(a.id)).toBe(0);

  // a file that is not an image is refused by its bytes
  await page.locator("#photoBody-file").setInputFiles({
    name: "x.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("<?php ?>"),
  });
  await page.getByRole("button", { name: "ประเมินจากรูป" }).click();
  await expect(
    page.getByText("รองรับเฉพาะรูป JPEG, PNG หรือ WebP"),
  ).toBeVisible();
  expect(await usedOf(a.id)).toBe(0);

  // ── a picture the model cannot use: refused, and the use is given back ─────
  await page.locator("#photoBody-file").setInputFiles({
    name: "blank.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await page.getByRole("button", { name: "ประเมินจากรูป" }).click();
  // the model cannot use the picture, or is unavailable: either way an error shows and the use is given back
  await expect(page.locator("main").getByRole("alert")).toBeVisible({
    timeout: 120_000,
  });
  await expect.poll(() => usedOf(a.id), { timeout: 60_000 }).toBe(0);
  // (if a model ever "found" a person in one pixel, the scan would exist: remove it, the rest does not depend on it)
  await d.from("body_scans").delete().eq("user_id", a.id);

  // ── age: unknown must confirm; a minor gets no form ────────────────────────
  const bctx = await browser.newContext();
  const bp = await bctx.newPage();
  await signInAndConsent(bp, b.email, b.password);
  await bp.goto("/scan/body");
  await expect(
    bp.getByRole("checkbox", { name: "ฉันอายุ 18 ปีขึ้นไป" }),
  ).toBeVisible();
  await expect(bp.getByRole("group", { name: /เก็บไฟล์ต้นฉบับ/ })).toHaveCount(
    0,
  ); // no photo consent → pointer, not the question
  await bp
    .locator("main form")
    .evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await bp.getByLabel("ส่วนสูง (ซม.)").fill("165");
  await bp
    .getByRole("checkbox", { name: /ฉันเข้าใจว่ารูปถูกส่งให้ AI/ })
    .check();
  await bp
    .locator("#photoBody-file")
    .setInputFiles({ name: "b.png", mimeType: "image/png", buffer: PNG_1X1 });
  await bp.getByRole("button", { name: "ประเมินจากรูป" }).click();
  await expect(
    bp.getByText("บริการนี้สำหรับผู้ที่อายุ 18 ปีขึ้นไป"),
  ).toBeVisible();
  expect(await usedOf(b.id)).toBe(0);
  const mctx = await browser.newContext();
  const mp = await mctx.newPage();
  await signInAndConsent(mp, m.email, m.password);
  await mp.goto("/scan/body");
  await expect(
    mp.getByText("บริการนี้สำหรับผู้ที่อายุ 18 ปีขึ้นไป"),
  ).toBeVisible();
  await expect(mp.getByRole("button", { name: "ประเมินจากรูป" })).toHaveCount(
    0,
  );
  await mctx.close();

  // ── a seeded result reads right ────────────────────────────────────────────
  const kept = await putSourceFile(d, a.id, "body", "image/png", PNG_1X1);
  const seeded = await seedScan(a.id, { source_file_id: kept.id });
  expect(seeded.error).toBeNull();
  const id = seeded.data![0].id as string;
  await page.goto(`/scan/body/${id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "ผลสแกนร่างกาย" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "กลับไปสแกน" })).toBeVisible();
  await expect(page.getByText("20.8–23.5")).toBeVisible(); // a range, not a made-up exact number
  await expect(
    page.getByText('ระหว่าง "อยู่ในเกณฑ์" ถึง "เกินเกณฑ์เล็กน้อย"'),
  ).toBeVisible();
  await expect(
    page.getByText(/ประเมินจากรูป \(ช่วงโดยประมาณ\) และส่วนสูง 170 ซม\./),
  ).toBeVisible();
  await expect(
    page.getByText("น้ำหนักที่ AI ประเมินจากรูป: ประมาณ 60–68 กก."),
  ).toBeVisible();
  await expect(
    page.getByText("BMI อยู่ในเกณฑ์ที่เหมาะสมสำหรับคนเอเชีย"),
  ).toBeVisible();
  await expect(page.getByText("เกณฑ์สำหรับคนเอเชีย:")).toBeVisible();
  // observations: fixed sentences, with the caveat, and no disease named
  await expect(
    page.getByText("ใบหน้าดูอ่อนล้าในภาพ ลองดูเรื่องการนอนและความเครียด"),
  ).toBeVisible();
  await expect(page.getByText("ไม่พบข้อสังเกตเด่นจากภาพฝ่ามือ")).toBeVisible();
  await expect(
    page.getByText(/ไม่ใช่ผลตรวจ และไม่ได้แปลว่าปกติหรือผิดปกติ/),
  ).toBeVisible();
  await expect(
    page.getByText(/ไม่ใช่การวินิจฉัย และไม่ใช่เป้าหมายที่ต้องทำ/),
  ).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/โลหิตจาง|เบาหวาน|ลดน้ำหนัก|เป้าหมายน้ำหนัก/);
  // the kept body photo is shown (decrypted for the owner)
  await expect(
    page.getByRole("img", { name: "ไฟล์ต้นฉบับที่ใช้วิเคราะห์" }),
  ).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // ── the real weight wins; BMI and band are recomputed by code ──────────────
  await page.getByLabel("ใส่หรือแก้น้ำหนักจริง (กก.)").fill("85");
  await page.getByRole("button", { name: "บันทึกน้ำหนัก" }).click();
  await expect(page.getByText("29.4", { exact: true })).toBeVisible();
  await expect(page.getByText("อยู่ในระดับ: สูงกว่าเกณฑ์")).toBeVisible();
  await expect(
    page.getByText(/คำนวณจากน้ำหนักที่คุณกรอก 85 กก\. และส่วนสูง 170 ซม\./),
  ).toBeVisible();
  await expect(
    page.getByText(/ตรวจสุขภาพพื้นฐาน \(น้ำตาล ไขมัน ความดัน\)/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /สนใจตรวจสุขภาพเชิงลึก/ }),
  ).toBeVisible(); // a health-check pointer, not a diet
  const row = (
    await d
      .from("body_scans")
      .select("weight_kg, bmi_low, bmi_high, bmi_band, bmi_basis")
      .eq("id", id)
      .single()
  ).data!;
  expect(row).toMatchObject({
    weight_kg: 85,
    bmi_low: 29.4,
    bmi_high: 29.4,
    bmi_band: "high",
    bmi_basis: "measured",
  });
  // a nonsense weight is refused and changes nothing
  await page.getByLabel("ใส่หรือแก้น้ำหนักจริง (กก.)").fill("5");
  await page.getByRole("button", { name: "บันทึกน้ำหนัก" }).click();
  await expect(page.getByText("กรุณาใส่ส่วนสูง 120–230 ซม.")).toBeVisible();
  expect(
    (await d.from("body_scans").select("weight_kg").eq("id", id).single()).data!
      .weight_kg,
  ).toBe(85);
  // clearing it goes back to the estimate
  await page.goto(`/scan/body/${id}`);
  await page.getByLabel("ใส่หรือแก้น้ำหนักจริง (กก.)").fill("");
  await page.getByRole("button", { name: "บันทึกน้ำหนัก" }).click();
  await expect(page.getByText("20.8–23.5")).toBeVisible();
  expect(
    (
      await d
        .from("body_scans")
        .select("weight_kg, bmi_basis")
        .eq("id", id)
        .single()
    ).data,
  ).toMatchObject({ weight_kg: null, bmi_basis: "estimated" });

  // ── RLS, timeline, delete the photo, delete the scan ───────────────────────
  expect((await bp.goto(`/scan/body/${id}`))?.status()).toBe(404);
  await page.goto("/timeline");
  await page.getByRole("link", { name: /BMI 20\.8–23\.5/ }).click();
  await expect(page).toHaveURL(/\/scan\/body\/.*from=timeline/);
  await expect(
    page.getByRole("link", { name: "กลับไปไทม์ไลน์" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /ลบไฟล์ต้นฉบับ/ }).click();
  await expect(page.getByRole("heading", { name: "ไฟล์ต้นฉบับ" })).toHaveCount(
    0,
  );
  expect(await objectExists(d, kept.path)).toBe(false);
  await page.getByRole("button", { name: "ลบผลนี้" }).click();
  await expect(page).toHaveURL(/\/timeline/);
  expect((await d.from("body_scans").select("id").eq("id", id)).data).toEqual(
    [],
  );

  // ── the switch removes the page and the hub card ───────────────────────────
  await d
    .from("platform_settings")
    .update({ feature_flags: { ...flagsOn, body_scan: false } })
    .eq("id", true);
  await expect
    .poll(async () => (await page.goto("/scan/body"))?.status(), {
      timeout: 60_000,
    })
    .toBe(404);
  await page.goto("/scan");
  await expect(page.getByRole("link", { name: /สแกนร่างกาย/ })).toHaveCount(0);
  await bctx.close();
});
