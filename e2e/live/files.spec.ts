import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";
import {
  BUCKET,
  PDF_MIN,
  PNG_1X1,
  objectExists,
  putSourceFile,
} from "./files-util";

/**
 * Live "keep the original file": the question on both scan forms, the consent
 * gate, the decrypting route (owner only, never cached), what is really stored
 * (ciphertext), removing just the file / the whole report, and the orphan sweep.
 * No AI call: reports and meals are seeded like a successful scan writes them,
 * with files sealed by the same crypto the app uses.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;
const cronSecret = process.env.CRON_SECRET;

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

async function signInAndConsent(
  page: Page,
  email: string,
  password: string,
  withPhotos: boolean,
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
  if (withPhotos) await page.locator('input[name="consent_photos"]').check();
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
  for (const id of createdIds) {
    const objs = (await d.storage.from(BUCKET).list(id)).data ?? [];
    if (objs.length)
      await d.storage.from(BUCKET).remove(objs.map((o) => `${id}/${o.name}`));
    await d.auth.admin.deleteUser(id);
  }
});

const labItems = [
  {
    name: "FBS",
    marker_key: "fasting_glucose",
    value: 104,
    unit: "mg/dL",
    value_std: 104,
    status: "watch",
    basis: "catalog",
    printed_range: "70-99",
    confidence: 1,
  },
];

async function seedReport(d: SupabaseClient, userId: string, fileId: string) {
  const { data, error } = await d
    .from("lab_reports")
    .insert({
      user_id: userId,
      status: "confirmed",
      collected_on: "2026-09-01",
      confirmed_at: new Date().toISOString(),
      items: labItems,
      source_file_id: fileId,
    })
    .select("id");
  expect(error).toBeNull();
  return data![0].id as string;
}

test("keep the original: asked every time, consent-gated, sealed at rest, owner-only, removable", async ({
  page,
  browser,
}) => {
  const d = db();
  const a = await makeUser(); // consents to photos/files
  const b = await makeUser(); // does not
  const strangerCtx = await browser.newContext();
  const stranger = await strangerCtx.newPage();

  await signInAndConsent(page, a.email, a.password, true);
  await signInAndConsent(stranger, b.email, b.password, false);

  // ── the question on both scan forms ───────────────────────────────────────
  for (const path of ["/scan/food", "/scan/lab"]) {
    await page.goto(path);
    const group = page.getByRole("group", {
      name: "เก็บไฟล์ต้นฉบับไว้ดูย้อนหลังไหม?",
    });
    await expect(group).toBeVisible();
    // no pre-selected answer
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(group.getByRole("radio")).toHaveCount(2);
    expect(await serious(page)).toEqual([]);
  }
  // without the consent there is no question — a pointer to Settings instead
  await stranger.goto("/scan/food");
  await expect(
    stranger.getByRole("group", { name: /เก็บไฟล์ต้นฉบับ/ }),
  ).toHaveCount(0);
  await expect(
    stranger.getByRole("link", { name: "ไปที่ตั้งค่า" }),
  ).toBeVisible();

  // The server refuses a scan with no answer, and refuses "keep" without the consent —
  // both BEFORE any quota or AI call. (The form's own validation is bypassed on purpose.)
  await page.goto("/scan/food");
  await page.locator("#photo").setInputFiles({
    name: "meal.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await page
    .locator("main form")
    .first()
    .evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await page.getByRole("button", { name: "วิเคราะห์อาหาร" }).click();
  await expect(
    page.getByText("กรุณาเลือกว่าจะเก็บไฟล์ต้นฉบับไว้หรือไม่"),
  ).toBeVisible();
  // the refusal does not throw the chosen photo away
  expect(
    await page
      .locator("#photo")
      .evaluate((i: HTMLInputElement) => i.files?.length),
  ).toBe(1);

  await stranger.goto("/scan/lab");
  await stranger.locator("#file").setInputFiles({
    name: "r.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await stranger
    .locator('input[name="keepFile"]')
    .evaluate((i: HTMLInputElement) => (i.value = "keep"));
  await stranger
    .locator("main form")
    .evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await stranger.getByRole("button", { name: "อ่านผลตรวจ" }).click();
  await expect(
    stranger.getByText("ตอนนี้ยังเก็บไฟล์ต้นฉบับไม่ได้"),
  ).toBeVisible();

  // ── seed a kept image on a lab report and a kept PDF on another ───────────
  const img = await putSourceFile(d, a.id, "lab", "image/png", PNG_1X1);
  const pdf = await putSourceFile(d, a.id, "lab", "application/pdf", PDF_MIN);
  const imgReport = await seedReport(d, a.id, img.id);
  const pdfReport = await seedReport(d, a.id, pdf.id);

  // At rest it is ciphertext: sealed header, no trace of the PNG signature.
  const raw = Buffer.from(
    await (await d.storage.from(BUCKET).download(img.path)).data!.arrayBuffer(),
  );
  expect(raw.subarray(0, 4).toString()).toBe("RSF1");
  expect(raw.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);

  // ── the report page shows the original, decrypted for the owner ───────────
  await page.goto(`/scan/lab/${imgReport}`);
  const shown = page.getByRole("img", { name: "ไฟล์ต้นฉบับที่ใช้วิเคราะห์" });
  await expect(shown).toBeVisible();
  await expect(shown).toHaveAttribute("src", `/api/files/${img.id}`);
  await expect
    .poll(() => shown.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(1);
  await expect(page.getByText("เข้ารหัสไว้ เปิดดูได้เฉพาะคุณ")).toBeVisible();
  expect(await serious(page)).toEqual([]);
  await page.goto(`/scan/lab/${pdfReport}`);
  await expect(
    page.getByRole("link", { name: "เปิดไฟล์ PDF ต้นฉบับ" }),
  ).toHaveAttribute("href", `/api/files/${pdf.id}`);

  // ── the route: owner gets the bytes, never cached; everyone else a 404/401 ─
  const ok = await page.request.get(`/api/files/${img.id}`);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  expect(ok.headers()["cache-control"]).toContain("no-store");
  expect(ok.headers()["x-content-type-options"]).toBe("nosniff");
  expect(Buffer.from(await ok.body()).equals(PNG_1X1)).toBe(true);
  const pdfRes = await page.request.get(`/api/files/${pdf.id}`);
  expect(pdfRes.headers()["content-type"]).toBe("application/pdf");
  expect(Buffer.from(await pdfRes.body()).equals(PDF_MIN)).toBe(true);

  expect((await stranger.request.get(`/api/files/${img.id}`)).status()).toBe(
    404,
  );
  const anon = await browser.newContext();
  expect((await anon.request.get(`/api/files/${img.id}`)).status()).toBe(401);
  await anon.close();
  expect((await page.request.get("/api/files/not-a-uuid")).status()).toBe(404);
  expect(
    (await page.request.get(`/api/files/${crypto.randomUUID()}`)).status(),
  ).toBe(404);

  // another user cannot see the report page's file either (RLS: no report, no file)
  expect((await stranger.goto(`/scan/lab/${imgReport}`))?.status()).toBe(404);

  // ── remove only the file: the report stays, the object is gone ────────────
  await page.goto(`/scan/lab/${imgReport}`);
  await page.getByRole("button", { name: /ลบไฟล์ต้นฉบับ/ }).click();
  await expect(page.getByRole("heading", { name: "ไฟล์ต้นฉบับ" })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("น้ำตาลในเลือดหลังอดอาหาร").first(),
  ).toBeVisible();
  expect(await objectExists(d, img.path)).toBe(false);
  expect(
    (await d.from("source_files").select("id").eq("id", img.id)).data,
  ).toHaveLength(0);
  expect((await page.request.get(`/api/files/${img.id}`)).status()).toBe(404);

  // ── deleting the whole report removes its file too ────────────────────────
  await page.goto(`/scan/lab/${pdfReport}`);
  await page.getByRole("button", { name: /ลบ/ }).last().click();
  await expect(page).toHaveURL(/\/timeline/);
  expect(await objectExists(d, pdf.path)).toBe(false);

  // ── a meal's photo, and the orphan sweep ──────────────────────────────────
  const food = await putSourceFile(d, a.id, "food", "image/png", PNG_1X1);
  const meal = await d
    .from("meal_logs")
    .insert({
      user_id: a.id,
      source_file_id: food.id,
      meal_date: "2026-10-10",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      items: [{ name: "pad thai", servings: 1 }],
      kcal: 500,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
    })
    .select("id");
  expect(meal.error).toBeNull();
  await page.goto(`/scan/food/${meal.data![0].id}`);
  await expect(
    page.getByRole("img", { name: "ไฟล์ต้นฉบับที่ใช้วิเคราะห์" }),
  ).toBeVisible();

  const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const orphan = await putSourceFile(
    d,
    a.id,
    "food",
    "image/png",
    PNG_1X1,
    old,
  );
  if (cronSecret) {
    const tick = await page.request.post("/api/cron/notify", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(tick.status()).toBe(200);
    expect(await objectExists(d, orphan.path)).toBe(false); // swept
    expect(await objectExists(d, food.path)).toBe(true); // still referenced: kept
  }

  await strangerCtx.close();
});
