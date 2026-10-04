import { randomInt } from "node:crypto";
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
 * Live corporate plan and creator toolkit. Corporate: the admin adds a company; an
 * employee joins with its code and has the company's plan only while it is active
 * and in date; the company sees anonymous group figures only from people who opted
 * in and only when at least 5 did. Creators: the admin names one with a code of
 * their own; their page shows their link and numbers; the code really brings
 * referrals.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const tag = `E2E${Date.now().toString(36).toUpperCase()}`;
const created: string[] = [];
const today = bangkokDate(new Date());
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const slug = () =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    "",
  );

test.afterAll(async () => {
  const d = db();
  await d.from("companies").delete().like("name", `${tag}%`);
  if (created.length)
    await d.from("privacy_audit_log").delete().in("user_id", created);
  await removeUsers(created);
});

test("corporate: add a company, join by code, the plan follows the company, anonymous figures need 5 who agreed", async ({
  page,
  browser,
}) => {
  const d = db();
  const admin = await makeUser(
    created,
    `e2e-corpadm-${Date.now()}@example.test`,
  );
  await d.from("admins").insert({ user_id: admin.id });
  const e1 = await makeUser(created);
  const e2 = await makeUser(created);
  const e3 = await makeUser(created);
  await Promise.all([e1, e2, e3].map((u) => endTrial(u.id)));
  await signInAndConsent(page, admin);

  // ── the admin adds a company ──
  await page.goto("/admin/corporate");
  expect(await seriousViolations(page)).toEqual([]);
  const add = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "เพิ่มองค์กร" }) });
  await add.getByLabel("ชื่อองค์กร").fill(`${tag} Co`);
  await add.getByLabel("จำนวนที่นั่ง").fill("2");
  await add.getByLabel(/ใช้ได้ถึงวันที่/).fill(addDays(today, 30));
  await add.getByRole("button", { name: "เพิ่มองค์กร" }).click();
  await expect(add.getByText("บันทึกแล้ว")).toBeVisible();
  await page.reload();
  const code = (await page.getByTestId(`code-${tag} Co`).innerText())
    .replace("รหัสองค์กร: ", "")
    .trim();
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);
  // a date in the past is refused
  await add.getByLabel("ชื่อองค์กร").fill(`${tag} Past`);
  await add.getByLabel("จำนวนที่นั่ง").fill("2");
  await add.getByLabel(/ใช้ได้ถึงวันที่/).fill(addDays(today, -1));
  await add.getByRole("button", { name: "เพิ่มองค์กร" }).click();
  await expect(add.getByRole("alert")).toContainText("ข้อมูลองค์กรไม่ถูกต้อง");

  // ── an employee with no plan joins; the company's plan lifts them ──
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await signInAndConsent(p1, e1);
  await p1.goto("/passport");
  await expect(p1.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible();
  await p1.goto("/company");
  await p1
    .getByLabel("รหัสองค์กร", { exact: true })
    .fill(`  ${code.toLowerCase()} `);
  await p1.getByRole("button", { name: "เข้าร่วมองค์กร" }).click();
  await expect(p1.getByText("เข้าร่วมองค์กรแล้ว")).toBeVisible();
  await expect(p1.getByText(`${tag} Co`)).toBeVisible();
  await expect(p1.getByText(/สิทธิ์ที่ได้: Premium จนถึง/)).toBeVisible();
  await p1.goto("/passport");
  await expect(p1.getByRole("button", { name: "สร้างลิงก์" })).toBeVisible();

  // the second takes the last seat, the third finds it full, and nonsense is nonsense
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await signInAndConsent(p2, e2);
  await p2.goto("/company");
  await p2.getByLabel("รหัสองค์กร", { exact: true }).fill(code);
  await p2.getByRole("button", { name: "เข้าร่วมองค์กร" }).click();
  await expect(p2.getByText("เข้าร่วมองค์กรแล้ว")).toBeVisible();
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await signInAndConsent(p3, e3);
  await p3.goto("/company");
  await p3.getByLabel("รหัสองค์กร", { exact: true }).fill(code);
  await p3.getByRole("button", { name: "เข้าร่วมองค์กร" }).click();
  await expect(
    p3.getByRole("alert").filter({ hasText: "ที่นั่งขององค์กรเต็มแล้ว" }),
  ).toBeVisible();
  await p3.getByLabel("รหัสองค์กร", { exact: true }).fill("ZZZZZZZ");
  await p3.getByRole("button", { name: "เข้าร่วมองค์กร" }).click();
  await expect(
    p3.getByRole("alert").filter({ hasText: "ไม่พบรหัสองค์กรนี้" }),
  ).toBeVisible();
  await ctx3.close();
  await ctx2.close();

  // ── group figures: the person's own switch, off until ticked ──
  await p1.goto("/company");
  await expect(p1.getByText("ตอนนี้: ไม่นับรวม")).toBeVisible();
  await p1
    .getByRole("checkbox", { name: /ฉันยินยอมให้นับข้อมูลของฉัน/ })
    .check();
  await p1.getByRole("button", { name: "บันทึก" }).click();
  await expect(p1.getByText("ตอนนี้: นับรวมอยู่")).toBeVisible();
  const companyId = (
    await d.from("companies").select("id").eq("name", `${tag} Co`).single()
  ).data!.id;
  expect(
    (
      await d
        .from("company_members")
        .select("share_stats")
        .eq("user_id", e1.id)
        .single()
    ).data!.share_stats,
  ).toBe(true);
  await d.from("company_members").delete().eq("company_id", companyId); // start the figures clean
  await d.from("companies").update({ seats: 10 }).eq("id", companyId);

  // four people who agreed → no figures at all; the fifth → figures, still no names
  const crowd = await Promise.all(
    Array.from({ length: 5 }, () => makeUser(created)),
  );
  const seat = (u: { id: string }) =>
    d
      .from("company_members")
      .insert({ company_id: companyId, user_id: u.id, share_stats: true });
  for (const u of crowd.slice(0, 4)) await seat(u);
  await page.goto("/admin/corporate");
  await expect(page.getByText("ยินยอมให้นับสถิติ 4 คน")).toBeVisible();
  await expect(page.getByText(/น้อยกว่า 5 คน จึงไม่แสดงตัวเลข/)).toBeVisible();
  await expect(page.getByText(/ตัวเลขรวม \(7 วันล่าสุด\)/)).toHaveCount(0);
  await seat(crowd[4]);
  await d.from("daily_checkins").insert(
    crowd.slice(0, 3).map((u) => ({
      user_id: u.id,
      checkin_date: today,
      sleep_band: 3,
      activity_band: 2,
      energy: 4,
      mood: 4,
      nutrition: 3,
    })),
  );
  await page.reload();
  await expect(page.getByText(/เช็กอินอย่างน้อย 1 วัน 60%/)).toBeVisible();
  for (const u of crowd) await expect(page.getByText(u.email)).toHaveCount(0); // nobody is named

  // ── the company switched off or out of date: back to the person's own plan ──
  await seat(e1);
  await p1.goto("/passport");
  await expect(p1.getByRole("button", { name: "สร้างลิงก์" })).toBeVisible();
  await d.from("companies").update({ active: false }).eq("id", companyId);
  await p1.goto("/passport");
  await expect(p1.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible();
  await p1.goto("/company");
  await expect(
    p1.getByText(/ตอนนี้สิทธิ์ขององค์กรไม่ได้ใช้งานอยู่/),
  ).toBeVisible();
  await d
    .from("companies")
    .update({ active: true, valid_until: addDays(today, -1) })
    .eq("id", companyId);
  await p1.goto("/passport");
  await expect(p1.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible(); // in date is part of "active"

  // ── leaving ──
  await p1.goto("/company");
  await p1.getByRole("button", { name: "ออกจากองค์กร" }).click();
  await expect(p1.getByText("ออกจากองค์กรแล้ว")).toBeVisible();
  expect(
    (await d.from("company_members").select("user_id").eq("user_id", e1.id))
      .data,
  ).toHaveLength(0);
  await ctx1.close();
});

test("creators: the admin names one with their own code; their page shows link and numbers; the code brings referrals", async ({
  page,
  browser,
}) => {
  const d = db();
  const admin = await makeUser(
    created,
    `e2e-creadm-${Date.now()}@example.test`,
  );
  await d.from("admins").insert({ user_id: admin.id });
  const creator = await makeUser(
    created,
    `e2e-creator-${Date.now()}@example.test`,
  );
  const other = await makeUser(created, `e2e-other-${Date.now()}@example.test`);
  const code = slug();
  await signInAndConsent(page, admin);

  await page.goto("/admin/creators");
  expect(await seriousViolations(page)).toEqual([]);
  const fill = async (email: string, s: string) => {
    await page.getByLabel("อีเมลของผู้ใช้ที่มีบัญชีอยู่แล้ว").fill(email);
    await page.getByLabel(/รหัสแนะนำ/).fill(s);
    await page.getByLabel("ชื่อที่แสดง").fill("ครีเอเตอร์ ทดสอบ");
    await page.getByRole("button", { name: "ตั้งเป็น Creator" }).last().click();
  };
  await fill("nobody-here@example.test", code);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "ไม่พบอีเมลนี้ในระบบ",
  );
  await fill(creator.email, "AB0IOL");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "รหัสหรือชื่อไม่ถูกต้อง",
  );
  await fill(creator.email, code.toLowerCase());
  await expect(page.getByText("ตั้งเป็น Creator แล้ว")).toBeVisible();
  await expect(page.getByText(code).first()).toBeVisible();
  await fill(other.email, code); // one code, one person
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "รหัสนี้มีคนใช้แล้ว",
  );

  // ── the creator's page ──
  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await signInAndConsent(cp, creator);
  await cp.goto("/rewards");
  await cp.getByRole("link", { name: "Creator toolkit" }).click();
  await expect(
    cp.getByRole("heading", { level: 1, name: "Creator toolkit" }),
  ).toBeVisible();
  await expect(cp.getByTestId("creator-code")).toHaveText(code);
  await expect(
    cp.getByRole("img", { name: /QR ของลิงก์ Creator/ }),
  ).toBeVisible();
  await expect(cp.getByText(new RegExp(`/r/${code}`)).first()).toBeVisible();
  await expect(cp.getByTestId("cr-invited")).toHaveText("0");
  await expect(
    cp.getByRole("heading", { name: "ข้อความพร้อมส่ง" }),
  ).toBeVisible();
  expect(await seriousViolations(cp)).toEqual([]);
  // anyone who is not a creator gets a 404, and no link
  const octx = await browser.newContext();
  const op = await octx.newPage();
  await signInAndConsent(op, other);
  expect((await op.goto("/creator"))?.status()).toBe(404);
  await op.goto("/rewards");
  await expect(op.getByRole("link", { name: "Creator toolkit" })).toHaveCount(
    0,
  );
  await octx.close();

  // ── the code really brings a referral ──
  const nctx = await browser.newContext();
  const np = await nctx.newPage();
  await np.goto(`/r/${code}`);
  const newcomer = await makeUser(created);
  await signInAndConsent(np, newcomer);
  await expect
    .poll(
      async () =>
        (
          await d
            .from("referrals")
            .select("referrer_id")
            .eq("referee_id", newcomer.id)
        ).data?.[0]?.referrer_id ?? null,
      { timeout: 20_000 },
    )
    .toBe(creator.id);
  await cp.goto("/creator");
  await expect(cp.getByTestId("cr-invited")).toHaveText("1");
  await nctx.close();
  await cctx.close();

  // ── removing the page leaves the code with its owner ──
  await page.goto("/admin/creators");
  await page.getByRole("button", { name: "ถอด Creator" }).first().click();
  await expect(page.getByText("ยังไม่มี Creator")).toBeVisible();
  expect(
    (await d.from("creators").select("user_id").eq("user_id", creator.id)).data,
  ).toHaveLength(0);
  expect(
    (
      await d
        .from("referral_codes")
        .select("code")
        .eq("user_id", creator.id)
        .single()
    ).data!.code,
  ).toBe(code);
});
