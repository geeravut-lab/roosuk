import { expect as baseExpect, test } from "@playwright/test";
import {
  liveEnabled,
  makeUser,
  removeUsers,
  seriousViolations,
  signInAndConsent,
} from "./util";

/**
 * "Install as an app": the menu item, the real install prompt (Android/desktop),
 * the steps for iPhone Safari, the way out of LINE's in-app browser, the
 * "already installed" state, and the offline page the service worker serves.
 */
const expect = baseExpect.configure({ timeout: 25_000 });
test.skip(!liveEnabled, "set E2E_LIVE=1 (and the Supabase env vars)");
test.skip(({ isMobile }) => !isMobile, "live suite runs once, in mobile");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const created: string[] = [];
test.afterAll(() => removeUsers(created));

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneLine:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

test("the menu item, the real prompt, the iPhone steps, LINE's browser, installed, offline", async ({
  page,
  browser,
}) => {
  const u = await makeUser(created);
  await signInAndConsent(page, u);

  // ── the menu item is there and leads to the page ──
  await page.goto("/today");
  await page.getByRole("button", { name: "เพิ่มเติม" }).click();
  await page.getByRole("link", { name: "ติดตั้งเป็นแอปบนเครื่อง" }).click();
  await expect(page).toHaveURL(/\/install$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "ติดตั้งรู้สุขเป็นแอปบนเครื่อง",
    }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  // every device's steps are written out for anyone who wants them
  await expect(
    page.getByText("เลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก” แล้วยืนยัน"),
  ).toBeVisible();

  // ── Android Chrome: the browser's own install prompt behind our button ──
  const state = await page.context().storageState();
  const open = async (userAgent: string, extra?: () => Promise<void>) => {
    const ctx = await browser.newContext({
      storageState: state,
      userAgent,
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });
    const p = await ctx.newPage();
    await p.goto("/install");
    await extra?.();
    return { ctx, p };
  };

  const android = await open(UA.androidChrome);
  await expect(
    android.p.getByRole("button", { name: "ติดตั้งเป็นแอป" }),
  ).toHaveCount(0); // no prompt yet
  await expect(
    android.p.getByText("แตะเมนู ⋮ (จุดสามจุด) มุมขวาบนของ Chrome").first(),
  ).toBeVisible();
  await android.p.evaluate(() => {
    const e = new Event("beforeinstallprompt", {
      cancelable: true,
    }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    (window as unknown as { __prompted: number }).__prompted = 0;
    e.prompt = async () => {
      (window as unknown as { __prompted: number }).__prompted++;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
  const btn = android.p.getByRole("button", { name: "ติดตั้งเป็นแอป" });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect
    .poll(() =>
      android.p.evaluate(
        () => (window as unknown as { __prompted: number }).__prompted,
      ),
    )
    .toBe(1);
  await expect(btn).toHaveCount(0); // a prompt can be used once
  await android.p.evaluate(() =>
    window.dispatchEvent(new Event("appinstalled")),
  );
  await expect(
    android.p.getByText("ติดตั้งแล้ว! ดูไอคอนรู้สุขบนหน้าจอของคุณ"),
  ).toBeVisible();
  await android.ctx.close();

  // ── iPhone Safari: there is no prompt on iOS, so the steps are shown ──
  const ios = await open(UA.iphoneSafari);
  await expect(
    ios.p.getByRole("button", { name: "ติดตั้งเป็นแอป" }),
  ).toHaveCount(0);
  const mine = ios.p.locator("section").filter({
    has: ios.p.getByRole("heading", { name: "สำหรับอุปกรณ์ของคุณ" }),
  });
  await expect(
    mine.getByText(
      "แตะปุ่ม “แชร์” (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบด้านล่างของ Safari",
    ),
  ).toBeVisible();
  await expect(mine.getByText(/เพิ่มไปยังหน้าจอโฮม/)).toBeVisible();
  await expect(mine.getByText(/iOS 16.4/)).toBeVisible();
  await ios.ctx.close();

  // ── inside LINE's browser nothing can install: say so, and offer the link ──
  const line = await open(UA.iphoneLine);
  const lineMine = line.p.locator("section").filter({
    has: line.p.getByRole("heading", { name: "สำหรับอุปกรณ์ของคุณ" }),
  });
  await expect(lineMine.getByText(/เปิดใน Safari/)).toBeVisible();
  await expect(lineMine.getByRole("button", { name: /คัดลอก/ })).toBeVisible();
  await line.ctx.close();

  // ── already running as an installed app ──
  const standalone = await browser.newContext({
    storageState: state,
    userAgent: UA.iphoneSafari,
    hasTouch: true,
  });
  await standalone.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  const sp = await standalone.newPage();
  await sp.goto("/install");
  await expect(
    sp.getByText("คุณกำลังใช้รู้สุขในรูปแบบแอปอยู่แล้ว"),
  ).toBeVisible();
  await expect(
    sp.getByRole("heading", { name: "วิธีติดตั้งบนอุปกรณ์อื่น" }),
  ).toHaveCount(0);
  await standalone.close();

  // ── the service worker is registered, and a lost connection shows the offline page ──
  await page.goto("/install");
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(scope).toMatch(/\/$/);
  await page.context().setOffline(true);
  await page.goto("/today").catch(() => null);
  await expect(
    page.getByRole("heading", { name: "ไม่มีสัญญาณอินเทอร์เน็ต" }),
  ).toBeVisible();
  // nothing the person saw while signed in is stored for offline use
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys())
        out.push(new URL(req.url).pathname);
    return out.sort();
  });
  expect(cached).toEqual(["/icons/icon-192.png", "/offline.html"]);
  await page.context().setOffline(false);
});
