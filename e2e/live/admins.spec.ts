import { expect as baseExpect, test } from "@playwright/test";
import { db, liveEnabled, makeUser, signInAndConsent } from "./util";

/**
 * Live admin management: the card lists admins, adds one by the email of an
 * existing account (an unknown email is an error, not a new account), removes
 * another admin, and never lets anyone remove themselves or the owner's account.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const created: string[] = [];
test.afterAll(async () => {
  const d = db();
  if (created.length)
    await d.from("privacy_audit_log").delete().in("user_id", created);
  for (const id of created) await d.auth.admin.deleteUser(id);
});

const mail = (tag: string) => `e2e-${tag}-${Date.now()}@example.test`;

test("an admin lists, adds by email, removes another, and cannot touch themselves or the owner", async ({
  page,
  browser,
}) => {
  const d = db();
  const a = await makeUser(created, mail("adm-a"));
  const b = await makeUser(created, mail("adm-b"));
  await d.from("admins").insert({ user_id: a.id });
  await signInAndConsent(page, a);

  await page.goto("/admin");
  const card = page.locator("#admins");
  await expect(
    card.getByRole("heading", { name: "ผู้ดูแลระบบ (Admin)" }),
  ).toBeVisible();
  // yourself: listed, marked, and no way to remove you
  const mine = card.getByRole("listitem").filter({ hasText: a.email });
  await expect(mine).toContainText("คุณ");
  await expect(mine.getByRole("button")).toHaveCount(0);
  // the owner's row (when the account exists here) has no remove button either
  const owner = card
    .getByRole("listitem")
    .filter({ hasText: "geeravut@gmail.com" });
  if (await owner.count()) {
    await expect(owner).toContainText("ถอดสิทธิ์ไม่ได้");
    await expect(owner.getByRole("button")).toHaveCount(0);
  }

  // an email nobody has: an error, and nobody is created
  const emailField = page.getByLabel("อีเมลของผู้ใช้ที่มีบัญชีอยู่แล้ว");
  await emailField.fill("nobody-here@example.test");
  await card.getByRole("button", { name: "เพิ่มเป็น Admin" }).click();
  await expect(card.getByRole("alert")).toContainText("ไม่พบอีเมลนี้ในระบบ");

  // an existing account, typed in capitals with spaces
  await emailField.fill(`  ${b.email.toUpperCase()} `);
  await card.getByRole("button", { name: "เพิ่มเป็น Admin" }).click();
  await expect(card.getByRole("status")).toContainText(
    `${b.email} เป็น Admin แล้ว`,
  );
  const theirs = card.getByRole("listitem").filter({ hasText: b.email });
  await expect(theirs).toBeVisible();
  // adding again is said plainly
  await emailField.fill(b.email);
  await card.getByRole("button", { name: "เพิ่มเป็น Admin" }).click();
  await expect(card.getByRole("alert")).toContainText("เป็น Admin อยู่แล้ว");

  // the new admin can really use the admin pages
  const ctx = await browser.newContext();
  const pb = await ctx.newPage();
  await signInAndConsent(pb, b);
  expect((await pb.goto("/admin"))?.status()).toBe(200);

  // remove them
  await theirs.getByRole("button", { name: /ถอนสิทธิ์ Admin/ }).click();
  await expect(card.getByRole("status")).toContainText("ถอนสิทธิ์ Admin แล้ว");
  await expect(
    card.getByRole("listitem").filter({ hasText: b.email }),
  ).toHaveCount(0);
  expect((await pb.goto("/admin"))?.status()).toBe(404);
  await ctx.close();

  // the database itself refuses what the page never offers
  const self = await d.rpc("revoke_admin", { p_actor: a.id, p_target: a.id });
  expect(self.data).toBe("self");
  const ownerId = (
    await d.rpc("user_id_by_email", { p_email: "geeravut@gmail.com" })
  ).data as string | null;
  if (ownerId) {
    const r = await d.rpc("revoke_admin", { p_actor: a.id, p_target: ownerId });
    expect(r.data).toBe("protected");
    const { data: still } = await d
      .from("admins")
      .select("user_id")
      .eq("user_id", ownerId);
    expect(still?.length).toBe(1);
  }
});

test("a person who is not an admin gets nothing from the page", async ({
  page,
}) => {
  const u = await makeUser(created, mail("adm-u"));
  await signInAndConsent(page, u);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});
