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
 * Live AI Health Agent (real model calls): Premium only; it can read the
 * person's own records and set a reminder (which lands in the table, is listed
 * and can be cancelled); emergency words never reach a model; every exchange and
 * every tool use is logged; Free-lite gets the upgrade card.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const created: string[] = [];
test.afterAll(() => removeUsers(created));

const today = bangkokDate(new Date());

test("the chat shows what the agent did, lists its reminders and lets the person cancel them (no model)", async ({
  page,
}) => {
  const a = await makeUser(created);
  const d = db();
  await signInAndConsent(page, a);
  const { data: conv } = await d
    .from("ai_conversations")
    .insert({ user_id: a.id, kind: "agent" })
    .select("id");
  const cid = conv![0].id;
  const tomorrow = addDays(today, 1);
  await d.from("ai_messages").insert([
    {
      conversation_id: cid,
      user_id: a.id,
      role: "user",
      content: "เตือนฉันพรุ่งนี้ให้ไปตรวจเลือด",
    },
    {
      conversation_id: cid,
      user_id: a.id,
      role: "assistant",
      flag: "tool",
      content: `set_reminder: ${tomorrow} · ไปตรวจเลือด`,
    },
    {
      conversation_id: cid,
      user_id: a.id,
      role: "assistant",
      content: "ตั้งเตือนให้แล้วค่ะ",
      model: "test/none",
    },
  ]);
  await d
    .from("agent_reminders")
    .insert({ user_id: a.id, remind_on: tomorrow, text: "ไปตรวจเลือด" });

  await page.goto("/agent");
  await expect(page.getByText("ตั้งเตือนให้แล้วค่ะ")).toBeVisible();
  // what it did is shown as a quiet line, not as something the assistant said
  await expect(
    page.getByText(`ตั้งเตือนแล้ว — ${tomorrow} · ไปตรวจเลือด`),
  ).toBeVisible();
  await expect(page.getByText(/ไม่วินิจฉัย|วินิจฉัย/).first()).toBeVisible();
  const rem = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "เตือนที่รออยู่" }) });
  await expect(rem.getByText("ไปตรวจเลือด")).toBeVisible();
  await rem.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(rem.getByText(/ยังไม่มีเตือนที่รออยู่/)).toBeVisible();
  expect(
    (await d.from("agent_reminders").select("id").eq("user_id", a.id)).data,
  ).toHaveLength(0);

  // someone else's reminder cannot be cancelled through this person's session, even with its id in the form
  const b = await makeUser(created);
  const { data: theirs } = await d
    .from("agent_reminders")
    .insert({ user_id: b.id, remind_on: tomorrow, text: "ของคนอื่น" })
    .select("id");
  await d
    .from("agent_reminders")
    .insert({ user_id: a.id, remind_on: tomorrow, text: "ของฉัน" });
  await page.goto("/agent");
  await page.evaluate((id) => {
    document.querySelector<HTMLInputElement>(
      'section input[name="id"]',
    )!.value = id;
  }, theirs![0].id);
  await page.getByRole("button", { name: "ยกเลิก" }).click();
  await page.waitForLoadState("networkidle");
  expect(
    (await d.from("agent_reminders").select("id").eq("id", theirs![0].id)).data,
  ).toHaveLength(1);
});

test("real model: the agent reads the person's records, sets a reminder on request, and logs what it did", async ({
  page,
}) => {
  const a = await makeUser(created);
  const d = db();
  await signInAndConsent(page, a);
  await d.from("daily_checkins").insert(
    [0, 1, 2, 3, 4].map((i) => ({
      user_id: a.id,
      checkin_date: addDays(today, -i),
      sleep_band: 3,
      activity_band: 2,
      energy: 4,
      mood: 4,
      nutrition: 3,
    })),
  );

  await page.goto("/agent");
  await expect(
    page.getByRole("heading", { level: 1, name: "ผู้ช่วยสุขภาพ AI (Agent)" }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  // a suggestion fills the box
  await page.getByRole("button", { name: "สรุปเดือนนี้ให้หน่อย" }).click();
  await expect(page.getByLabel("พิมพ์ข้อความถึงผู้ช่วย…")).toHaveValue(
    "สรุปเดือนนี้ให้หน่อย",
  );

  // ── a question about the person's own data ──
  await page
    .getByLabel("พิมพ์ข้อความถึงผู้ช่วย…")
    .fill("ช่วงนี้ฉันเช็กอินสม่ำเสมอแค่ไหน ดูจากข้อมูลของฉันให้หน่อย");
  await page.getByRole("button", { name: "ส่ง" }).click();
  const reply = page
    .locator("ol[aria-label] > li.card")
    .filter({ hasText: "ผู้ช่วย" })
    .last();
  const outage = page
    .getByRole("alert")
    .filter({ hasText: "ระบบ AI ใช้งานไม่ได้ชั่วคราว" });
  await expect(reply.or(outage)).toBeVisible({ timeout: 120_000 });
  // The sandbox's Gemini key is on the free tier (a few requests a day). A spent quota is not a product bug:
  // say so and skip, instead of failing or passing silently. The loop itself is unit-tested with a scripted model.
  test.skip(
    await outage.isVisible(),
    "the AI provider is out of quota right now",
  );
  await expect(reply.getByText(/ไม่ใช่การวินิจฉัย|วินิจฉัย/)).toBeVisible(); // the disclaimer under every answer

  // ── a reminder, asked for in plain words ──
  const tomorrow = addDays(today, 1);
  await page
    .getByLabel("พิมพ์ข้อความถึงผู้ช่วย…")
    .fill("เตือนฉันพรุ่งนี้ให้ไปตรวจเลือดตามนัดด้วยนะ");
  await page.getByRole("button", { name: "ส่ง" }).click();
  await expect(page.getByText("ตั้งเตือนแล้ว").first()).toBeVisible({
    timeout: 120_000,
  });
  const { data: rem } = await d
    .from("agent_reminders")
    .select("remind_on, text, notified_at")
    .eq("user_id", a.id);
  expect(rem).toHaveLength(1);
  expect(rem![0].remind_on).toBe(tomorrow);
  expect(rem![0].notified_at).toBeNull();
  // it is listed, and can be cancelled
  await page.reload();
  const remSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "เตือนที่รออยู่" }) });
  await expect(remSection.getByRole("listitem")).toHaveCount(1);
  await remSection.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(remSection.getByText(/ยังไม่มีเตือนที่รออยู่/)).toBeVisible();
  expect(
    (await d.from("agent_reminders").select("id").eq("user_id", a.id)).data,
  ).toHaveLength(0);

  // ── everything is in the audit log: both sides, tool uses flagged, a model named ──
  const { data: conv } = await d
    .from("ai_conversations")
    .select("id")
    .eq("user_id", a.id)
    .eq("kind", "agent");
  expect(conv).toHaveLength(1);
  const { data: msgs } = await d
    .from("ai_messages")
    .select("role, flag, model")
    .eq("conversation_id", conv![0].id)
    .order("id");
  expect(msgs!.filter((m) => m.role === "user")).toHaveLength(2);
  expect(msgs!.some((m) => m.flag === "tool")).toBe(true);
  expect(
    msgs!
      .filter((m) => m.role === "assistant" && m.flag !== "tool")
      .every((m) => !!m.model),
  ).toBe(true);
});

test("emergency words never reach the model and cost nothing", async ({
  page,
}) => {
  const a = await makeUser(created);
  await signInAndConsent(page, a);
  await page.goto("/agent");
  await page
    .getByLabel("พิมพ์ข้อความถึงผู้ช่วย…")
    .fill("ฉันปวดหน้าอกมากและหายใจไม่ออก");
  await page.getByRole("button", { name: "ส่ง" }).click();
  await expect(page.getByText(/โทร 1669|1669/).first()).toBeVisible();
  const { data: msgs } = await db()
    .from("ai_messages")
    .select("flag, model")
    .eq("user_id", a.id);
  expect(msgs!.every((m) => m.model === null)).toBe(true);
  expect(msgs!.some((m) => m.flag === "medical_emergency")).toBe(true);
  const { data: used } = await db()
    .from("ai_usage")
    .select("used")
    .eq("user_id", a.id);
  expect(used ?? []).toHaveLength(0);
});

test("Free-lite gets the upgrade card, not the agent", async ({ page }) => {
  const a = await makeUser(created);
  await endTrial(a.id);
  await signInAndConsent(page, a);
  await page.goto("/agent");
  await expect(page.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible();
  await expect(page.getByLabel("พิมพ์ข้อความถึงผู้ช่วย…")).toHaveCount(0);
});
