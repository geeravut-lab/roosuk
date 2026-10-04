import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { lineSyntheticEmail } from "../../src/lib/line/login";

/**
 * Live "link my LINE account". Real LINE sign-in needs a person with a LINE
 * account, so this checks everything around it: that the first step goes to LINE
 * with a state, and that EVERY way the second step can fail brings a signed-in
 * user back to Settings with a message and a reason code — it used to send them
 * to /auth, which bounces signed-in users to the app, so nothing was shown. One
 * step also talks to the real LINE token endpoint with a bogus code, which shows
 * whether the channel id/secret and the callback URL are accepted.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const lineConfigured =
  !!process.env.LINE_LOGIN_CHANNEL_ID &&
  !!process.env.LINE_LOGIN_CHANNEL_SECRET;
const enabled =
  process.env.E2E_LIVE === "1" &&
  !!url &&
  !!anonKey &&
  !!serviceKey &&
  lineConfigured;

const expect = baseExpect.configure({ timeout: 30_000 });

test.skip(
  !enabled,
  "needs E2E_LIVE=1, the Supabase env vars and the LINE Login channel env vars",
);
test.skip(
  ({ isMobile }) => !isMobile,
  "live suite runs once, in the mobile project",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

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

test.afterAll(async () => {
  for (const id of createdIds) await db().auth.admin.deleteUser(id);
});

test("linking LINE: the first step goes to LINE, and every failure of the second step is shown in Settings", async ({
  page,
}) => {
  const user = await makeUser();
  await signInAndConsent(page, user.email, user.password);

  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: "เชื่อมบัญชี LINE" }),
  ).toHaveAttribute("href", "/api/auth/line?mode=link&next=/settings");

  // ── step 1: LINE's authorize page, with a state and the callback of THIS site ──
  const start = await page.request.get(
    "/api/auth/line?mode=link&next=/settings",
    { maxRedirects: 0 },
  );
  expect(start.status()).toBe(307);
  const loc = new URL(start.headers()["location"]);
  expect(loc.host).toBe("access.line.me");
  expect(loc.searchParams.get("scope")).toBe("profile openid");
  const state = loc.searchParams.get("state")!;
  expect(state.length).toBeGreaterThan(20);
  expect(loc.searchParams.get("redirect_uri")).toMatch(
    /\/api\/auth\/line\/callback$/,
  );

  // ── step 2, every way it can fail, signed in: back in Settings WITH a message ──
  // the person pressed cancel on LINE
  await page.goto(`/api/auth/line/callback?error=access_denied&state=${state}`);
  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "คุณยกเลิกการเชื่อมต่อกับ LINE",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "รหัสสาเหตุ: line_access_denied",
  );

  // the state cookie is gone (it is cleared after each try): expired
  await page.goto(`/api/auth/line/callback?code=abc&state=${state}`);
  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "คำขอเชื่อมต่อ LINE หมดอายุ",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "no_state_cookie",
  );

  // a state that does not match the cookie
  await page.request.get("/api/auth/line?mode=link&next=/settings", {
    maxRedirects: 0,
  });
  await page.goto(
    "/api/auth/line/callback?code=abc&state=not-the-state-that-was-issued",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "คำขอเชื่อมต่อ LINE หมดอายุ",
  );
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "state_mismatch",
  );

  // a code LINE will not accept: this REALLY calls LINE's token endpoint, and names what it said
  const fresh = await page.request.get(
    "/api/auth/line?mode=link&next=/settings",
    { maxRedirects: 0 },
  );
  const freshState = new URL(fresh.headers()["location"]).searchParams.get(
    "state",
  )!;
  await page.goto(
    `/api/auth/line/callback?code=bogus-code&state=${freshState}`,
  );
  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ",
  );
  // invalid_grant = the channel id/secret are accepted (only the code is bogus); invalid_client = they are not
  await expect(page.locator("main").getByRole("alert")).toContainText(
    /รหัสสาเหตุ: token_\d{3}_[a-z_]+|token_network/,
  );
  const reason = (
    await page.locator("main").getByRole("alert").innerText()
  ).match(/token_[a-z0-9_]+/)![0];
  console.log("LINE token endpoint answered the bogus code with:", reason);

  // nothing was linked by any of that
  expect(
    (await db().from("line_links").select("user_id").eq("user_id", user.id))
      .data,
  ).toEqual([]);

  // the success message exists too
  await page.goto("/settings?line=linked");
  await expect(
    page.getByRole("status").filter({ hasText: "เชื่อมบัญชี LINE สำเร็จแล้ว" }),
  ).toBeVisible();
});
