import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";
import { BUCKET, PDF_MIN, objectExists, putSourceFile } from "./files-util";

/**
 * Live Health Vault: documents are uploaded with a title and category, sealed at
 * rest, open for their owner only, counted against the plan (Free-lite 5),
 * deletable (object and row), listed next to scan files, and NEVER removed by
 * the orphan sweep.
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

test("health vault: upload, sealed, owner-only, plan limit, delete, sweep leaves documents alone", async ({
  page,
  browser,
}) => {
  const d = db();
  const noConsent = await makeUser();
  const a = await makeUser();

  // ── without the photo/file consent there is no form, only a pointer ──
  const ctx0 = await browser.newContext();
  const p0 = await ctx0.newPage();
  await signInAndConsent(p0, noConsent.email, noConsent.password, false);
  await p0.goto("/vault");
  await expect(p0.getByText(/ต้องยินยอมเรื่องรูปภาพ/)).toBeVisible();
  await expect(p0.getByLabel("ชื่อเอกสาร")).toHaveCount(0);
  await ctx0.close();

  // ── upload a PDF ──
  await signInAndConsent(page, a.email, a.password, true);
  await page.goto("/vault");
  await expect(
    page.getByRole("heading", { level: 1, name: "แฟ้มสุขภาพของฉัน" }),
  ).toBeVisible();
  await expect(page.getByText("เก็บแล้ว 0 ไฟล์ (ไม่จำกัด)")).toBeVisible(); // trial = Premium
  expect(await serious(page)).toEqual([]);

  const upload = async (
    name: string,
    mime: string,
    body: Buffer,
    title: string,
    date = "",
  ) => {
    await page
      .getByLabel(/^ไฟล์ \(PDF/)
      .setInputFiles({ name, mimeType: mime, buffer: body });
    await page.getByLabel("ชื่อเอกสาร").fill(title);
    await page.getByLabel("ประเภท").selectOption("doctor_note");
    await page.getByLabel(/^วันที่ในเอกสาร/).fill(date);
    await page.getByRole("button", { name: "เก็บเข้าแฟ้ม" }).click();
  };

  // not a PDF/image: refused, and the typed title stays
  await upload(
    "x.pdf",
    "application/pdf",
    Buffer.from("<?php echo 1;"),
    "ผิดไฟล์",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: /PDF/ }),
  ).toBeVisible();
  await expect(page.getByLabel("ชื่อเอกสาร")).toHaveValue("ผิดไฟล์");
  // a future date is refused by the server (browser validation off)
  await page
    .locator("main form")
    .first()
    .evaluate((f) => f.setAttribute("novalidate", ""));
  await upload(
    "note.pdf",
    "application/pdf",
    PDF_MIN,
    "ใบรับรองแพทย์",
    "2999-01-01",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: /วันที่ไม่ถูกต้อง/ }),
  ).toBeVisible();
  expect(
    ((await d.from("source_files").select("id").eq("user_id", a.id)).data ?? [])
      .length,
  ).toBe(0);

  await upload(
    "note.pdf",
    "application/pdf",
    PDF_MIN,
    "ใบรับรองแพทย์",
    "2026-09-30",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "เก็บเข้าแฟ้มแล้ว" }),
  ).toBeVisible();
  await expect(page.getByLabel("ชื่อเอกสาร")).toHaveValue(""); // cleared after success
  const doc = page.getByRole("listitem").filter({ hasText: "ใบรับรองแพทย์" });
  await expect(doc).toContainText("ใบรับรอง/บันทึกแพทย์");
  await expect(doc).toContainText("เอกสารลงวันที่");
  await expect(page.getByText("เก็บแล้ว 1 ไฟล์ (ไม่จำกัด)")).toBeVisible();

  const row = (
    await d
      .from("source_files")
      .select("id, kind, title, category, doc_date, object_path")
      .eq("user_id", a.id)
      .single()
  ).data!;
  expect(row).toMatchObject({
    kind: "doc",
    title: "ใบรับรองแพทย์",
    category: "doctor_note",
    doc_date: "2026-09-30",
  });
  // sealed at rest: the stored object is not the PDF
  const stored = await d.storage.from(BUCKET).download(row.object_path);
  expect(
    Buffer.from(await stored.data!.arrayBuffer())
      .subarray(0, 5)
      .toString(),
  ).not.toBe("%PDF-");
  // the owner gets the PDF back; a stranger gets nothing
  const mine = await page.request.get(`/api/files/${row.id}`);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toBe("application/pdf");
  expect((await mine.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const strangerCtx = await browser.newContext();
  const stranger = await makeUser();
  const sp = await strangerCtx.newPage();
  await signInAndConsent(sp, stranger.email, stranger.password, true);
  expect((await sp.request.get(`/api/files/${row.id}`)).status()).toBe(404);
  await sp.goto("/vault");
  await expect(sp.getByText(/ยังไม่มีเอกสาร/)).toBeVisible();
  await strangerCtx.close();

  // ── scan files are listed too (not counted), with a link to the result ──
  const lab = await putSourceFile(d, a.id, "lab", "application/pdf", PDF_MIN);
  const rep = await d
    .from("lab_reports")
    .insert({
      user_id: a.id,
      source_file_id: lab.id,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      collected_on: "2026-09-01",
      items: [
        {
          name: "LDL-C",
          marker_key: "ldl",
          value: 120,
          unit: "mg/dL",
          value_std: 120,
          status: "normal",
          printed_range: "",
          confidence: 0.9,
        },
      ],
      model: "test/none",
    })
    .select("id");
  expect(rep.error).toBeNull();
  await page.goto("/vault");
  const scans = page.getByRole("region", { name: "ไฟล์ที่เก็บไว้กับผลสแกน" });
  await expect(scans).toContainText("ผลตรวจ");
  await expect(scans.getByRole("link", { name: "ดูผลสแกน" })).toHaveAttribute(
    "href",
    /\/scan\/lab\/.*from=vault/,
  );
  await expect(page.getByText("เก็บแล้ว 1 ไฟล์ (ไม่จำกัด)")).toBeVisible();

  // ── the orphan sweep never touches a document ──
  const old = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const oldDoc = await putSourceFile(
    d,
    a.id,
    "doc",
    "application/pdf",
    PDF_MIN,
    old,
    { title: "เก่า", category: "other" },
  );
  if (cronSecret) {
    const tick = await page.request.post("/api/cron/notify", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(tick.status()).toBe(200);
    expect(await objectExists(d, oldDoc.path)).toBe(true);
    expect(
      (
        (await d.from("source_files").select("id").eq("id", oldDoc.id)).data ??
        []
      ).length,
    ).toBe(1);
  }

  // ── plan limit: Free-lite keeps 5 documents ──
  expect(
    (
      await d
        .from("profiles")
        .update({
          trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
        })
        .eq("id", a.id)
    ).error,
  ).toBeNull();
  await page.goto("/vault");
  await expect(page.getByText("ใช้ไป 2 จาก 5 ไฟล์")).toBeVisible();
  for (const i of [3])
    await putSourceFile(d, a.id, "doc", "application/pdf", PDF_MIN, undefined, {
      title: `เอกสาร ${i}`,
      category: "other",
    });
  await page.reload();
  await upload("n.pdf", "application/pdf", PDF_MIN, "ที่สี่"); // 3 → 4: allowed
  await expect(
    page.getByRole("status").filter({ hasText: "เก็บเข้าแฟ้มแล้ว" }),
  ).toBeVisible();
  // now someone fills it behind the open form: the server still refuses
  await putSourceFile(d, a.id, "doc", "application/pdf", PDF_MIN, undefined, {
    title: "แทรก",
    category: "other",
  });
  await upload("n2.pdf", "application/pdf", PDF_MIN, "ที่ห้า");
  await expect(
    page.getByRole("alert").filter({ hasText: /แฟ้มเต็มแล้ว/ }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(/แฟ้มเต็มแล้ว ลบไฟล์เก่า/)).toBeVisible();
  await expect(page.getByLabel("ชื่อเอกสาร")).toHaveCount(0);

  // ── delete removes the object and the row; scan files have no delete here ──
  await page
    .getByRole("listitem")
    .filter({ hasText: "ใบรับรองแพทย์" })
    .getByRole("button", { name: "ลบเอกสารนี้" })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "ใบรับรองแพทย์" }),
  ).toHaveCount(0);
  expect(await objectExists(d, row.object_path)).toBe(false);
  expect(
    ((await d.from("source_files").select("id").eq("id", row.id)).data ?? [])
      .length,
  ).toBe(0);
  await expect(scans.getByRole("button", { name: "ลบเอกสารนี้" })).toHaveCount(
    0,
  );
});
