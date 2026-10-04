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
 * Live Family (Premium +1): the owner invites, the member joins with a code; the
 * member has Premium only while the owner's PAID Premium is live; each side shares
 * summaries only by explicit, separate switches; ending the link ends everything.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const created: string[] = [];
test.afterAll(async () => {
  if (created.length)
    await db().from("privacy_audit_log").delete().in("user_id", created);
  await removeUsers(created);
});

const today = bangkokDate(new Date());

test("invite, join, Premium only while the owner's paid plan lives, sharing by explicit switches, leaving", async ({
  page,
  browser,
}) => {
  const d = db();
  const owner = await makeUser(created);
  const member = await makeUser(created);
  const stranger = await makeUser(created);
  await endTrial(member.id);
  await endTrial(stranger.id);
  await signInAndConsent(page, owner);

  // ── the owner makes a code ──
  await page.goto("/family");
  await expect(
    page.getByRole("heading", { level: 1, name: "ครอบครัว (Premium +1)" }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "สร้างรหัสเชิญ" }).click();
  const code = (await page.getByTestId("family-code").innerText()).trim();
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{7}$/);

  // ── nonsense, then the real code, as a person with no plan at all ──
  const mctx = await browser.newContext();
  const mp = await mctx.newPage();
  await signInAndConsent(mp, member);
  await mp.goto("/family");
  await expect(mp.getByText("การชวนสมาชิกสำหรับ Premium")).toBeVisible(); // cannot invite…
  await mp.getByLabel("รหัสเชิญ", { exact: true }).fill("ZZZZZZZ");
  await mp.getByRole("button", { name: "เข้าร่วมครอบครัว" }).click();
  await expect(
    mp.getByRole("alert").filter({ hasText: "ไม่พบรหัสเชิญนี้" }),
  ).toBeVisible();
  await mp.goto(`/family?code=${code.toLowerCase()}`);
  await expect(mp.getByLabel("รหัสเชิญ", { exact: true })).toHaveValue(code); // the link fills it in
  await mp.getByRole("button", { name: "เข้าร่วมครอบครัว" }).click(); // …but can join
  await expect(mp.getByText("เข้าร่วมครอบครัวแล้ว")).toBeVisible();
  await expect(mp.getByText("คุณอยู่ในครอบครัวของ")).toBeVisible();

  // a used code is a used code
  const sctx = await browser.newContext();
  const sp = await sctx.newPage();
  await signInAndConsent(sp, stranger);
  await sp.goto(`/family?code=${code}`);
  await sp.getByRole("button", { name: "เข้าร่วมครอบครัว" }).click();
  await expect(
    sp.getByRole("alert").filter({ hasText: "ถูกใช้ไปแล้ว" }),
  ).toBeVisible();
  await sctx.close();

  // the owner is told, and sees the member
  await page.goto("/notifications");
  await expect(page.getByText("มีสมาชิกเข้าร่วมครอบครัวของคุณ")).toBeVisible();
  await page.goto("/family");
  await expect(page.getByText("สมาชิกครอบครัวของคุณ")).toBeVisible();
  await expect(page.getByRole("button", { name: "สร้างรหัสเชิญ" })).toHaveCount(
    0,
  ); // the seat is taken

  // ── Premium for the member follows the owner's PAID plan, not the owner's trial ──
  await mp.goto("/passport");
  await expect(mp.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible(); // the owner is only on the trial
  await d
    .from("profiles")
    .update({
      plan_tier: "premium",
      plan_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .eq("id", owner.id);
  await mp.goto("/passport");
  await expect(mp.getByRole("button", { name: "สร้างลิงก์" })).toBeVisible(); // now Premium through the family
  await mp.goto("/subscription");
  await expect(mp.getByText("Premium", { exact: true }).first()).toBeVisible();
  // …and a member cannot hand the seat on
  await d.from("family_invites").select("id").eq("owner_id", member.id);
  const { data: chain } = await d.rpc("create_family_invite", {
    p_owner: member.id,
    p_seats: 1,
  });
  expect((chain as { reason: string }).reason).toBe("is_member");
  // the owner's paid plan runs out: the member is Free-lite again at once
  await d
    .from("profiles")
    .update({ plan_expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", owner.id);
  await mp.goto("/passport");
  await expect(mp.getByText("สำหรับแพ็กเกจ Premium")).toBeVisible();

  // ── sharing: off until ticked, needs the acknowledgement ──
  await d.from("daily_checkins").insert(
    [0, 1, 2].map((i) => ({
      user_id: member.id,
      checkin_date: addDays(today, -i),
      sleep_band: 3,
      activity_band: 2,
      energy: 4,
      mood: 4,
      nutrition: 3,
    })),
  );
  await page.goto("/family");
  await expect(
    page.getByText("อีกฝ่ายยังไม่ได้เปิดแชร์อะไรให้คุณ"),
  ).toBeVisible();
  await mp.goto("/family");
  const mine = mp.locator("section").filter({
    has: mp.getByRole("heading", { name: "สิ่งที่ฉันแชร์ให้อีกฝ่ายเห็น" }),
  });
  await expect(
    mine.getByRole("checkbox", { name: /การเช็กอิน/ }),
  ).not.toBeChecked();
  await mine.getByRole("checkbox", { name: /การเช็กอิน/ }).check();
  await mine.getByRole("button", { name: "บันทึกการแชร์" }).click();
  await expect(
    mp.getByRole("alert").filter({ hasText: "กรุณาติ๊กยืนยันก่อนเปิดการแชร์" }),
  ).toBeVisible();
  expect(
    (await d.from("family_shares").select("scope").eq("member_id", member.id))
      .data,
  ).toHaveLength(0);
  await mine.getByRole("checkbox", { name: /การเช็กอิน/ }).check();
  await mine.getByRole("checkbox", { name: /ฉันยินยอมให้อีกฝ่ายเห็น/ }).check();
  await mine.getByRole("button", { name: "บันทึกการแชร์" }).click();
  await expect(mp.getByText("บันทึกการแชร์แล้ว")).toBeVisible();

  await page.goto("/family");
  await expect(
    page.getByText("วันนี้เช็กอินแล้ว", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/ต่อเนื่อง 3 วัน · 7 วันล่าสุดเช็กอิน 3 วัน/),
  ).toBeVisible();
  await expect(page.getByText(/คะแนนสุขภาพรวม \d+/)).toHaveCount(0); // the score switch is still off
  // and the other way round it is still nothing
  await mp.goto("/family");
  await expect(
    mp.getByText("อีกฝ่ายยังไม่ได้เปิดแชร์อะไรให้คุณ"),
  ).toBeVisible();

  // ── the member leaves: shares and Premium end, the seat is free again ──
  await mp.getByRole("button", { name: "ออกจากครอบครัว" }).click();
  await expect(mp.getByText("สิ้นสุดการเชื่อมครอบครัวแล้ว")).toBeVisible();
  expect(
    (await d.from("family_shares").select("scope").eq("member_id", member.id))
      .data,
  ).toHaveLength(0);
  expect(
    (
      await d
        .from("family_members")
        .select("member_id")
        .eq("member_id", member.id)
    ).data,
  ).toHaveLength(0);
  await page.goto("/family");
  await expect(
    page.getByText("อีกฝ่ายยังไม่ได้เปิดแชร์อะไรให้คุณ"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /สร้างรหัสเชิญ/ }).first(),
  ).toBeVisible();
  await mctx.close();
});
