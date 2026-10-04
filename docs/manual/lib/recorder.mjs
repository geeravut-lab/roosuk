// Shared helpers for recording the user manuals: a phone-sized browser, test users
// created through the Supabase admin API (and removed again), and screenshots that
// highlight the element a step is about. Used by record-*.mjs.
import { existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MANUAL_DIR = resolve(HERE, "..");
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Service-role client (test data only — the shared project holds no real users yet). */
export const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

export async function makeUser(created, { email, name } = {}) {
  const mail =
    email ??
    `manual${Date.now()}${randomBytes(2).toString("hex")}@roosuk-manual.test`;
  const password = `Pw-${randomBytes(9).toString("hex")}`;
  const { data, error } = await db().auth.admin.createUser({
    email: mail,
    password,
    email_confirm: true,
    user_metadata: name ? { full_name: name } : undefined,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  created.push(data.user.id);
  return { id: data.user.id, email: mail, password };
}

export async function removeUsers(ids) {
  for (const id of ids) await db().auth.admin.deleteUser(id);
}

/**
 * Opens a 390×844 phone (2× pixels, touch) against `base` and returns helpers.
 * `shot(id, opts)` writes shots/<manual>/<id>.png (viewport only — what a phone shows).
 */
export async function startRecorder({
  manual,
  base = "http://localhost:3100",
}) {
  const outDir = join(MANUAL_DIR, "shots", manual);
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "th-TH",
    baseURL: base,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  /**
   * Take a phone screenshot.
   *  - highlight: a locator (or array) outlined in coral for the shot
   *  - mask: hide e-mail addresses / phone numbers (admin lists) — on by default
   *  - scrollTo: a locator scrolled to the middle first
   */
  async function shot(
    id,
    { highlight, scrollTo, mask = true, settle = 400 } = {},
  ) {
    await page.waitForLoadState("networkidle").catch(() => {});
    if (scrollTo)
      await scrollTo
        .first()
        .evaluate((el) => el.scrollIntoView({ block: "center" }));
    if (mask) await maskPersonalData(page);
    const marks = [];
    for (const loc of [highlight].flat().filter(Boolean)) {
      const h = await loc.first().elementHandle();
      if (!h) continue;
      await h.evaluate((el) => {
        el.dataset.manualPrevOutline = el.style.outline;
        el.dataset.manualPrevOffset = el.style.outlineOffset;
        el.dataset.manualPrevRadius = el.style.borderRadius;
        el.style.outline = "3px solid #FF7A6B";
        el.style.outlineOffset = "3px";
        if (!el.style.borderRadius) el.style.borderRadius = "12px";
      });
      marks.push(h);
    }
    await page.waitForTimeout(settle);
    await page.screenshot({ path: join(outDir, `${id}.png`) });
    for (const h of marks)
      await h.evaluate((el) => {
        el.style.outline = el.dataset.manualPrevOutline ?? "";
        el.style.outlineOffset = el.dataset.manualPrevOffset ?? "";
        el.style.borderRadius = el.dataset.manualPrevRadius ?? "";
      });
    return `${manual}/${id}.png`;
  }

  return { browser, ctx, page, shot, outDir, close: () => browser.close() };
}

/** Replaces e-mail addresses and phone numbers in visible text and inputs with masked ones. */
export async function maskPersonalData(page) {
  await page.evaluate(() => {
    const emailRe =
      /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const maskEmail = (s) => s.replace(emailRe, (_m, a, d) => `${a}•••@${d}`);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode())
      if (emailRe.test(n.nodeValue)) {
        emailRe.lastIndex = 0;
        n.nodeValue = maskEmail(n.nodeValue);
      }
    for (const el of document.querySelectorAll(
      "input[type=email], input[name*=email i]",
    ))
      if (el.value && !el.dataset.manualMasked) {
        el.dataset.manualMasked = "1";
        el.type = "text";
        el.value = maskEmail(el.value);
      }
  });
}

/** Signs in through the real form and accepts the consent screen (optionally with photos). */
export async function signInAndConsent(page, user, { photos = false } = {}) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("อีเมล").fill(user.email);
  await page.getByLabel("รหัสผ่าน").fill(user.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL(/\/consent|\/today/);
  if (/\/consent/.test(page.url())) {
    await page.waitForLoadState("networkidle");
    for (const box of await page
      .locator('input[type="checkbox"][required]')
      .all())
      await box.check();
    if (photos) await page.locator('input[name="consent_photos"]').check();
    await page.getByRole("button", { name: "ยืนยันและเริ่มใช้งาน" }).click();
    await page.waitForURL(/\/today/);
  }
}
