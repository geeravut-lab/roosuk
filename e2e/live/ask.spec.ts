import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live Ask My Health + lab explanation against the REAL Supabase project (see
 * auth-flow.spec.ts for the rules). Emergency and self-harm messages are
 * deterministic (no model is involved). The ordinary question and the lab
 * explanation DO reach a real provider, so those steps assert whichever
 * outcome occurs — an answer (stored, counted, with the disclaimer) or a clean
 * failure (nothing stored, the use refunded, the question kept).
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

const used = async (d: SupabaseClient, userId: string) =>
  (
    (
      await d
        .from("ai_usage")
        .select("used")
        .eq("user_id", userId)
        .eq("feature", "aiChat")
    ).data ?? []
  ).reduce((s, r) => s + r.used, 0);

test("ask: emergency and self-harm bypass the model; a normal question is answered or cleanly refunded; history, RLS, new conversation; lab explanation", async ({
  page,
}) => {
  const d = db();
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  await page.goto("/ask");
  await expect(
    page.getByRole("heading", { level: 1, name: "ถามรู้สุข" }),
  ).toBeVisible();
  await expect(page.getByText("ยังไม่มีบทสนทนา")).toBeVisible();
  expect(await serious(page)).toEqual([]);

  const ask = async (text: string) => {
    await page.getByLabel("พิมพ์คำถามของคุณ…").fill(text);
    await page.getByRole("button", { name: "ถาม", exact: true }).click();
  };

  // ── emergency: fixed message, no model, no quota ───────────────────────────
  await ask("ปวดหน้าอกมากและหายใจไม่ออก");
  await expect(page.getByText(/โทร 1669/).first()).toBeVisible();
  await expect(page.getByLabel("พิมพ์คำถามของคุณ…")).toHaveValue("");
  expect(await used(d, user.id)).toBe(0);
  const conv = (
    await d.from("ai_conversations").select("id, kind").eq("user_id", user.id)
  ).data!;
  expect(conv).toHaveLength(1);
  expect(conv[0].kind).toBe("chat");
  let msgs = (
    await d
      .from("ai_messages")
      .select("role, content, flag, model")
      .eq("conversation_id", conv[0].id)
      .order("id")
  ).data!;
  expect(msgs.map(({ role, flag, model }) => ({ role, flag, model }))).toEqual([
    { role: "user", flag: "medical_emergency", model: null },
    { role: "assistant", flag: "medical_emergency", model: null },
  ]);

  // ── self-harm: a person-first message with the hotline ─────────────────────
  await ask("ช่วงนี้อยากตายไปเลย");
  await expect(page.getByText(/สายด่วนสุขภาพจิต 1323/).first()).toBeVisible();
  expect(await used(d, user.id)).toBe(0);
  expect(
    (
      await d
        .from("ai_messages")
        .select("flag")
        .eq("conversation_id", conv[0].id)
        .eq("role", "assistant")
        .order("id")
    ).data!.map((m) => m.flag),
  ).toEqual(["medical_emergency", "self_harm"]);

  // ── a normal question reaches a real provider ──────────────────────────────
  const question =
    "ค่าน้ำตาลในเลือดหลังอดอาหารคืออะไร และทำไมถึงต้องอดอาหารก่อนเจาะ";
  await ask(question);
  const alert = page
    .getByRole("alert")
    .filter({ hasText: /ใช้งานไม่ได้ชั่วคราว/ });
  const answer = page.getByText("คำตอบนี้เป็นข้อมูลทั่วไป").nth(2); // the 3rd assistant reply carries the disclaimer
  await expect(alert.or(answer).first()).toBeVisible({ timeout: 90_000 });
  msgs = (
    await d
      .from("ai_messages")
      .select("role, content, model, flag")
      .eq("conversation_id", conv[0].id)
      .order("id")
  ).data!;
  if (await alert.isVisible()) {
    // failed cleanly: nothing stored, use refunded, the question is still in the box
    expect(msgs).toHaveLength(4);
    expect(await used(d, user.id)).toBe(0);
    await expect(page.getByLabel("พิมพ์คำถามของคุณ…")).toHaveValue(question);
  } else {
    expect(msgs).toHaveLength(6);
    expect(msgs[4]).toMatchObject({ role: "user", content: question });
    expect(msgs[5].role).toBe("assistant");
    expect(msgs[5].model).toMatch(/^(anthropic|google)\//);
    expect(msgs[5].content.length).toBeGreaterThan(10);
    expect(await used(d, user.id)).toBe(1);
  }
  expect(await serious(page)).toEqual([]);

  // ── RLS with a real JWT ────────────────────────────────────────────────────
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await c.auth.signInWithPassword(user)).error).toBeNull();
  expect(((await c.from("ai_messages").select("id")).data ?? []).length).toBe(
    msgs.length,
  );
  expect(
    (
      await c.from("ai_messages").insert({
        conversation_id: conv[0].id,
        user_id: user.id,
        role: "assistant",
        content: "forged",
      })
    ).error,
  ).not.toBeNull();
  expect(
    (
      await c
        .from("ai_messages")
        .update({ content: "edited" })
        .eq("conversation_id", conv[0].id)
        .select("id")
    ).error,
  ).not.toBeNull();
  const other = await makeUser();
  const c2 = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c2.auth.signInWithPassword(other);
  expect((await c2.from("ai_messages").select("id")).data).toEqual([]);

  // ── new conversation: the screen clears, history stays ─────────────────────
  await page.getByRole("button", { name: "เริ่มสนทนาใหม่" }).click();
  await expect(page.getByText("ยังไม่มีบทสนทนา")).toBeVisible();
  expect(
    (await d.from("ai_conversations").select("id").eq("user_id", user.id)).data,
  ).toHaveLength(2);
  expect(
    (await d.from("ai_messages").select("id").eq("conversation_id", conv[0].id))
      .data,
  ).toHaveLength(msgs.length);

  // ── lab explanation (real provider; either outcome is valid) ───────────────
  const items = [
    {
      name: "FBS",
      marker_key: "fasting_glucose",
      value: 104,
      unit: "mg/dL",
      value_std: 104,
      status: "watch",
      printed_range: "70-99",
      confidence: 0.95,
    },
    {
      name: "LDL-C",
      marker_key: "ldl",
      value: 170,
      unit: "mg/dL",
      value_std: 170,
      status: "abnormal",
      printed_range: "",
      confidence: 0.95,
    },
  ];
  const rep = await d
    .from("lab_reports")
    .insert({
      user_id: user.id,
      status: "confirmed",
      collected_on: "2026-09-01",
      confirmed_at: new Date().toISOString(),
      items,
    })
    .select("id");
  expect(rep.error).toBeNull();
  const reportId = rep.data![0].id;
  const before = await used(d, user.id);
  await page.goto(`/scan/lab/${reportId}`);
  await page.getByRole("button", { name: "อธิบายผลด้วย AI" }).click();
  const explained = page.getByRole("heading", { name: "คำอธิบายจาก AI" });
  const failed = page
    .getByRole("alert")
    .filter({ hasText: /ใช้งานไม่ได้ชั่วคราว/ });
  await expect(explained.or(failed).first()).toBeVisible({ timeout: 90_000 });
  const stored = (
    await d
      .from("lab_reports")
      .select("explanation, explained_at")
      .eq("id", reportId)
      .single()
  ).data!;
  if (await failed.isVisible()) {
    expect(stored.explanation).toBeNull();
    expect(await used(d, user.id)).toBe(before);
    await expect(
      page.getByRole("button", { name: "อธิบายผลด้วย AI" }),
    ).toBeVisible();
  } else {
    expect(stored.explanation).toBeTruthy();
    expect(await used(d, user.id)).toBe(before + 1);
    await expect(
      page.getByText(/ไม่ใช่การวินิจฉัยหรือคำแนะนำทางการแพทย์/).first(),
    ).toBeVisible();
    await expect(page.getByText("มีค่าที่ควรให้แพทย์ช่วยแปลผล")).toBeVisible(); // an abnormal value forces it
    await expect(
      page.getByRole("button", { name: "อธิบายผลด้วย AI" }),
    ).toHaveCount(0);
    const log = (
      await d
        .from("ai_conversations")
        .select("id, kind, report_id")
        .eq("user_id", user.id)
        .eq("kind", "lab_explain")
    ).data!;
    expect(log).toEqual([expect.objectContaining({ report_id: reportId })]);
  }
  // statuses are the code-decided ones either way
  await expect(page.getByText("ผิดปกติ ควรปรึกษาแพทย์").first()).toBeVisible();
  expect(await serious(page)).toEqual([]);

  // the user cannot write an explanation themselves
  expect(
    (
      await c
        .from("lab_reports")
        .update({
          explanation: { summary: "forged", items: {}, seeDoctor: false },
        })
        .eq("id", reportId)
        .select("id")
    ).error,
  ).not.toBeNull();
});
