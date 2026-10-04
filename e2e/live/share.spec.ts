import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live share cards: the public quiz card (only plausible numbers), the owner-only
 * lab-summary and meal cards, the preview + share button on the result pages, and
 * that an actual share is counted. No AI call; results are seeded.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.E2E_LIVE === "1" && !!url && !!anonKey && !!serviceKey;

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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const isPng = (b: Buffer) => b.subarray(0, 4).equals(PNG_SIGNATURE);
const item = (status: string, marker: string) => ({
  name: marker,
  marker_key: null,
  value: 5,
  unit: "mg/dL",
  value_std: null,
  status,
  basis: null,
  printed_range: "",
  confidence: 1,
});

test("share cards: public quiz card, owner-only lab and meal cards, preview + share, counted", async ({
  page,
  browser,
}) => {
  const d = db();

  // ── the quiz card is public, and draws only plausible numbers ──────────────
  const ok = await page.request.get(
    "/api/share/quiz?score=78&health=38&real=41",
  );
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/png");
  expect(isPng(Buffer.from(await ok.body()))).toBe(true);
  const en = await page.request.get(
    "/api/share/quiz?score=78&health=38&real=41&lang=en",
  );
  expect(
    Buffer.from(await en.body()).equals(Buffer.from(await ok.body())),
  ).toBe(false); // a different language, a different card
  for (const bad of [
    "score=999&health=38&real=41",
    "score=90&health=10&real=60",
    "score=abc&health=38&real=41",
    "health=38&real=41",
    "",
  ])
    expect(
      (await page.request.get(`/api/share/quiz?${bad}`)).status(),
      bad,
    ).toBe(400);

  // ── seeded results ─────────────────────────────────────────────────────────
  const a = await makeUser();
  const b = await makeUser();
  const confirmed = {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  };
  const lab = await d
    .from("lab_reports")
    .insert({
      user_id: a.id,
      ...confirmed,
      collected_on: "2026-09-01",
      items: [
        item("normal", "ZZ-SECRET-ONE"),
        item("watch", "ZZ-SECRET-TWO"),
        item("unknown", "ZZ-SECRET-THREE"),
      ],
    })
    .select("id");
  const labOnlyUnknown = await d
    .from("lab_reports")
    .insert({
      user_id: a.id,
      ...confirmed,
      collected_on: "2026-09-02",
      items: [item("unknown", "x")],
    })
    .select("id");
  const labDraft = await d
    .from("lab_reports")
    .insert({ user_id: a.id, status: "draft", items: [item("normal", "x")] })
    .select("id");
  const meal = await d
    .from("meal_logs")
    .insert({
      user_id: a.id,
      meal_date: "2026-10-10",
      ...confirmed,
      items: ["ผัดไทย", "ส้มตำ"].map((name) => ({
        name,
        catalog_key: null,
        servings: 1,
        source: "ai",
        confidence: 0.9,
        per_serving: { kcal: 300, protein_g: 5, carbs_g: 40, fat_g: 8 },
      })),
      kcal: 612,
      protein_g: 1,
      carbs_g: 1,
      fat_g: 1,
    })
    .select("id");
  for (const r of [lab, labOnlyUnknown, labDraft, meal])
    expect(r.error).toBeNull();
  const labId = lab.data![0].id;
  const mealId = meal.data![0].id;

  await signInAndConsent(page, a.email, a.password);

  // ── lab page: the preview is the card, the card is a PNG for the owner ─────
  await page.goto(`/scan/lab/${labId}`);
  await expect(
    page.getByRole("heading", { name: "การ์ดสำหรับแชร์" }),
  ).toBeVisible();
  const labImg = page.getByRole("img", { name: "ตัวอย่างการ์ดที่จะแชร์" });
  await expect(labImg).toHaveAttribute(
    "src",
    new RegExp(`^/api/share/lab/${labId}`),
  );
  await expect
    .poll(() => labImg.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 30_000,
    })
    .toBe(1080);
  await expect(
    page.getByText("การ์ดนี้ไม่มีชื่อ ค่าตรวจ รูป หรือข้อมูลส่วนตัวของคุณ"),
  ).toBeVisible();
  expect(await serious(page)).toEqual([]);

  const card = await page.request.get(`/api/share/lab/${labId}`);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(card.headers()["cache-control"]).toContain("no-store");
  const cardBytes = Buffer.from(await card.body());
  expect(isPng(cardBytes)).toBe(true);
  // nothing from the report is printed into the card as text metadata
  expect(cardBytes.includes("ZZ-SECRET")).toBe(false);

  // not for everyone else, nor for what is not a finished, assessed report
  const bctx = await browser.newContext();
  const bp = await bctx.newPage();
  await signInAndConsent(bp, b.email, b.password);
  expect((await bp.request.get(`/api/share/lab/${labId}`)).status()).toBe(404);
  expect((await bp.request.get(`/api/share/food/${mealId}`)).status()).toBe(
    404,
  );
  await bctx.close();
  const anon = await browser.newContext();
  expect(
    (
      await anon.request.get(
        `${page.url().split("/scan")[0]}/api/share/lab/${labId}`,
      )
    ).status(),
  ).toBe(401);
  await anon.close();
  expect(
    (
      await page.request.get(`/api/share/lab/${labOnlyUnknown.data![0].id}`)
    ).status(),
  ).toBe(404);
  expect(
    (await page.request.get(`/api/share/lab/${labDraft.data![0].id}`)).status(),
  ).toBe(404);
  expect((await page.request.get("/api/share/lab/not-a-uuid")).status()).toBe(
    404,
  );

  // a report with nothing assessed offers no card
  await page.goto(`/scan/lab/${labOnlyUnknown.data![0].id}`);
  await expect(
    page.getByRole("heading", { name: "การ์ดสำหรับแชร์" }),
  ).toHaveCount(0);

  // ── share: Chromium headless cannot open a share sheet, so the card is saved ─
  await page.goto(`/scan/lab/${labId}`);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "แชร์การ์ดนี้" }).click();
  expect((await download).suggestedFilename()).toBe("roosuk-lab-summary.png");
  await expect(page.getByText("บันทึกรูปการ์ดลงเครื่องแล้ว")).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await d
            .from("product_events")
            .select("detail")
            .eq("user_id", a.id)
            .eq("event", "share_made")
        ).data,
    )
    .toEqual([{ detail: "lab" }]); // the share was counted — the preview was not

  // ── meal page ──────────────────────────────────────────────────────────────
  await page.goto(`/scan/food/${mealId}`);
  const foodImg = page.getByRole("img", { name: "ตัวอย่างการ์ดที่จะแชร์" });
  await foodImg.scrollIntoViewIfNeeded(); // lazy-loaded: it loads when it comes into view
  await expect
    .poll(() => foodImg.evaluate((el: HTMLImageElement) => el.naturalWidth), {
      timeout: 30_000,
    })
    .toBe(1080);
  const food = await page.request.get(`/api/share/food/${mealId}`);
  expect(food.status()).toBe(200);
  expect(isPng(Buffer.from(await food.body()))).toBe(true);
});
