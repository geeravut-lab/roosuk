import { strToU8, zipSync } from "fflate";
import { expect as baseExpect, test } from "@playwright/test";
import { addDays, bangkokDate } from "../../src/lib/health/dates";
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
 * Live wearables: each source needs its own consent before it may send; a file
 * is read in the browser and only daily figures are sent; the ingestion API
 * takes a per-person token; the plan decides which types are stored; consent can
 * be withdrawn with or without erasing; the data shows on the timeline and in
 * the passport.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const created: string[] = [];
test.afterAll(async () => {
  if (created.length)
    await db().from("privacy_audit_log").delete().in("user_id", created);
  await removeUsers(created);
});

const today = bangkokDate(new Date());
const day = (n: number) => addDays(today, -n);
const apple = (
  d: string,
  t: string,
  kind: string,
  value: string,
  unit = "count",
  src = "iPhone",
) =>
  `<Record type="${kind}" sourceName="${src}" unit="${unit}" creationDate="${d} ${t} +0700" startDate="${d} ${t} +0700" endDate="${d} ${t} +0700" value="${value}"/>`;

test("Premium: consent per source, CSV and Apple imports, manual, timeline, passport, withdraw, erase", async ({
  page,
  browser,
}) => {
  const a = await makeUser(created);
  const d = db();
  await signInAndConsent(page, a);

  await page.goto("/wearables");
  await expect(
    page.getByRole("heading", { level: 1, name: "ข้อมูลจากนาฬิกาและอุปกรณ์" }),
  ).toBeVisible();
  await expect(page.getByText("แพ็กเกจของคุณเก็บทุกชนิด")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // without consent there is nothing to upload with
  await expect(
    page.getByText("เปิดรับข้อมูลจากแหล่งนี้ในหัวข้อด้านบนก่อน"),
  ).toHaveCount(2);
  await expect(page.locator("#wear-csv")).toHaveCount(0);

  // ── CSV: consent, then import ──
  const csvItem = page
    .getByRole("listitem")
    .filter({ hasText: "ไฟล์ CSV" })
    .first();
  await csvItem.getByRole("checkbox").check();
  await csvItem
    .getByRole("button", { name: "เปิดรับข้อมูลจากแหล่งนี้" })
    .click();
  await expect(csvItem.getByText(/เปิดรับแล้วตั้งแต่/)).toBeVisible();
  const csv = [
    "date,type,value",
    `${day(2)},steps,8200`,
    `${day(1)},steps,6400`,
    `${day(2)},resting_heart_rate,61`,
    `${day(1)},sleep_minutes,420`,
    `${day(1)},bp_systolic,118`,
    `${day(1)},steps,not-a-number`,
    `${day(1)},mood,5`,
    `2099-01-01,steps,10`,
  ].join("\n");
  await page.locator("#wear-csv").setInputFiles({
    name: "my.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "นำเข้า" }).last().click();
  // 5 good rows; the future one is turned away; two unreadable ones were skipped before sending
  await expect(
    page.getByText(/นำเข้าแล้ว 5 รายการ · ข้ามไป 1 รายการ/),
  ).toBeVisible();
  const { data: csvRows } = await d
    .from("health_observations")
    .select("type")
    .eq("user_id", a.id)
    .eq("source", "csv");
  expect(csvRows).toHaveLength(5);
  // import twice: the same readings, not new ones
  await page.locator("#wear-csv").setInputFiles({
    name: "my.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "นำเข้า" }).last().click();
  await expect(page.getByText(/นำเข้าแล้ว 5 รายการ/)).toBeVisible();
  expect(
    (
      await d
        .from("health_observations")
        .select("id")
        .eq("user_id", a.id)
        .eq("source", "csv")
    ).data,
  ).toHaveLength(5);

  // ── Apple Health export.zip: only the daily figures leave the page ──
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<HealthData locale="th_TH">`,
    apple(day(3), "08:00:00", "HKQuantityTypeIdentifierStepCount", "4000"),
    apple(day(3), "13:00:00", "HKQuantityTypeIdentifierStepCount", "1500"),
    apple(
      day(3),
      "08:00:00",
      "HKQuantityTypeIdentifierStepCount",
      "5200",
      "count",
      "Apple Watch",
    ),
    apple(
      day(3),
      "09:00:00",
      "HKQuantityTypeIdentifierRestingHeartRate",
      "58",
      "count/min",
      "Apple Watch",
    ),
    apple(day(200), "09:00:00", "HKQuantityTypeIdentifierStepCount", "999"), // outside the 90-day window
    `</HealthData>`,
  ].join("\n");
  const zip = zipSync({ "apple_health_export/export.xml": strToU8(xml) });
  const appleItem = page
    .getByRole("listitem")
    .filter({ hasText: "Apple Health (ไฟล์ export)" })
    .first();
  await appleItem.getByRole("checkbox").check();
  await appleItem
    .getByRole("button", { name: "เปิดรับข้อมูลจากแหล่งนี้" })
    .click();
  await expect(appleItem.getByText(/เปิดรับแล้วตั้งแต่/)).toBeVisible();
  await page.locator("#wear-apple").setInputFiles({
    name: "export.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await page.getByRole("button", { name: "นำเข้า" }).first().click();
  await expect(page.getByText(/นำเข้าแล้ว 2 รายการ/)).toBeVisible();
  const { data: ap } = await d
    .from("health_observations")
    .select("type, value")
    .eq("user_id", a.id)
    .eq("source", "apple_health")
    .order("type");
  expect(ap!.map((r) => [r.type, Number(r.value)])).toEqual([
    ["resting_heart_rate", 58],
    ["steps", 5500], // phone 4000 + 1500 vs watch 5200 → the larger source
  ]);
  // a file that is not an export is refused with a message, nothing stored
  await page.locator("#wear-apple").setInputFiles({
    name: "other.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({ "readme.txt": strToU8("hi") })),
  });
  await page.getByRole("button", { name: "นำเข้า" }).first().click();
  await expect(
    page.getByRole("alert").filter({ hasText: "อ่านไฟล์ไม่ได้" }),
  ).toBeVisible();

  // ── typed in by hand ──
  await page.getByLabel("ชนิด").selectOption("bp_systolic");
  await page.getByLabel("ค่า", { exact: true }).fill("124");
  await page.getByRole("button", { name: "บันทึกค่า" }).click();
  await expect(page.getByText("บันทึกแล้ว")).toBeVisible();
  expect(
    (
      await d
        .from("health_observations")
        .select("id")
        .eq("user_id", a.id)
        .eq("source", "manual")
    ).data,
  ).toHaveLength(1);

  // ── the overview and the timeline both show it ──
  await page.goto("/wearables");
  await expect(
    page.getByRole("heading", { name: "ก้าวเดิน (ก้าว/วัน)" }),
  ).toBeVisible();
  await page.goto("/timeline");
  await expect(
    page.getByRole("heading", { name: "ข้อมูลจากอุปกรณ์" }),
  ).toBeVisible();

  // ── the passport can carry a summary of it ──
  await page.goto("/passport");
  await page.getByLabel("ชื่อลิงก์").fill("พร้อมข้อมูลอุปกรณ์");
  await page.getByLabel("ข้อมูลจากนาฬิกา/อุปกรณ์").check();
  await page.getByLabel(/ฉันเข้าใจว่าผู้ที่มีลิงก์นี้/).check();
  await page.getByRole("button", { name: "สร้างลิงก์" }).click();
  const link = (await page.getByTestId("passport-url").innerText()).trim();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(link);
  await expect(
    p.getByRole("heading", { name: "ข้อมูลจากนาฬิกา/อุปกรณ์" }),
  ).toBeVisible();
  await expect(p.getByText("ก้าวเฉลี่ย/วัน")).toBeVisible();
  await ctx.close();

  // ── withdraw CSV consent AND erase what it sent; Apple data stays ──
  await page.goto("/wearables");
  await csvItem
    .getByRole("button", { name: "ถอนและลบข้อมูลจากแหล่งนี้" })
    .click();
  await expect(csvItem.getByRole("checkbox")).toBeVisible(); // asks for consent again
  expect(
    (
      await d
        .from("health_observations")
        .select("id")
        .eq("user_id", a.id)
        .eq("source", "csv")
    ).data,
  ).toHaveLength(0);
  expect(
    (
      await d
        .from("health_observations")
        .select("id")
        .eq("user_id", a.id)
        .eq("source", "apple_health")
    ).data,
  ).toHaveLength(2);
  // …and a withdrawn source can no longer send
  const { error } = await d
    .from("wearable_sources")
    .select("source")
    .eq("user_id", a.id)
    .eq("source", "csv")
    .is("revoked_at", null);
  expect(error).toBeNull();

  // ── erase everything ──
  await page
    .getByRole("button", { name: "ลบข้อมูลจากอุปกรณ์ทั้งหมดของฉัน" })
    .click();
  await expect(page.getByText("ยังไม่มีข้อมูล")).toBeVisible();
  expect(
    (await d.from("health_observations").select("id").eq("user_id", a.id)).data,
  ).toHaveLength(0);
});

test("the ingestion API: a token, a consent, idempotent re-sends, plan-limited types", async ({
  page,
  request,
}) => {
  const a = await makeUser(created);
  const d = db();
  await signInAndConsent(page, a);
  await page.goto("/wearables");

  // make a token (shown once)
  await page.getByLabel("ชื่อโทเค็น").fill("โทรศัพท์ของฉัน");
  await page.getByRole("button", { name: "สร้างโทเค็น" }).click();
  const token = (await page.getByTestId("ingest-token").innerText()).trim();
  expect(token).toMatch(/^rsk_[A-Za-z0-9_-]{43}$/);
  const { data: stored } = await d
    .from("ingest_tokens")
    .select("token_hash")
    .eq("user_id", a.id);
  expect(JSON.stringify(stored)).not.toContain(token.slice(4));

  const send = (auth: string | null, body: unknown) =>
    request.post("/api/wearables/ingest", {
      headers: auth ? { Authorization: auth } : {},
      data: body,
    });
  const obs = [
    { type: "steps", value: 9000, start: day(1), external_id: "s1" },
    { type: "bp_systolic", value: 120, start: day(1), external_id: "b1" },
  ];

  expect((await send(null, {})).status()).toBe(401);
  expect((await send(`Bearer rsk_${"x".repeat(43)}`, {})).status()).toBe(401);
  // a token alone is not consent
  expect(
    (
      await send(`Bearer ${token}`, { source: "api", observations: obs })
    ).status(),
  ).toBe(403);

  const item = page
    .getByRole("listitem")
    .filter({ hasText: "ผู้ส่งผ่าน API" })
    .first();
  await item.getByRole("checkbox").check();
  await item.getByRole("button", { name: "เปิดรับข้อมูลจากแหล่งนี้" }).click();
  await expect(item.getByText(/เปิดรับแล้วตั้งแต่/)).toBeVisible();

  expect((await send(`Bearer ${token}`, { source: "api" })).status()).toBe(400);
  expect(
    (
      await send(`Bearer ${token}`, { source: "bluetooth", observations: obs })
    ).status(),
  ).toBe(400);
  const ok = await send(`Bearer ${token}`, {
    source: "api",
    observations: obs,
  });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ accepted: 2, rejected: 0, reasons: {} }); // Premium (trial) stores both
  // sending it again changes nothing
  await send(`Bearer ${token}`, { source: "api", observations: obs });
  expect(
    (await d.from("health_observations").select("id").eq("user_id", a.id)).data,
  ).toHaveLength(2);

  // Gold stores the everyday types only
  await d
    .from("profiles")
    .update({
      plan_tier: "gold",
      plan_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      trial_started_at: new Date(Date.now() - 15 * 86_400_000).toISOString(),
    })
    .eq("id", a.id);
  const gold = await send(`Bearer ${token}`, {
    source: "api",
    observations: [
      { type: "steps", value: 7000, start: day(2), external_id: "s2" },
      { type: "bp_systolic", value: 130, start: day(2), external_id: "b2" },
    ],
  });
  expect(await gold.json()).toEqual({
    accepted: 1,
    rejected: 1,
    reasons: { plan: 1 },
  });

  // a cancelled token stops working
  await page.goto("/wearables");
  await page.getByRole("button", { name: "ยกเลิกโทเค็น" }).click();
  await expect(page.getByText("ยกเลิกแล้ว")).toBeVisible();
  expect(
    (
      await send(`Bearer ${token}`, { source: "api", observations: obs })
    ).status(),
  ).toBe(401);
});

test("Free-lite gets the upgrade card, and the API says no", async ({
  page,
  request,
}) => {
  const a = await makeUser(created);
  await endTrial(a.id);
  await signInAndConsent(page, a);
  await page.goto("/wearables");
  await expect(page.getByText("สำหรับแพ็กเกจ Gold ขึ้นไป")).toBeVisible();
  await expect(page.getByLabel("ชื่อโทเค็น")).toHaveCount(0);
  // a token made while it could (directly in the table) is still refused for the plan
  const { createHash, randomBytes } = await import("node:crypto");
  const secret = randomBytes(32).toString("base64url");
  await db()
    .from("ingest_tokens")
    .insert({
      user_id: a.id,
      token_hash: createHash("sha256").update(secret).digest("hex"),
      label: "old",
    });
  await db().from("wearable_sources").insert({ user_id: a.id, source: "api" });
  const r = await request.post("/api/wearables/ingest", {
    headers: { Authorization: `Bearer rsk_${secret}` },
    data: {
      source: "api",
      observations: [{ type: "steps", value: 1, start: day(1) }],
    },
  });
  expect(r.status()).toBe(403);
  expect(((await r.json()) as { error: string }).error).toBe("plan");
});
