// Records the USER manual: really operates the app in a 390×844 phone browser and writes one
// screenshot per manual step to docs/manual/shots/user/. Test users are created (and always removed
// again in `finally`) in the shared Supabase project. Needs the app on http://localhost:3101:
//   OPEN_FOOD_FACTS_URL=http://127.0.0.1:4011 ENABLE_UI_PREVIEW=1 NODE_USE_ENV_PROXY=1 npx next start -p 3101
//   NODE_USE_ENV_PROXY=1 node docs/manual/record-user.mjs [--only=today,scan] [--quick]
// AI answers cannot be produced in the sandbox (no model key / free quota spent): where a screen needs one,
// a realistic Thai sample row is written with the service role and the manual text says so (see SEEDED below).
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import {
  db,
  makeUser,
  removeUsers,
  signInAndConsent,
  startRecorder,
} from "./lib/recorder.mjs";
import { makeFixtures } from "./lib/fixtures.mjs";

const BASE = "http://localhost:3101";
const STUB_PORT = 4011;
const arg = (n) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const only = new Set((arg("only") ?? "").split(",").filter(Boolean));
const quick = process.argv.includes("--quick");
const wants = (name) => only.size === 0 || only.has(name);

const created = []; // every auth user this run makes
const cleanup = []; // async functions run in `finally`, before the users go
const day = (n = 0) => {
  // Bangkok calendar date n days from today
  const d = new Date(Date.now() + 7 * 3600_000 + n * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const isoDaysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const password = () => `Pw-${randomBytes(9).toString("hex")}`;
// Only e-mails with this prefix are ours (the admin-manual recorder shares the project and the domain).
const mail = () =>
  `usrman${Date.now()}${randomBytes(3).toString("hex")}@roosuk-manual.test`;
const newUser = (name) => makeUser(created, { email: mail(), name });

const failures = [];
/** One chapter = one menu. A failing chapter is reported and the rest still run. */
async function chapter(name, fn) {
  if (!wants(name)) return;
  const t0 = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (err) {
    failures.push(name);
    console.error(
      `FAIL ${name}:`,
      String(err?.stack ?? err)
        .split("\n")
        .slice(0, 6)
        .join("\n"),
    );
  }
}

// ── tiny page helpers ──────────────────────────────────────────────────────────
const settle = async (page) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .getByText("กำลังโหลด…", { exact: true })
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});
};
const go = async (page, path) => {
  await page.goto(path);
  await settle(page);
};
const heading = (page, name) => page.getByRole("heading", { name, level: 1 });
/** A ChoiceGroup / check-in question: tap one option inside the group named by the question text. */
const choose = async (page, question, option) => {
  const group = page.getByRole("group", { name: question });
  await group
    .locator("label", {
      hasText: new RegExp(
        `^\\s*${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      ),
    })
    .first()
    .click();
};
const btn = (page, name) => page.getByRole("button", { name, exact: true });
const link = (page, name, exact = true) =>
  page.getByRole("link", { name, exact });
const section = (page, headingText) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: headingText }) })
    .first();

async function main() {
  const rec = await startRecorder({ manual: "user", base: BASE });
  const { page, shot, ctx, browser } = rec;
  page.setDefaultTimeout(15_000);
  const fx = await makeFixtures(browser, join(rec.outDir, "_fx"));
  const admin = db();
  // The sandbox cannot reach promptpay.io (and the account number must not appear in a manual):
  // every PromptPay QR in the shots is a sample QR drawn locally.
  const sampleQr = await QRCode.toBuffer(
    "00020101021129370016A000000677010111011300000000000053037645406000.005802TH63040000",
    {
      width: 512,
      margin: 2,
      color: { dark: "#1F2A30", light: "#FFFFFF" },
    },
  );
  await installHostRewrite(ctx);
  await ctx.route(/promptpay\.io/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: sampleQr }),
  );

  // Local stand-in for Open Food Facts (the real service is not reachable from the sandbox).
  const stub = createServer((req, res) => {
    const code = /\/product\/(\d+)\.json/.exec(req.url ?? "")?.[1] ?? "";
    res.setHeader("content-type", "application/json");
    if (code === "4006381333931")
      return void res.end(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Instant noodles",
            product_name_th: "บะหมี่กึ่งสำเร็จรูปรสต้มยำ",
            brands: "ตัวอย่าง",
            nutriments: {
              "energy-kcal_serving": 330,
              proteins_serving: 7,
              carbohydrates_serving: 45,
              fat_serving: 13.5,
            },
          },
        }),
      );
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));
  cleanup.push(async () => stub.close());

  const shotWrapped = async (id, opts) => {
    await rewriteHost(page);
    return shot(id, opts);
  };
  const S = {
    rec,
    page,
    shot: shotWrapped,
    ctx,
    browser,
    fx,
    admin,
    M: null,
    B: null,
    F: null,
    sampleQr,
  };

  // The main person is created by really signing up in the onboarding chapter; --quick makes it directly.
  if (quick || !wants("onboarding")) {
    S.M = await newUser("คุณสุขใจ");
    await signInAndConsent(page, S.M, { photos: true });
  }

  await chapter("onboarding", () => onboarding(S));
  await chapter("today", () => today(S));
  await chapter("profile", () => profile(S));
  await chapter("quiz", () => quizSigned(S));
  await chapter("checkup", () => checkup(S));
  for (const [name, fn] of REGISTRY) await chapter(name, () => fn(S));

  await rec.close();
}

// Chapters from other parts of this file register themselves here.
const REGISTRY = [];
const register = (name, fn) => REGISTRY.push([name, fn]);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Before sign-in: landing, public quiz, sign-up, consent
// ═══════════════════════════════════════════════════════════════════════════════
async function onboarding(S) {
  const { page, shot, ctx, admin } = S;
  const fresh = await ctx.browser().newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "th-TH",
    baseURL: BASE,
  });
  await installHostRewrite(fresh);
  await fresh.route(/promptpay\.io/, (r) => r.abort());
  const p = await fresh.newPage();
  p.setDefaultTimeout(15_000);
  const rec = { ...S.rec };
  // shots of this page go through the same recorder (it only needs a page to photograph)
  const snap = async (id, opts) => shotOf(p, S.rec.outDir, id, opts);

  await go(p, "/");
  await snap("01-landing", { highlight: link(p, "เริ่มต้นใช้งานฟรี") });
  await p.getByRole("button", { name: "English", exact: true }).click();
  await settle(p);
  await snap("02-landing-en", {
    highlight: p.getByRole("group", { name: /Language|ภาษา/ }),
  });
  await p.getByRole("button", { name: "ไทย", exact: true }).click();
  await settle(p);

  // public quiz (nothing stored)
  await link(p, "ลองประเมินสุขภาพฟรี ไม่ต้องสมัคร").click();
  await p.waitForURL(/\/quiz/, { waitUntil: "commit" });
  await settle(p);
  await snap("03-quiz-open", {});
  await p.locator("#birth_year").fill("1988");
  await choose(p, /สูบบุหรี่/, "ไม่เคยสูบ");
  await choose(p, /ดื่มแอลกอฮอล์/, "ไม่ดื่ม");
  await choose(p, /ออกกำลังกาย/, "3");
  await snap("04-quiz-fill", { highlight: p.locator("#birth_year") });
  await choose(p, /นอนประมาณกี่ชั่วโมง/, "7–8 ชม.");
  await choose(p, /ผักและผลไม้/, "3–4");
  await choose(p, /เครียดแค่ไหน/, "ปานกลาง");
  await choose(p, /ตรวจสุขภาพประจำปี/, "ยังไม่ได้ตรวจ");
  await snap("05-quiz-answered", {
    scrollTo: btn(p, "ดูผลของฉัน"),
    highlight: btn(p, "ดูผลของฉัน"),
  });
  await btn(p, "ดูผลของฉัน").click();
  await p.getByText("อายุสุขภาพโดยประมาณ").waitFor();
  await settle(p);
  await snap("06-quiz-result", {});
  await snap("07-quiz-result-plan", {
    scrollTo: p.getByText("แผน 7 วัน").first(),
  });

  // sign-up
  await go(p, "/");
  await link(p, "เริ่มต้นใช้งานฟรี").click();
  await p.waitForURL(/\/auth/, { waitUntil: "commit" });
  await settle(p);
  const email = mail();
  const pw = password();
  await p.getByLabel("ชื่อที่ใช้แสดง (ไม่บังคับ)").fill("คุณสุขใจ");
  await p.getByLabel("อีเมล").fill(email);
  await p.getByLabel("รหัสผ่าน").fill(pw);
  await snap("08-signup-form", {
    highlight: [p.getByLabel("อีเมล"), p.getByLabel("รหัสผ่าน")],
  });
  await p.getByLabel("อีเมล").fill(email); // the shot masked the field
  await p.getByRole("button", { name: "สมัครสมาชิก", exact: true }).click();
  await p.waitForURL(/\/consent/, { waitUntil: "commit", timeout: 60_000 });
  await settle(p);
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const me = list.users.find((u) => u.email === email);
  if (!me) throw new Error("signed-up user not found");
  created.push(me.id);
  S.M = { id: me.id, email, password: pw };

  await snap("09-consent-top", {});
  await snap("10-consent-required", {
    scrollTo: p.locator("#consent_terms_privacy"),
    highlight: p.locator("li", { has: p.locator("#consent_terms_privacy") }),
  });
  for (const box of await p.locator('input[type="checkbox"][required]').all())
    await box.check();
  await snap("11-consent-optional", {
    scrollTo: p.locator("#consent_photos"),
    highlight: [
      p.locator("li", { has: p.locator("#consent_photos") }),
      p.locator("li", { has: p.locator("#consent_marketing") }),
    ],
  });
  await p.locator("#consent_photos").check();
  await snap("12-consent-ticked", {
    scrollTo: btn(p, "ยืนยันและเริ่มใช้งาน"),
    highlight: btn(p, "ยืนยันและเริ่มใช้งาน"),
  });
  await btn(p, "ยืนยันและเริ่มใช้งาน").click();
  await p.waitForURL(/\/today/, { waitUntil: "commit" });
  await settle(p);
  // From here the main person keeps using this very browser session.
  await ctx.addCookies(await fresh.cookies());
  await fresh.close();
  await go(page, "/today");
}

/** The app runs on localhost here; a manual should show the real address. Text only, applied just before a screenshot. */
/** Keeps the displayed address "https://roosuk.netlify.app" in every page of a browser context (text only; links are untouched). */
async function installHostRewrite(c) {
  await c.addInitScript(
    ([from, to]) => {
      const fix = (root) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode())
          if (n.nodeValue.includes(from))
            n.nodeValue = n.nodeValue.split(from).join(to);
      };
      const start = () => {
        fix(document.body);
        new MutationObserver((muts) => {
          for (const m of muts) {
            if (m.type === "characterData" && m.target.nodeValue.includes(from))
              m.target.nodeValue = m.target.nodeValue.split(from).join(to);
            for (const n of m.addedNodes)
              if (n.nodeType === 1) fix(n);
              else if (n.nodeType === 3 && n.nodeValue.includes(from))
                n.nodeValue = n.nodeValue.split(from).join(to);
          }
        }).observe(document.body, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      };
      if (document.body) start();
      else document.addEventListener("DOMContentLoaded", start);
    },
    ["http://localhost:3101", "https://roosuk.netlify.app"],
  );
}

async function waitIdle(pg) {
  // the global "loading page" pill and any spinner of a running form must be gone before a shot is taken
  await pg
    .getByText("กำลังโหลด…", { exact: true })
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});
  await pg
    .waitForFunction(() => !document.querySelector(".animate-spin"), null, {
      timeout: 10_000,
    })
    .catch(() => {});
}
async function waitImages(pg) {
  await waitIdle(pg);
  await pg.evaluate(() => {
    for (const i of document.images) i.loading = "eager";
  });
  await pg
    .waitForFunction(
      () => [...document.images].every((i) => i.complete),
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
}
async function rewriteHost(pg) {
  await waitImages(pg);
  await pg.evaluate(
    ([from, to]) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode())
        if (n.nodeValue.includes(from))
          n.nodeValue = n.nodeValue.split(from).join(to);
    },
    ["http://localhost:3101", "https://roosuk.netlify.app"],
  );
}

/** A second signed-in person in their own browser context (the other side of an invite). */
async function session(S, user, { photos = false } = {}) {
  const c = await S.browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "th-TH",
    baseURL: BASE,
  });
  await installHostRewrite(c);
  await c.route(/promptpay\.io/, (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: S.sampleQr }),
  );
  const pg = await c.newPage();
  pg.setDefaultTimeout(15_000);
  await signInAndConsent(pg, user, { photos });
  const snap = async (id, opts) => shotOf(pg, S.rec.outDir, id, opts);
  return { ctx: c, page: pg, snap, close: () => c.close() };
}

/** Same as recorder.shot but for another page object (a second browser context). */
async function shotOf(
  pg,
  outDir,
  id,
  { highlight, scrollTo, settleMs = 400 } = {},
) {
  const { maskPersonalData } = await import("./lib/recorder.mjs");
  await settle(pg);
  if (scrollTo)
    await scrollTo
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await rewriteHost(pg);
  await maskPersonalData(pg);
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
  await pg.waitForTimeout(settleMs);
  await pg.screenshot({ path: join(outDir, `${id}.png`) });
  for (const h of marks)
    await h.evaluate((el) => {
      el.style.outline = el.dataset.manualPrevOutline ?? "";
      el.style.outlineOffset = el.dataset.manualPrevOffset ?? "";
      el.style.borderRadius = el.dataset.manualPrevRadius ?? "";
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Today + check-in
// ═══════════════════════════════════════════════════════════════════════════════
async function today(S) {
  const { page, shot, admin, M } = S;
  await go(page, "/today");
  await shot("20-today-first", {
    highlight: link(page, "เช็กอินสุขภาพวันนี้", false),
  });

  // a week and a half of earlier check-ins (so the score, streak and trend have something to show)
  const rows = [
    [1, 3, 3, 4, 4, 4],
    [2, 3, 2, 3, 4, 3],
    [3, 2, 3, 4, 3, 4],
    [4, 3, 3, 4, 4, 4],
    [5, 3, 2, 3, 3, 3],
    [6, 2, 3, 4, 4, 4],
    [8, 3, 3, 4, 4, 4],
    [9, 3, 2, 4, 3, 3],
    [10, 2, 2, 3, 3, 3],
    [11, 3, 3, 4, 4, 4],
  ].map(([n, sleep, act, energy, mood, nutrition]) => ({
    user_id: M.id,
    checkin_date: day(-n),
    sleep_band: sleep,
    activity_band: act,
    energy,
    mood,
    nutrition,
  }));
  const ins = await admin.from("daily_checkins").insert(rows);
  if (ins.error) throw ins.error;

  await go(page, "/today");
  await shot("21-today-history", {
    highlight: link(page, "เช็กอินสุขภาพวันนี้", false),
  });
  await shot("22-today-score", {
    scrollTo: page.getByRole("heading", { name: "คะแนนสุขภาพของคุณ" }),
    highlight: page.locator("#score-h").locator(".."),
  });
  await shot("23-today-actions", {
    scrollTo: page.getByRole("heading", { name: "3 สิ่งที่ควรทำวันนี้" }),
    highlight: page.locator("#actions-h").locator("../.."),
  });
  await shot("24-today-streak", {
    scrollTo: page.getByRole("heading", { name: "ความต่อเนื่อง" }),
    highlight: page.locator("#streak-h").locator(".."),
  });

  // the check-in
  await link(page, "เช็กอินสุขภาพวันนี้", false).first().click();
  await page.waitForURL(/\/today\/checkin/, { waitUntil: "commit" });
  await settle(page);
  await shot("25-checkin-open", {});
  await choose(page, /นอนประมาณกี่ชั่วโมง/, "7–8 ชม.");
  await choose(page, /ขยับตัวหรือออกกำลังกาย/, "30–60 นาที");
  await shot("26-checkin-answering", {
    highlight: [
      page.getByRole("group", { name: /นอนประมาณกี่ชั่วโมง/ }),
      page.getByRole("group", { name: /ขยับตัวหรือออกกำลังกาย/ }),
    ],
  });
  await choose(page, /พลังงานของคุณ/, "ดี");
  await choose(page, /อารมณ์ของคุณ/, "ดี");
  await choose(page, /อาหารที่กินสมดุล/, "ค่อนข้างสมดุล");
  await shot("27-checkin-done", {
    scrollTo: btn(page, "บันทึกเช็กอิน"),
    highlight: btn(page, "บันทึกเช็กอิน"),
  });
  await btn(page, "บันทึกเช็กอิน").click();
  await page.waitForURL(/\/today$/, { waitUntil: "commit" });
  await settle(page);
  await shot("28-today-checked-in", {
    highlight: page.getByText("เช็กอินวันนี้แล้ว").locator(".."),
  });
  await shot("29-today-score-after", {
    scrollTo: page.getByRole("heading", { name: "คะแนนสุขภาพของคุณ" }),
    highlight: page.locator("#score-h").locator(".."),
  });

  // mark a daily action as done
  const first = page
    .locator("#actions-h")
    .locator("../..")
    .locator("li")
    .nth(1);
  await shot("30-today-action-before", {
    scrollTo: page.getByRole("heading", { name: "3 สิ่งที่ควรทำวันนี้" }),
    highlight: first,
  });
  await first.getByRole("button", { name: /ทำแล้ว/ }).click();
  await first.getByRole("button", { name: /ยกเลิกการติ๊ก/ }).waitFor();
  await settle(page);
  await shot("31-today-action-done", {
    scrollTo: page.getByRole("heading", { name: "3 สิ่งที่ควรทำวันนี้" }),
    highlight: page.locator("#actions-h").locator("../.."),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Health profile
// ═══════════════════════════════════════════════════════════════════════════════
async function profile(S) {
  const { page, shot } = S;
  await go(page, "/today");
  const card = link(page, /ตั้งค่าโปรไฟล์สุขภาพ/, false);
  await shot("32-today-profile-card", { scrollTo: card, highlight: card });
  await card.click();
  await page.waitForURL(/\/profile/, { waitUntil: "commit" });
  await settle(page);
  await shot("33-profile-open", {});
  await page.locator("#birth_year").fill("1988");
  await choose(page, /เพศ/, "หญิง");
  await choose(page, /สูบบุหรี่/, "ไม่เคยสูบ");
  await choose(page, /ดื่มแอลกอฮอล์/, "นาน ๆ ครั้ง");
  await choose(page, /ออกกำลังกาย/, "3");
  await shot("34-profile-basic", { highlight: page.locator("#birth_year") });
  await page
    .getByRole("group", { name: /โรคประจำตัว/ })
    .scrollIntoViewIfNeeded();
  await shot("35-profile-conditions", {
    scrollTo: page.getByRole("group", { name: /โรคประจำตัว/ }),
    highlight: page.getByRole("group", { name: /โรคประจำตัว/ }),
  });
  await choose(page, /อยากให้รู้สุขช่วย/, "นอนหลับดีขึ้น");
  await shot("36-profile-goals", {
    scrollTo: page.getByRole("group", { name: /อยากให้รู้สุขช่วย/ }),
    highlight: page.getByRole("group", { name: /อยากให้รู้สุขช่วย/ }),
  });
  await btn(page, "บันทึก").click();
  await page.waitForURL(/saved=1/, { waitUntil: "commit" });
  await settle(page);
  await shot("37-profile-saved", { highlight: page.getByRole("status") });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Health quiz, signed in
// ═══════════════════════════════════════════════════════════════════════════════
async function quizSigned(S) {
  const { page, shot } = S;
  await go(page, "/today");
  const card = link(page, /ประเมินสุขภาพ \+ แผน 7 วัน/, false);
  await shot("38-today-quiz-card", { scrollTo: card, highlight: card });
  await card.click();
  await page.waitForURL(/\/quiz/, { waitUntil: "commit" });
  await settle(page);
  await shot("39-quiz-prefilled", { highlight: page.locator("#birth_year") });
  await choose(page, /นอนประมาณกี่ชั่วโมง/, "7–8 ชม.");
  await choose(page, /ผักและผลไม้/, "3–4");
  await choose(page, /เครียดแค่ไหน/, "ปานกลาง");
  await choose(page, /ตรวจสุขภาพประจำปี/, "ยังไม่ได้ตรวจ");
  await btn(page, "ดูผลของฉัน").click();
  await page.getByText("อายุสุขภาพโดยประมาณ").waitFor();
  await settle(page);
  await shot("40-quiz-saved-result", {});
  await shot("41-quiz-saved-plan", {
    scrollTo: page.getByText("แผน 7 วัน").first(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Check-up interest (lead)
// ═══════════════════════════════════════════════════════════════════════════════
async function checkup(S) {
  const { page, shot, admin, M } = S;
  await go(page, "/today");
  const card = link(page, /สนใจตรวจสุขภาพ/, false);
  await shot("42-today-lead-card", { scrollTo: card, highlight: card });
  await card.click();
  await page.waitForURL(/\/checkup-interest/, { waitUntil: "commit" });
  await settle(page);
  await shot("43-lead-open", {});
  await page.getByLabel("แพ็กเกจตรวจสุขภาพ").check();
  await page.getByLabel("โทรศัพท์").check();
  await page.getByLabel("เบอร์โทรศัพท์").fill("0800000000");
  await page
    .getByLabel(/อยากบอกอะไรเพิ่มเติม/)
    .fill("สะดวกให้โทรหลัง 17.00 น. (ตัวอย่าง)");
  await shot("44-lead-filled", {
    highlight: [
      page.getByLabel("เบอร์โทรศัพท์"),
      page.getByLabel(/อยากบอกอะไรเพิ่มเติม/),
    ],
  });
  await page
    .getByRole("checkbox", { name: /ฉันยินยอมให้ทีมรู้สุขติดต่อกลับ/ })
    .check();
  await shot("45-lead-consent", {
    scrollTo: btn(page, "ส่งคำขอ"),
    highlight: [
      page.getByRole("checkbox", { name: /ฉันยินยอมให้ทีมรู้สุขติดต่อกลับ/ }),
      btn(page, "ส่งคำขอ"),
    ],
  });
  await btn(page, "ส่งคำขอ").click();
  await page.getByText("ส่งคำขอแล้ว ทีมรู้สุขจะติดต่อกลับ").waitFor();
  await shot("46-lead-sent", { highlight: page.getByRole("status") });
  await go(page, "/checkup-interest");
  await shot("47-lead-open-request", { highlight: btn(page, "ยกเลิกคำขอ") });
  cleanup.push(async () =>
    admin.from("checkup_leads").delete().eq("user_id", M.id),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Seeded history: earlier lab reports, meals and a body scan (what weeks of use would have stored)
// ═══════════════════════════════════════════════════════════════════════════════
const labItem = (o) => ({
  marker_key: null,
  value_std: null,
  status: "unknown",
  printed_range: "",
  confidence: 0.95,
  unit: "",
  ...o,
});
async function ensureHistory(S) {
  if (S.history) return;
  S.history = true;
  const { admin, M } = S;
  const report = async (date, items) => {
    const { data, error } = await admin
      .from("lab_reports")
      .insert({
        user_id: M.id,
        status: "confirmed",
        collected_on: date,
        confirmed_at: new Date().toISOString(),
        items,
        model: "sample/none",
      })
      .select("id");
    if (error) throw error;
    const rows = items
      .filter((i) => i.marker_key)
      .map((i) => ({
        user_id: M.id,
        report_id: data[0].id,
        marker_key: i.marker_key,
        name: i.name,
        value: i.value,
        unit: i.unit,
        value_std: i.value_std,
        status: i.status,
        collected_on: date,
      }));
    const r2 = await admin.from("lab_results").insert(rows);
    if (r2.error) throw r2.error;
  };
  const it = (name, key, value, unit, status) =>
    labItem({ name, marker_key: key, value, unit, value_std: value, status });
  await report("2026-03-01", [
    it("FBS", "fasting_glucose", 92, "mg/dL", "normal"),
    it("LDL-C", "ldl", 121, "mg/dL", "normal"),
    it("HbA1c", "hba1c", 5.1, "%", "normal"),
  ]);
  await report("2026-06-01", [
    it("FBS", "fasting_glucose", 99, "mg/dL", "normal"),
    it("LDL-C", "ldl", 138, "mg/dL", "watch"),
    it("HbA1c", "hba1c", 5.2, "%", "normal"),
  ]);
  // meals on the days before today (confirmed, as if scanned earlier)
  const meal = (n, items) => {
    const per = items.reduce(
      (a, i) => ({
        k: a.k + i.per_serving.kcal * i.servings,
        p: a.p + i.per_serving.protein_g * i.servings,
        c: a.c + i.per_serving.carbs_g * i.servings,
        f: a.f + i.per_serving.fat_g * i.servings,
      }),
      { k: 0, p: 0, c: 0, f: 0 },
    );
    return {
      user_id: M.id,
      meal_date: day(-n),
      status: "confirmed",
      items,
      kcal: Math.round(per.k),
      protein_g: per.p,
      carbs_g: per.c,
      fat_g: per.f,
      model: "sample/none",
      confirmed_at: new Date().toISOString(),
    };
  };
  const food = (name, key, kcal, p, c, f, servings = 1) => ({
    name,
    catalog_key: key,
    servings,
    source: "catalog",
    confidence: 0.9,
    per_serving: { kcal, protein_g: p, carbs_g: c, fat_g: f },
  });
  const meals = [
    meal(1, [food("ข้าวกะเพราหมูสับ", "basil_pork_rice", 560, 22, 62, 24)]),
    meal(1, [
      food("ส้มตำไทย", "papaya_salad", 120, 4, 22, 3),
      food("ไก่ย่าง", "grilled_chicken", 250, 28, 3, 14),
    ]),
    meal(2, [food("ก๋วยเตี๋ยวเรือ", "boat_noodles", 250, 14, 32, 7, 2)]),
    meal(3, [food("ข้าวผัด", "fried_rice", 520, 14, 70, 20)]),
    meal(4, [
      food("ต้มยำกุ้ง", "tom_yum_goong", 120, 14, 8, 4),
      food("ข้าวสวย", "steamed_rice", 200, 4, 44, 0.5),
    ]),
    meal(6, [food("ผัดไทย", "pad_thai", 600, 22, 80, 21)]),
    meal(8, [food("ข้าวราดแกง", "curry_rice", 560, 20, 65, 24)]),
  ];
  const r = await admin.from("meal_logs").insert(meals);
  if (r.error) throw r.error;
  const b = await admin.from("body_scans").insert({
    user_id: M.id,
    height_cm: 163,
    weight_kg: 58,
    est_weight_low: 56,
    est_weight_high: 61,
    bmi_low: 21.8,
    bmi_high: 21.8,
    bmi_band: "healthy",
    bmi_basis: "measured",
    confidence: 0.7,
    face_note: "none",
    palm_note: "none",
    model: "sample/none",
    created_at: isoDaysAgo(20),
  });
  if (b.error) throw b.error;
}

const keepChoice = async (page, value = "discard") => {
  const radio = page.locator(
    `input[type="radio"][name="keepFile"][value="${value}"]`,
  );
  if (await radio.count()) await radio.check();
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Scan hub + food (photo, barcode)
// ═══════════════════════════════════════════════════════════════════════════════
register("scan-food", async (S) => {
  const { page, shot, admin, M, fx } = S;
  await ensureHistory(S);
  await go(page, "/today");
  const scanTab = page
    .getByRole("navigation", { name: "เมนูด้านล่าง" })
    .getByRole("link", { name: "สแกน" });
  await shot("50-bottom-bar", { highlight: scanTab });
  await scanTab.click();
  await page.waitForURL(/\/scan$/, { waitUntil: "commit" });
  await settle(page);
  await shot("51-scan-hub", { highlight: link(page, /สแกนอาหาร/, false) });
  await link(page, /สแกนอาหาร/, false).click();
  await page.waitForURL(/\/scan\/food$/, { waitUntil: "commit" });
  await settle(page);
  await shot("52-food-open", {
    highlight: [
      page.getByText("ถ่ายรูปอาหาร", { exact: true }),
      page.getByText("เลือกรูปจากเครื่อง", { exact: true }),
    ],
  });
  await page.locator("#photo").setInputFiles(fx["food.jpg"]);
  await page.getByAltText("ตัวอย่างรูปอาหารที่เลือก").waitFor();
  await settle(page);
  await shot("53-food-photo-chosen", {
    highlight: page.getByAltText("ตัวอย่างรูปอาหารที่เลือก"),
  });
  await keepChoice(page, "discard");
  await shot("54-food-keep-choice", {
    scrollTo: page.getByRole("group", { name: /เก็บไฟล์ต้นฉบับ/ }),
    highlight: page.getByRole("group", { name: /เก็บไฟล์ต้นฉบับ/ }),
  });
  await shot("55-food-analyze-button", {
    scrollTo: btn(page, "วิเคราะห์อาหาร"),
    highlight: btn(page, "วิเคราะห์อาหาร"),
  });

  // What the analysis writes (AI is not available in the sandbox): a draft with a catalog dish and a low-confidence guess.
  const items = [
    {
      name: "ผัดไทย",
      catalog_key: "pad_thai",
      servings: 1,
      source: "catalog",
      confidence: 0.9,
      per_serving: { kcal: 600, protein_g: 22, carbs_g: 80, fat_g: 21 },
    },
    {
      name: "ขนมไทยไม่ทราบชนิด",
      catalog_key: null,
      servings: 1,
      source: "ai",
      confidence: 0.3,
      per_serving: { kcal: 100, protein_g: 1, carbs_g: 20, fat_g: 2 },
    },
  ];
  const seeded = await admin
    .from("meal_logs")
    .insert({
      user_id: M.id,
      meal_date: day(0),
      status: "draft",
      items,
      kcal: 700,
      protein_g: 23,
      carbs_g: 100,
      fat_g: 23,
      model: "sample/none",
    })
    .select("id");
  if (seeded.error) throw seeded.error;
  const mealId = seeded.data[0].id;
  await go(page, `/scan/food/${mealId}`);
  await shot("56-food-review", {
    highlight: page.getByText("AI ประมาณการ ตรวจทานด้วยนะ"),
  });
  await shot("57-food-low-confidence", {
    scrollTo: page.getByText("AI ไม่ค่อยมั่นใจรายการนี้"),
    highlight: page.getByText("AI ไม่ค่อยมั่นใจรายการนี้"),
  });
  await page.locator('input[name="remove.1"]').check();
  await page.locator("#servings-0").selectOption("1.5");
  await shot("58-food-edited", {
    scrollTo: page.locator("#servings-0"),
    highlight: [
      page.locator("#servings-0"),
      page.locator('input[name="remove.1"]'),
    ],
  });
  await shot("59-food-confirm-button", {
    scrollTo: btn(page, "บันทึกมื้อนี้"),
    highlight: btn(page, "บันทึกมื้อนี้"),
  });
  await btn(page, "บันทึกมื้อนี้").click();
  await page.getByRole("heading", { name: "บันทึกมื้ออาหารแล้ว" }).waitFor();
  await settle(page);
  await shot("60-food-saved", {
    highlight: page.getByRole("heading", { name: "บันทึกมื้ออาหารแล้ว" }),
  });
  await shot("61-food-share", {
    scrollTo: page.getByRole("heading", { name: "การ์ดสำหรับแชร์" }),
    highlight: page
      .getByRole("heading", { name: "การ์ดสำหรับแชร์" })
      .locator(".."),
  });
});

register("scan-barcode", async (S) => {
  const { page, shot } = S;
  await go(page, "/scan/food");
  const box = page.getByRole("region", { name: "สแกนบาร์โค้ดสินค้า" });
  await shot("62-barcode-section", { scrollTo: box, highlight: box });
  await box.getByLabel("เลขบาร์โค้ด").fill("4006381 333931");
  await shot("63-barcode-typed", {
    scrollTo: box,
    highlight: box.getByLabel("เลขบาร์โค้ด"),
  });
  await box.getByRole("button", { name: "ค้นหาสินค้า" }).click();
  await page.waitForURL(/\/scan\/food\/[0-9a-f-]{36}/, { waitUntil: "commit" });
  await settle(page);
  await shot("64-barcode-draft", {
    highlight: page.getByText(/Open Food Facts/).first(),
  });
  await btn(page, "บันทึกมื้อนี้").click();
  await page.getByRole("heading", { name: "บันทึกมื้ออาหารแล้ว" }).waitFor();
  await settle(page);
  await shot("65-barcode-saved", {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Lab scan
// ═══════════════════════════════════════════════════════════════════════════════
register("scan-lab", async (S) => {
  const { page, shot, admin, M, fx } = S;
  await ensureHistory(S);
  await go(page, "/scan");
  await link(page, /สแกนผลแล็บ/, false).click();
  await page.waitForURL(/\/scan\/lab$/, { waitUntil: "commit" });
  await settle(page);
  await shot("70-lab-open", {
    highlight: page.getByText("เลือกไฟล์หรือถ่ายรูปผลตรวจ"),
  });
  await page.locator("#file").setInputFiles(fx["lab.png"]);
  await page.getByAltText("ตัวอย่างรูปผลตรวจที่เลือก").waitFor();
  await keepChoice(page, "discard");
  await shot("71-lab-chosen", {
    highlight: page.getByAltText("ตัวอย่างรูปผลตรวจที่เลือก"),
  });
  await shot("72-lab-analyze-button", {
    scrollTo: btn(page, "อ่านผลตรวจ"),
    highlight: btn(page, "อ่านผลตรวจ"),
  });

  const it = (name, key, value, unit, status, extra = {}) =>
    labItem({
      name,
      marker_key: key,
      value,
      unit,
      value_std: value,
      status,
      ...extra,
    });
  const items = [
    it("Fasting Glucose (FBS)", "fasting_glucose", 104, "mg/dL", "watch", {
      printed_range: "70-99",
    }),
    it("HbA1c", "hba1c", 5.3, "%", "normal", { printed_range: "4.0-5.6" }),
    it("Total Cholesterol", "total_cholesterol", 212, "mg/dL", "watch", {
      printed_range: "< 200",
    }),
    it("LDL-C", "ldl", 148, "mg/dL", "watch", { printed_range: "< 130" }),
    it("HDL-C", "hdl", 58, "mg/dL", "normal", { printed_range: "> 50" }),
    it("Triglycerides", "triglycerides", 126, "mg/dL", "normal", {
      printed_range: "< 150",
    }),
    labItem({
      name: "Creatinine",
      marker_key: "creatinine",
      value: 8.2,
      unit: "mg/dL",
      value_std: 8.2,
      status: "abnormal",
      confidence: 0.45,
      printed_range: "0.5-1.1",
    }),
    it("ALT (SGPT)", "alt", 24, "U/L", "normal", { printed_range: "7-35" }),
  ];
  const seeded = await admin
    .from("lab_reports")
    .insert({
      user_id: M.id,
      status: "draft",
      collected_on: "2026-09-01",
      items,
      model: "sample/none",
    })
    .select("id");
  if (seeded.error) throw seeded.error;
  const id = seeded.data[0].id;
  await go(page, `/scan/lab/${id}`);
  await shot("73-lab-review", {
    highlight: page.getByText(/AI อ่านค่าจากเอกสาร อาจอ่านผิดได้/),
  });
  await shot("74-lab-low-confidence", {
    scrollTo: page.getByText("AI ไม่ค่อยมั่นใจรายการนี้"),
    highlight: page.getByText("AI ไม่ค่อยมั่นใจรายการนี้").locator("../.."),
  });
  await page.locator("#value-6").fill("0.82");
  await shot("75-lab-fixed", {
    scrollTo: page.locator("#value-6"),
    highlight: page.locator("#value-6"),
  });
  await shot("76-lab-confirm-button", {
    scrollTo: btn(page, "บันทึกผลตรวจ"),
    highlight: btn(page, "บันทึกผลตรวจ"),
  });
  await btn(page, "บันทึกผลตรวจ").click();
  await page.getByRole("heading", { name: "ผลตรวจของคุณ" }).waitFor();
  await settle(page);
  await shot("77-lab-result", {
    highlight: page.getByText(
      /พบ \d+ รายการที่อยู่นอกช่วงอ้างอิงทั่วไป|ทุกรายการที่ประเมินได้/,
    ),
  });
  await shot("78-lab-statuses", {
    scrollTo: page.getByText("ควรติดตาม").first(),
    highlight: page.getByText("ควรติดตาม").first().locator("../.."),
  });
  await shot("79-lab-previous", {
    scrollTo: page.getByText(/ครั้งก่อน/).first(),
    highlight: page.getByText(/ครั้งก่อน/).first(),
  });
  await shot("80-lab-explain-button", {
    scrollTo: btn(page, "อธิบายผลด้วย AI"),
    highlight: btn(page, "อธิบายผลด้วย AI"),
  });
  const explanation = {
    summary:
      "ตัวอย่างคำอธิบาย: น้ำตาลหลังอดอาหารและไขมัน LDL อยู่เหนือช่วงอ้างอิงทั่วไปเล็กน้อย ส่วนค่าอื่น ๆ อยู่ในช่วงปกติ ค่าเหล่านี้เป็นเพียงข้อมูลประกอบ ลองนำผลไปคุยกับแพทย์เพื่อดูภาพรวมร่วมกับอาการและประวัติของคุณ",
    seeDoctor: true,
    items: {
      fasting_glucose:
        "น้ำตาลหลังอดอาหารสูงกว่าช่วงอ้างอิงเล็กน้อย ควรติดตามผลซ้ำตามที่แพทย์แนะนำ",
      ldl: "ไขมัน LDL สูงกว่าช่วงอ้างอิงเล็กน้อย แพทย์จะช่วยดูร่วมกับปัจจัยอื่นของคุณ",
    },
  };
  const up = await admin
    .from("lab_reports")
    .update({ explanation, explained_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (up.error || up.data.length !== 1)
    throw new Error("explanation seed failed");
  await go(page, `/scan/lab/${id}`);
  await shot("81-lab-explained", {
    scrollTo: page.getByRole("heading", { name: "คำอธิบายจาก AI" }),
    highlight: page
      .getByRole("heading", { name: "คำอธิบายจาก AI" })
      .locator(".."),
  });
  S.labId = id;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Body scan
// ═══════════════════════════════════════════════════════════════════════════════
register("scan-body", async (S) => {
  const { page, shot, admin, M, fx } = S;
  await go(page, "/scan");
  await link(page, /สแกนร่างกาย/, false).click();
  await page.waitForURL(/\/scan\/body$/, { waitUntil: "commit" });
  await settle(page);
  await shot("82-body-open", {});
  await page.getByLabel("ส่วนสูง (ซม.)").fill("163");
  await page.getByLabel(/น้ำหนักปัจจุบัน/).fill("58");
  await shot("83-body-height-weight", {
    highlight: [
      page.getByLabel("ส่วนสูง (ซม.)"),
      page.getByLabel(/น้ำหนักปัจจุบัน/),
    ],
  });
  await page.locator("#photoBody-file").setInputFiles(fx["body.png"]);
  await page.locator("#photoFace-file").setInputFiles(fx["face.png"]);
  await page.locator("#photoPalm-file").setInputFiles(fx["palm.png"]);
  await page.waitForTimeout(800);
  await shot("84-body-photos", {
    scrollTo: page.locator("#photoBody-file"),
    highlight: [
      page.getByRole("group", { name: "รูปเต็มตัว (จำเป็น)" }),
      page.getByRole("group", { name: "รูปใบหน้า (ไม่บังคับ)" }),
      page.getByRole("group", { name: "รูปฝ่ามือ (ไม่บังคับ)" }),
    ],
  });
  const adult = page.getByRole("checkbox", { name: "ฉันอายุ 18 ปีขึ้นไป" });
  if (await adult.count()) await adult.check();
  await page
    .getByRole("checkbox", { name: /ฉันเข้าใจว่ารูปถูกส่งให้ AI/ })
    .check();
  await keepChoice(page, "discard");
  await shot("85-body-ack", {
    scrollTo: btn(page, "ประเมินจากรูป"),
    highlight: [
      page.getByRole("checkbox", { name: /ฉันเข้าใจว่ารูปถูกส่งให้ AI/ }),
      btn(page, "ประเมินจากรูป"),
    ],
  });

  const seeded = await admin
    .from("body_scans")
    .insert({
      user_id: M.id,
      height_cm: 163,
      est_weight_low: 55,
      est_weight_high: 62,
      bmi_low: 20.7,
      bmi_high: 23.3,
      bmi_band: "healthy",
      bmi_basis: "estimated",
      confidence: 0.7,
      face_note: "none",
      palm_note: "unclear",
      model: "sample/none",
    })
    .select("id");
  if (seeded.error) throw seeded.error;
  const id = seeded.data[0].id;
  await go(page, `/scan/body/${id}`);
  await shot("86-body-result", {
    highlight: page.getByRole("heading", { name: "BMI" }).locator(".."),
  });
  await shot("87-body-notes", {
    scrollTo: page.getByRole("heading", { name: "ข้อสังเกตจากภาพ" }),
    highlight: page
      .getByRole("heading", { name: "ข้อสังเกตจากภาพ" })
      .locator(".."),
  });
  await page.getByLabel("ใส่หรือแก้น้ำหนักจริง (กก.)").fill("58");
  await shot("88-body-weight-typed", {
    scrollTo: page.getByLabel("ใส่หรือแก้น้ำหนักจริง (กก.)"),
    highlight: page.getByLabel("ใส่หรือแก้น้ำหนักจริง (กก.)"),
  });
  await btn(page, "บันทึกน้ำหนัก").click();
  await page.getByText(/คำนวณจากน้ำหนักที่คุณกรอก/).waitFor();
  await settle(page);
  await shot("89-body-measured", {
    highlight: page.getByText(/คำนวณจากน้ำหนักที่คุณกรอก/),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Timeline
// ═══════════════════════════════════════════════════════════════════════════════
register("timeline", async (S) => {
  const { page, shot } = S;
  await ensureHistory(S);
  const tab = page
    .getByRole("navigation", { name: "เมนูด้านล่าง" })
    .getByRole("link", { name: "ไทม์ไลน์" });
  await go(page, "/today");
  await tab.click();
  await page.waitForURL(/\/timeline/, { waitUntil: "commit" });
  await settle(page);
  await shot("90-timeline-open", {
    highlight: page.getByRole("heading", { name: "คะแนนรายวัน" }).locator(".."),
  });
  await shot("91-timeline-range", {
    highlight: page.getByRole("navigation", { name: "ช่วงเวลา" }),
  });
  await page
    .getByRole("navigation", { name: "ช่วงเวลา" })
    .getByRole("link", { name: "90 วัน" })
    .click();
  await page.waitForURL(/range=90/, { waitUntil: "commit" });
  await settle(page);
  await shot("92-timeline-90", {
    highlight: page.getByRole("navigation", { name: "ช่วงเวลา" }),
  });
  await shot("93-timeline-kcal", {
    scrollTo: page.getByRole("heading", { name: /พลังงานจากมื้อที่บันทึก/ }),
    highlight: page
      .getByRole("heading", { name: /พลังงานจากมื้อที่บันทึก/ })
      .locator(".."),
  });
  await shot("94-timeline-markers", {
    scrollTo: page.getByRole("heading", { name: "แนวโน้มผลตรวจ" }),
    highlight: page
      .getByRole("heading", { name: "แนวโน้มผลตรวจ" })
      .locator(".."),
  });
  const labs = page.getByRole("heading", { name: "ผลตรวจสุขภาพ" });
  await shot("95-timeline-labs", {
    scrollTo: labs,
    highlight: labs.locator(".."),
  });
  await shot("96-timeline-body", {
    scrollTo: page.getByRole("heading", { name: "ร่างกาย" }),
    highlight: page.getByRole("heading", { name: "ร่างกาย" }).locator(".."),
  });
  await go(page, "/timeline?range=90&type=all");
  const filter = page.getByRole("list", { name: "แสดง" });
  await shot("97-timeline-filter", { scrollTo: filter, highlight: filter });
  await filter.getByRole("link", { name: "มื้ออาหาร" }).click();
  await page.waitForURL(/type=meal/, { waitUntil: "commit" });
  await settle(page);
  await shot("98-timeline-filtered", {
    scrollTo: page.getByRole("list", { name: "แสดง" }),
    highlight: page.getByRole("list", { name: "แสดง" }),
  });
  await go(page, "/timeline?range=90&type=all");
  const hist = page.getByRole("heading", { name: "ประวัติเช็กอิน" });
  await shot("99-timeline-history", {
    scrollTo: hist,
    highlight: hist.locator(".."),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Ask AI (the emergency safeguard is real; answers from a model are samples)
// ═══════════════════════════════════════════════════════════════════════════════
register("ask", async (S) => {
  const { page, shot, admin, M } = S;
  const tab = page
    .getByRole("navigation", { name: "เมนูด้านล่าง" })
    .getByRole("link", { name: "ถาม AI" });
  await go(page, "/today");
  await tab.click();
  await page.waitForURL(/\/ask$/, { waitUntil: "commit" });
  await settle(page);
  await shot("100-ask-open", {
    highlight: page.getByText("ยังไม่มีบทสนทนา ลองถามอะไรสักอย่างได้เลย"),
  });
  await page
    .locator("#message")
    .fill(
      "ผลน้ำตาลหลังอดอาหารของฉัน 104 หมายความว่าอะไร และควรเตรียมคำถามอะไรไปถามหมอบ้าง",
    );
  await shot("101-ask-typed", { highlight: page.locator("#message") });
  await shot("102-ask-voice", {
    scrollTo: page.getByRole("button", { name: /พูดแทนการพิมพ์/ }),
    highlight: page.getByRole("button", { name: /พูดแทนการพิมพ์/ }),
  });
  await shot("103-ask-send", {
    scrollTo: btn(page, "ถาม"),
    highlight: btn(page, "ถาม"),
  });

  // Emergency words never reach a model: this reply is real (no AI is involved).
  await page.locator("#message").fill("เจ็บหน้าอกมากและหายใจไม่ออก");
  await btn(page, "ถาม").click();
  await page
    .getByText(/โทร 1669/)
    .first()
    .waitFor({ timeout: 30_000 });
  await settle(page);
  await shot("104-ask-emergency", {
    scrollTo: page.getByText(/โทร 1669/).first(),
    highlight: page
      .getByText(/โทร 1669/)
      .first()
      .locator("xpath=ancestor::li[1]"),
  });

  // A normal answer as a model would write it (sample text), with the doctor pointer and the disclaimer.
  const conv = await admin
    .from("ai_conversations")
    .insert({ user_id: M.id, kind: "chat" })
    .select("id");
  if (conv.error) throw conv.error;
  const cid = conv.data[0].id;
  const msgs = [
    [
      "user",
      "ผลน้ำตาลหลังอดอาหารของฉัน 104 หมายความว่าอะไร และควรเตรียมคำถามอะไรไปถามหมอบ้าง",
      null,
    ],
    [
      "assistant",
      "ตัวอย่างคำตอบ: ค่าน้ำตาลหลังอดอาหาร 104 mg/dL สูงกว่าช่วงอ้างอิงทั่วไป (70–99) เล็กน้อย ซึ่งแปลว่าเป็นค่าที่ควรติดตาม ไม่ได้แปลว่าเป็นโรคใด ๆ\n\nคำถามที่อาจนำไปถามแพทย์:\n1. ควรตรวจซ้ำเมื่อไหร่\n2. มีปัจจัยอื่น เช่น การนอนหรืออาหารมื้อก่อนตรวจ ที่ทำให้ค่าสูงขึ้นไหม\n3. ควรตรวจอะไรเพิ่มเติมหรือไม่",
      "see_doctor",
    ],
  ];
  for (const [role, content, flag] of msgs) {
    const r = await admin.from("ai_messages").insert({
      conversation_id: cid,
      user_id: M.id,
      role,
      content: content,
      flag,
      model: "sample/none",
    });
    if (r.error) throw r.error;
  }
  await go(page, "/ask");
  await shot("105-ask-answer", {
    highlight: page.getByText("ควรปรึกษาแพทย์ในเร็ว ๆ นี้เกี่ยวกับเรื่องนี้"),
  });
  await shot("106-ask-disclaimer", {
    scrollTo: page.getByText(/คำตอบนี้เป็นข้อมูลทั่วไป/).last(),
    highlight: page.getByText(/คำตอบนี้เป็นข้อมูลทั่วไป/).last(),
  });
  await shot("107-ask-new", {
    scrollTo: btn(page, "เริ่มสนทนาใหม่"),
    highlight: btn(page, "เริ่มสนทนาใหม่"),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. AI Health Agent
// ═══════════════════════════════════════════════════════════════════════════════
register("agent", async (S) => {
  const { page, shot, admin, M } = S;
  await go(page, "/agent");
  await shot("110-agent-open", {
    highlight: page.getByText("ลองถาม", { exact: true }),
  });
  await page.getByRole("button", { name: "สรุปเดือนนี้ให้หน่อย" }).click();
  await shot("111-agent-suggestion", {
    highlight: page.locator("#agent-message"),
  });
  await shot("112-agent-send", {
    scrollTo: btn(page, "ส่ง"),
    highlight: btn(page, "ส่ง"),
  });
  const conv = await admin
    .from("ai_conversations")
    .insert({ user_id: M.id, kind: "agent" })
    .select("id");
  if (conv.error) throw conv.error;
  const cid = conv.data[0].id;
  const rows = [
    ["user", "สรุปเดือนนี้ให้หน่อย และเตือนฉันพรุ่งนี้ให้เช็กอินสุขภาพ", null],
    ["assistant", "get_monthly_summary", "tool"],
    ["assistant", "set_reminder: พรุ่งนี้ — เช็กอินสุขภาพ", "tool"],
    [
      "assistant",
      "ตัวอย่างคำตอบ: เดือนนี้คุณเช็กอินต่อเนื่อง เริ่มเห็นรูปแบบการนอนที่สม่ำเสมอขึ้น ด้านอาหารยังมีที่ให้ปรับเล็กน้อย เช่น เพิ่มผักในมื้อกลางวัน ฉันตั้งเตือนให้คุณเช็กอินพรุ่งนี้แล้ว",
      null,
    ],
  ];
  for (const [role, content, flag] of rows) {
    const r = await admin.from("ai_messages").insert({
      conversation_id: cid,
      user_id: M.id,
      role,
      content,
      flag,
      model: "sample/none",
    });
    if (r.error) throw r.error;
  }
  const rem = await admin
    .from("agent_reminders")
    .insert({ user_id: M.id, remind_on: day(1), text: "เช็กอินสุขภาพ" });
  if (rem.error) throw rem.error;
  await go(page, "/agent");
  await shot("113-agent-answer", {
    highlight: page.getByText("ตั้งเตือนแล้ว", { exact: false }).first(),
  });
  await shot("114-agent-reminders", {
    scrollTo: page.getByRole("heading", { name: "เตือนที่รออยู่" }),
    highlight: page
      .getByRole("heading", { name: "เตือนที่รออยู่" })
      .locator(".."),
  });
  await shot("115-agent-new", {
    scrollTo: btn(page, "เริ่มบทสนทนาใหม่"),
    highlight: btn(page, "เริ่มบทสนทนาใหม่"),
  });
  await section(page, "เตือนที่รออยู่")
    .getByRole("button", { name: "ยกเลิก" })
    .first()
    .click();
  await page.getByText("ยังไม่มีเตือนที่รออยู่").waitFor();
  await settle(page);
  await shot("116-agent-reminder-cancelled", {
    scrollTo: page.getByRole("heading", { name: "เตือนที่รออยู่" }),
    highlight: page
      .getByRole("heading", { name: "เตือนที่รออยู่" })
      .locator(".."),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Monthly report
// ═══════════════════════════════════════════════════════════════════════════════
register("report", async (S) => {
  const { page, shot, admin, M } = S;
  await ensureHistory(S);
  await go(page, "/today");
  await page.getByRole("button", { name: "เพิ่มเติม", exact: true }).click();
  await shot("120-more-report", {
    highlight: page
      .getByRole("dialog")
      .getByRole("link", { name: "รายงานรายเดือน" }),
  });
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "รายงานรายเดือน" })
    .click();
  await page.waitForURL(/\/report/, { waitUntil: "commit" });
  await settle(page);
  await shot("121-report-open", {
    highlight: page.getByRole("navigation", { name: "เลือกเดือน" }),
  });
  await shot("122-report-figures", {
    scrollTo: page.getByText(/เช็กอิน \d+ วัน จาก/),
    highlight: page
      .getByText(/เช็กอิน \d+ วัน จาก/)
      .locator("xpath=ancestor::section[1]"),
  });
  await shot("123-report-ai-button", {
    scrollTo: page.getByRole("button", { name: "ให้ AI สรุปเดือนนี้" }),
    highlight: page.getByRole("button", { name: "ให้ AI สรุปเดือนนี้" }),
  });
  const month = `${day(0).slice(0, 7)}-01`;
  const r = await admin.from("monthly_reports").insert({
    user_id: M.id,
    month,
    summary:
      "ตัวอย่างสรุป: เดือนนี้คุณมาเช็กอินสม่ำเสมอและเริ่มเห็นรูปแบบการนอนที่ดีขึ้น คะแนนสุขภาพเฉลี่ยอยู่ในเกณฑ์ดี ด้านอาหารยังเป็นเรื่องที่ลองปรับเล็ก ๆ น้อย ๆ ได้",
    highlights: [
      "เช็กอินต่อเนื่องหลายวันติดกัน",
      "บันทึกมื้ออาหารและผลตรวจเพิ่มขึ้น",
    ],
    next_steps: [
      "ลองเพิ่มผักหรือผลไม้ในมื้อถัดไปหนึ่งอย่าง",
      "พาผลตรวจไปคุยกับแพทย์ในนัดครั้งหน้า",
    ],
    model: "sample/none",
  });
  if (r.error) throw r.error;
  await go(page, "/report");
  await shot("124-report-ai-summary", {
    scrollTo: page.getByRole("heading", { name: "สรุปโดย AI" }),
    highlight: page.getByRole("heading", { name: "สรุปโดย AI" }).locator(".."),
  });
  await shot("125-report-delete", {
    scrollTo: btn(page, "ลบสรุปนี้ (เพื่อให้เขียนใหม่)"),
    highlight: btn(page, "ลบสรุปนี้ (เพื่อให้เขียนใหม่)"),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Challenges (solo + with a friend)
// ═══════════════════════════════════════════════════════════════════════════════
register("challenges", async (S) => {
  const { page, shot } = S;
  S.B ??= await newUser("คุณใจดี");
  await go(page, "/today");
  await page.getByRole("button", { name: "เพิ่มเติม", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "ชาเลนจ์" }).click();
  await page.waitForURL(/\/challenges/, { waitUntil: "commit" });
  await settle(page);
  await shot("130-challenges-open", {});
  const card = (name) =>
    page
      .locator("li.card")
      .filter({ has: page.getByRole("heading", { name }) });
  await shot("131-challenges-templates", {
    scrollTo: page.getByRole("heading", { name: "เริ่มชาเลนจ์ใหม่" }),
    highlight: card("เช็กอิน 10 วันใน 14 วัน"),
  });
  await card("เช็กอิน 10 วันใน 14 วัน")
    .getByRole("button", { name: "ทำคนเดียว" })
    .click();
  await page.getByText("เริ่มชาเลนจ์แล้ว ขอให้สนุกนะ").waitFor();
  await settle(page);
  await shot("132-challenge-solo", {
    highlight: page
      .getByRole("heading", { name: "กำลังทำอยู่" })
      .locator("xpath=following-sibling::ul[1]"),
  });
  await card("เช็กอินทุกวันใน 7 วัน")
    .getByRole("button", { name: "ชวนเพื่อน" })
    .click();
  await page.getByText("รหัสชาเลนจ์").first().waitFor({ state: "attached" });
  await settle(page);
  await shot("133-challenge-invite", {
    scrollTo: page.getByText(/ส่งรหัสหรือลิงก์นี้ให้เพื่อน/),
    highlight: page.getByText(/ส่งรหัสหรือลิงก์นี้ให้เพื่อน/).locator(".."),
  });
  const code = (
    await page
      .getByText(/ส่งรหัสหรือลิงก์นี้ให้เพื่อน/)
      .locator("..")
      .locator("p.tracking-widest")
      .innerText()
  )
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-8)
    .trim();
  const codeText = (
    await page
      .getByText(/ส่งรหัสหรือลิงก์นี้ให้เพื่อน/)
      .locator("..")
      .locator("p.tracking-widest")
      .innerText()
  )
    .replace("รหัสชาเลนจ์:", "")
    .trim();

  const b = await session(S, S.B);
  await go(b.page, "/challenges");
  await b.page.locator("#join-code").fill(codeText);
  await b.snap("134-challenge-join-code", {
    scrollTo: b.page.locator("#join-code"),
    highlight: b.page.locator("section", { has: b.page.locator("#join-code") }),
  });
  await b.page.getByRole("button", { name: "เข้าร่วม", exact: true }).click();
  await b.page.getByText("เข้าร่วมชาเลนจ์ของเพื่อนแล้ว").waitFor();
  await b.snap("135-challenge-joined", {});
  await b.close();
  await go(page, "/challenges");
  await shot("136-challenge-friend-progress", {
    scrollTo: page.getByText(/ทั้งคู่ทำสำเร็จก็ได้เครดิตทั้งคู่/).first(),
    highlight: page.getByText(/ทั้งคู่ทำสำเร็จก็ได้เครดิตทั้งคู่/).first(),
  });
  void code;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Health vault
// ═══════════════════════════════════════════════════════════════════════════════
register("vault", async (S) => {
  const { page, shot, fx } = S;
  await go(page, "/today");
  await page.getByRole("button", { name: "เพิ่มเติม", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "แฟ้มสุขภาพ" })
    .click();
  await page.waitForURL(/\/vault/, { waitUntil: "commit" });
  await settle(page);
  await shot("140-vault-open", {
    highlight: page.getByText(/ใช้ไป \d+ จาก|เก็บแล้ว \d+ ไฟล์/),
  });
  await page.locator("#vault-file").setInputFiles(fx["doc.pdf"]);
  await page.locator("#vault-title").fill("สรุปผลตรวจสุขภาพประจำปี (ตัวอย่าง)");
  await page.locator("#vault-category").selectOption("doctor_note");
  await page.locator("#vault-date").fill("2026-09-01");
  await shot("141-vault-form", {
    scrollTo: page.locator("#vault-file"),
    highlight: section(page, "เพิ่มเอกสาร"),
  });
  await shot("142-vault-save-button", {
    scrollTo: btn(page, "เก็บเข้าแฟ้ม"),
    highlight: btn(page, "เก็บเข้าแฟ้ม"),
  });
  await btn(page, "เก็บเข้าแฟ้ม").click();
  await page.getByText("เก็บเข้าแฟ้มแล้ว").first().waitFor();
  await settle(page);
  await shot("143-vault-saved", {
    highlight: page.getByText("เก็บเข้าแฟ้มแล้ว").first(),
  });
  await go(page, "/vault");
  await shot("144-vault-list", {
    scrollTo: page.getByRole("heading", { name: "เอกสารของฉัน" }),
    highlight: page
      .getByRole("link", { name: "เปิดไฟล์" })
      .first()
      .locator("xpath=ancestor::li[1]"),
  });
  await shot("145-vault-scans", {
    scrollTo: page.getByRole("heading", { name: "ไฟล์ที่เก็บไว้กับผลสแกน" }),
    highlight: page
      .getByRole("heading", { name: "ไฟล์ที่เก็บไว้กับผลสแกน" })
      .locator(".."),
  });
  // someone who has not given the photo/file consent
  S.N ??= await newUser("คุณไม่ให้รูป");
  const n = await session(S, S.N, { photos: false });
  await go(n.page, "/vault");
  await n.snap("146-vault-needs-consent", {
    highlight: n.page.getByText(
      "ต้องยินยอมเรื่องรูปภาพ/ไฟล์ก่อนจึงจะเก็บเอกสารได้",
    ),
  });
  await n.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Health passport
// ═══════════════════════════════════════════════════════════════════════════════
register("passport", async (S) => {
  const { page, shot, browser } = S;
  await go(page, "/today");
  await page.getByRole("button", { name: "เพิ่มเติม", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "พาสปอร์ตสุขภาพ" })
    .click();
  await page.waitForURL(/\/passport/, { waitUntil: "commit" });
  await settle(page);
  await shot("150-passport-open", {});
  await page.locator("#pp-label").fill("ตรวจกับหมอสมชาย");
  await page.locator("#pp-holder").fill("คุณสุขใจ");
  await shot("151-passport-name", {
    highlight: [page.locator("#pp-label"), page.locator("#pp-holder")],
  });
  await shot("152-passport-expiry", {
    scrollTo: page.locator("#pp-expiry"),
    highlight: page.locator("#pp-expiry"),
  });
  await shot("153-passport-sections", {
    scrollTo: page.getByText("ข้อมูลที่จะแสดง"),
    highlight: page.getByRole("group", { name: "ข้อมูลที่จะแสดง" }),
  });
  await shot("154-passport-brief", {
    scrollTo: page.getByText("ให้ AI เขียนสรุปก่อนพบแพทย์"),
    highlight: page
      .getByText("ให้ AI เขียนสรุปก่อนพบแพทย์")
      .locator("xpath=ancestor::label[1]"),
  });
  await page.locator('input[name="ack"]').check();
  await shot("155-passport-ack", {
    scrollTo: btn(page, "สร้างลิงก์"),
    highlight: [
      page.locator('input[name="ack"]').locator("xpath=ancestor::label[1]"),
      btn(page, "สร้างลิงก์"),
    ],
  });
  await btn(page, "สร้างลิงก์").click();
  await page.getByRole("heading", { name: "สร้างลิงก์แล้ว" }).waitFor();
  await settle(page);
  await shot("156-passport-created", {
    highlight: page.getByRole("img", { name: "QR ของลิงก์พาสปอร์ตสุขภาพ" }),
  });
  const url = (await page.getByTestId("passport-url").innerText())
    .trim()
    .replace("https://roosuk.netlify.app", BASE);
  await shot("157-passport-link", {
    scrollTo: page.getByTestId("passport-url"),
    highlight: page.getByTestId("passport-url"),
  });
  // what the doctor sees: the public page, opened with nothing but the link
  const doctor = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "th-TH",
  });
  await installHostRewrite(doctor);
  const dp = await doctor.newPage();
  dp.setDefaultTimeout(15_000);
  await dp.goto(url);
  await settle(dp);
  const snapD = (id, o) => shotOf(dp, S.rec.outDir, id, o);
  await snapD("158-passport-doctor-view", {});
  await snapD("159-passport-doctor-labs", {
    scrollTo: dp
      .getByText(/ผลตรวจเลือดล่าสุด|น้ำตาลในเลือดหลังอดอาหาร/)
      .first(),
  });
  await go(page, "/passport");
  await shot("160-passport-list", {
    scrollTo: page.getByRole("heading", { name: "ลิงก์ของคุณ" }),
    highlight: page
      .getByRole("link", { name: "ดูเนื้อหาที่แชร์" })
      .locator("xpath=ancestor::li[1]"),
  });
  await page.getByRole("link", { name: "ดูเนื้อหาที่แชร์" }).first().click();
  await page.waitForURL(/\/passport\/[0-9a-f-]{36}/, { waitUntil: "commit" });
  await settle(page);
  await shot("161-passport-preview", {
    highlight: page.getByRole("button", { name: /พิมพ์/ }),
  });
  await go(page, "/passport");
  await btn(page, "ยกเลิกลิงก์").first().click();
  await page.getByText("ยกเลิกแล้ว").first().waitFor();
  await settle(page);
  await shot("162-passport-revoked", {
    scrollTo: page.getByRole("heading", { name: "ลิงก์ของคุณ" }),
    highlight: page.getByText("ยกเลิกแล้ว").first(),
  });
  await dp.reload();
  await settle(dp);
  await snapD("163-passport-doctor-gone", {});
  await doctor.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. Wearables
// ═══════════════════════════════════════════════════════════════════════════════
register("wearables", async (S) => {
  const { page, shot } = S;
  await go(page, "/today");
  await page.getByRole("button", { name: "เพิ่มเติม", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "ข้อมูลสุขภาพจากอุปกรณ์" })
    .click();
  await page.waitForURL(/\/wearables/, { waitUntil: "commit" });
  await settle(page);
  await shot("170-wearables-open", {});
  const sources = page.getByRole("heading", {
    name: "แหล่งข้อมูลและความยินยอม",
  });
  await shot("171-wearables-sources", {
    scrollTo: sources,
    highlight: sources.locator(".."),
  });
  const csvItem = page
    .locator("li")
    .filter({ hasText: "ไฟล์ CSV" })
    .filter({
      has: page.getByRole("button", { name: "เปิดรับข้อมูลจากแหล่งนี้" }),
    });
  await csvItem.getByRole("checkbox").check();
  await shot("172-wearables-consent", {
    scrollTo: csvItem,
    highlight: csvItem,
  });
  await csvItem
    .getByRole("button", { name: "เปิดรับข้อมูลจากแหล่งนี้" })
    .click();
  await page
    .getByText(/เปิดรับแล้วตั้งแต่/)
    .first()
    .waitFor();
  await settle(page);
  await shot("173-wearables-enabled", {
    scrollTo: page.getByText(/เปิดรับแล้วตั้งแต่/).first(),
    highlight: page
      .getByText(/เปิดรับแล้วตั้งแต่/)
      .first()
      .locator(".."),
  });
  // a real CSV import (14 days of steps / resting heart rate / sleep)
  const lines = ["date,type,value"];
  for (let i = 1; i <= 14; i++) {
    lines.push(
      `${day(-i)},steps,${6000 + ((i * 937) % 4000)}`,
      `${day(-i)},resting_heart_rate,${60 + (i % 5)}`,
      `${day(-i)},sleep_minutes,${400 + ((i * 17) % 70)}`,
    );
  }
  const csvPath = join(S.rec.outDir, "_fx", "wearables.csv");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(csvPath, lines.join("\n") + "\n");
  const imp = page.getByRole("heading", { name: "นำเข้าไฟล์" });
  await shot("174-wearables-import", {
    scrollTo: imp,
    highlight: imp.locator(".."),
  });
  await page.locator("#wear-csv").setInputFiles(csvPath);
  await shot("175-wearables-csv-chosen", {
    scrollTo: page.locator("#wear-csv"),
    highlight: page.locator("#wear-csv"),
  });
  await page
    .locator("section", {
      has: page.getByRole("heading", { name: "นำเข้าไฟล์" }),
    })
    .getByRole("button", { name: "นำเข้า", exact: true })
    .last()
    .click();
  await page.getByText(/นำเข้าแล้ว \d+ รายการ/).waitFor();
  await settle(page);
  await shot("176-wearables-imported", {
    scrollTo: page.getByText(/นำเข้าแล้ว \d+ รายการ/),
    highlight: page.getByText(/นำเข้าแล้ว \d+ รายการ/),
  });
  await go(page, "/wearables");
  await shot("177-wearables-trends", {
    scrollTo: page.getByRole("heading", { name: /แนวโน้ม \d+ วันล่าสุด/ }),
    highlight: page
      .getByRole("heading", { name: /แนวโน้ม \d+ วันล่าสุด/ })
      .locator(".."),
  });
  // by hand
  await page.locator("#wm-type").selectOption("steps");
  await page.locator("#wm-value").fill("7500");
  await shot("178-wearables-manual", {
    scrollTo: page.locator("#wm-value"),
    highlight: section(page, "กรอกค่าเอง"),
  });
  await btn(page, "บันทึกค่า").click();
  await page.getByText("บันทึกแล้ว", { exact: true }).waitFor();
  await shot("179-wearables-manual-saved", {
    scrollTo: page.getByText("บันทึกแล้ว", { exact: true }),
    highlight: page.getByText("บันทึกแล้ว", { exact: true }),
  });
  // API token (shown once)
  await page.locator("#tok-label").fill("สคริปต์ของฉัน");
  await shot("180-wearables-token-form", {
    scrollTo: page.locator("#tok-label"),
    highlight: page.locator("#tok-label"),
  });
  await btn(page, "สร้างโทเค็น").click();
  await page.getByTestId("ingest-token").waitFor();
  await shot("181-wearables-token", {
    scrollTo: page.getByTestId("ingest-token"),
    highlight: page
      .getByText("โทเค็นของคุณ (แสดงครั้งเดียว คัดลอกไว้เดี๋ยวนี้)")
      .locator(".."),
  });
  await go(page, "/wearables");
  await shot("182-wearables-erase", {
    scrollTo: btn(page, "ลบข้อมูลจากอุปกรณ์ทั้งหมดของฉัน"),
    highlight: btn(page, "ลบข้อมูลจากอุปกรณ์ทั้งหมดของฉัน"),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// helpers for the account chapters
// ═══════════════════════════════════════════════════════════════════════════════
const getB = async (S) => (S.B ??= await newUser("คุณใจดี"));
const openMore = async (page) => {
  await page.getByRole("button", { name: "เพิ่มเติม", exact: true }).click();
  await page.getByRole("dialog").waitFor();
};
const fromMore = async (S, label, urlRe) => {
  const { page } = S;
  await go(page, "/today");
  await openMore(page);
  await page.getByRole("dialog").getByRole("link", { name: label }).click();
  await page.waitForURL(urlRe, { waitUntil: "commit" });
  await settle(page);
};
const setPaidPremium = async (S, userId) => {
  const r = await S.admin
    .from("profiles")
    .update({
      plan_tier: "premium",
      plan_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .eq("id", userId)
    .select("id");
  if (r.error || r.data.length !== 1)
    throw new Error("could not set the paid plan");
};
const endTrial = async (S, userId) => {
  const r = await S.admin
    .from("profiles")
    .update({
      trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    })
    .eq("id", userId)
    .select("id");
  if (r.error || r.data.length !== 1)
    throw new Error("could not end the trial");
};

// ═══════════════════════════════════════════════════════════════════════════════
// 17. Subscription (trial view, Free-lite view, PromptPay QR)
// ═══════════════════════════════════════════════════════════════════════════════
register("subscription", async (S) => {
  const { page, shot, admin } = S;
  await go(page, "/today");
  const trial = page
    .getByText(/กำลังทดลองใช้ Premium เหลืออีก/)
    .locator("xpath=ancestor::a[1]");
  await shot("190-today-trial-banner", { highlight: trial });
  await trial.click();
  await page.waitForURL(/\/subscription/, { waitUntil: "commit" });
  await settle(page);
  await shot("191-subscription-current", {
    highlight: page
      .getByRole("heading", { name: "แพ็กเกจปัจจุบัน" })
      .locator(".."),
  });
  await shot("192-subscription-usage", {
    scrollTo: page.getByRole("heading", { name: "การใช้ AI ของคุณ" }),
    highlight: page
      .getByRole("heading", { name: "การใช้ AI ของคุณ" })
      .locator(".."),
  });
  await shot("193-subscription-plans", {
    scrollTo: page.getByRole("heading", { name: "เปรียบเทียบแพ็กเกจ" }),
    highlight: page.getByRole("heading", { name: "เปรียบเทียบแพ็กเกจ" }),
  });
  const gold = page
    .locator("li.card")
    .filter({ has: page.getByRole("heading", { name: "Gold" }) });
  await shot("194-subscription-gold", { scrollTo: gold, highlight: gold });

  // someone whose trial has ended (Free-lite), who is about to pay by PromptPay
  S.F ??= await newUser("คุณทดลองครบ");
  await endTrial(S, S.F.id);
  const f = await session(S, S.F);
  await go(f.page, "/subscription");
  await f.snap("195-subscription-free", {
    highlight: f.page
      .getByRole("heading", { name: "แพ็กเกจปัจจุบัน" })
      .locator(".."),
  });
  const fgold = f.page
    .locator("li.card")
    .filter({ has: f.page.getByRole("heading", { name: "Gold" }) });
  const payBtn = fgold.getByRole("button", { name: /^รายเดือน/ });
  await f.snap("196-subscription-pay-buttons", {
    scrollTo: payBtn,
    highlight: payBtn,
  });
  await payBtn.click();
  await f.page.waitForURL(/\/subscription\/pay\//, { waitUntil: "commit" });
  await settle(f.page);
  await f.page.getByRole("img", { name: /QR PromptPay/ }).waitFor();
  await f.snap("197-pay-qr", {
    highlight: f.page.getByRole("img", { name: /QR PromptPay/ }),
  });
  await f.page.locator("#payerRef").fill("1234");
  await f.snap("198-pay-reference", {
    scrollTo: f.page.locator("#payerRef"),
    highlight: [
      f.page.locator("#payerRef"),
      f.page.getByRole("button", { name: "แจ้งโอนแล้ว" }),
    ],
  });
  // The transfer is not reported here (that would page the owner's admins). What the app shows afterwards is set directly.
  const payId = f.page.url().split("/").pop();
  const up = await admin
    .from("payments")
    .update({
      status: "review",
      payer_ref: "1234",
      reported_at: new Date().toISOString(),
    })
    .eq("id", payId)
    .select("id");
  if (up.error || up.data.length !== 1)
    throw new Error("could not mark the payment as reported");
  await f.page.reload();
  await settle(f.page);
  await f.snap("199-pay-review", {
    highlight: f.page.getByText("ได้รับแจ้งการโอนแล้ว").locator(".."),
  });
  await go(f.page, "/subscription");
  await f.snap("200-subscription-payments", {
    scrollTo: f.page.getByRole("heading", { name: "รายการชำระเงิน" }),
    highlight: f.page
      .getByRole("heading", { name: "รายการชำระเงิน" })
      .locator(".."),
  });
  await f.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 18. Family (Premium +1)
// ═══════════════════════════════════════════════════════════════════════════════
register("family", async (S) => {
  const { page, shot, admin, M } = S;
  const B = await getB(S);
  await setPaidPremium(S, M.id);
  await admin
    .from("daily_checkins")
    .upsert(
      [0, 1, 2].map((i) => ({
        user_id: B.id,
        checkin_date: day(-i),
        sleep_band: 3,
        activity_band: 3,
        energy: 4,
        mood: 4,
        nutrition: 4,
      })),
    );
  await fromMore(S, "ครอบครัว", /\/family/);
  await shot("210-family-open", {
    highlight: page.getByRole("heading", { name: "ชวนสมาชิก" }).locator(".."),
  });
  await btn(page, "สร้างรหัสเชิญ").click();
  await page.getByTestId("family-code").waitFor();
  await settle(page);
  await shot("211-family-code", {
    highlight: page
      .getByTestId("family-code")
      .locator("xpath=ancestor::div[1]"),
  });
  const code = (await page.getByTestId("family-code").innerText()).trim();
  const b = await session(S, B);
  await go(b.page, "/family");
  await b.page.locator("#fam-code").fill(code);
  await b.snap("212-family-join", {
    highlight: b.page
      .getByRole("heading", { name: "เข้าร่วมด้วยรหัสเชิญ" })
      .locator(".."),
  });
  await b.page.getByRole("button", { name: "เข้าร่วมครอบครัว" }).click();
  await b.page.getByText("เข้าร่วมครอบครัวแล้ว").waitFor();
  await b.snap("213-family-joined", {});
  // the member chooses what to share
  await b.page
    .getByRole("checkbox", { name: /การเช็กอิน: วันนี้เช็กอินแล้วหรือยัง/ })
    .check();
  await b.page
    .getByRole("checkbox", { name: /ฉันยินยอมให้อีกฝ่ายเห็น/ })
    .check();
  await b.snap("214-family-share", {
    scrollTo: b.page.getByRole("heading", {
      name: "สิ่งที่ฉันแชร์ให้อีกฝ่ายเห็น",
    }),
    highlight: b.page
      .getByRole("heading", { name: "สิ่งที่ฉันแชร์ให้อีกฝ่ายเห็น" })
      .locator(".."),
  });
  await b.page.getByRole("button", { name: "บันทึกการแชร์" }).click();
  await b.page.getByText("บันทึกการแชร์แล้ว").waitFor();
  await b.close();
  await go(page, "/family");
  await shot("215-family-owner", {
    highlight: page
      .getByRole("heading", { name: "สมาชิกครอบครัวของคุณ" })
      .locator(".."),
  });
  await shot("216-family-theirs", {
    scrollTo: page.getByRole("heading", { name: "สิ่งที่อีกฝ่ายแชร์ให้ฉัน" }),
    highlight: page
      .getByRole("heading", { name: "สิ่งที่อีกฝ่ายแชร์ให้ฉัน" })
      .locator(".."),
  });
  await shot("217-family-my-share", {
    scrollTo: page.getByRole("heading", {
      name: "สิ่งที่ฉันแชร์ให้อีกฝ่ายเห็น",
    }),
    highlight: page
      .getByRole("heading", { name: "สิ่งที่ฉันแชร์ให้อีกฝ่ายเห็น" })
      .locator(".."),
  });
  await shot("218-family-end", {
    scrollTo: btn(page, "นำสมาชิกออก"),
    highlight: btn(page, "นำสมาชิกออก"),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 19. Rewards credit + rewards page + creator
// ═══════════════════════════════════════════════════════════════════════════════
const ensureCredit = async (S) => {
  if (S.credit) return;
  S.credit = true;
  const r = await S.admin.from("reward_ledger").insert([
    {
      user_id: S.M.id,
      kind: "challenge_reward",
      amount_thb: 18,
      ref: "sample-challenge",
    },
    {
      user_id: S.M.id,
      kind: "referral_reward",
      amount_thb: 12,
      ref: "sample-referral",
    },
  ]);
  if (r.error) throw r.error;
};

register("rewards", async (S) => {
  const { page, shot, admin, M } = S;
  const B = await getB(S);
  await ensureCredit(S);
  await fromMore(S, "รางวัลของฉัน", /\/rewards/);
  await shot("220-rewards-open", {
    highlight: page.getByRole("heading", { name: "เครดิตสะสม" }).locator(".."),
  });
  await shot("221-rewards-invite", {
    scrollTo: page.getByRole("heading", { name: "ชวนเพื่อน" }),
    highlight: page.getByRole("heading", { name: "ชวนเพื่อน" }).locator(".."),
  });
  const myCode = (await page.locator("p.tracking-widest").first().innerText())
    .replace("รหัสของคุณ:", "")
    .trim();
  // the friend types the code
  const b = await session(S, B);
  await go(b.page, "/rewards");
  await b.page.locator("#ref-code").fill(myCode);
  await b.snap("222-rewards-friend-code", {
    scrollTo: b.page.locator("#ref-code"),
    highlight: b.page
      .getByRole("heading", { name: "มีรหัสจากเพื่อน?" })
      .locator(".."),
  });
  await b.page.getByRole("button", { name: "ใช้รหัส" }).click();
  await b.page.getByText(/ใช้รหัสแล้ว เพื่อนของคุณจะได้รางวัล/).waitFor();
  await b.snap("223-rewards-code-applied", {});
  await b.close();
  await go(page, "/rewards");
  await shot("224-rewards-stats", {
    scrollTo: page.getByText(/ชวนแล้ว \d+ คน/),
    highlight: page.getByText(/ชวนแล้ว \d+ คน/),
  });
  await shot("225-rewards-history", {
    scrollTo: page.getByRole("heading", { name: "ประวัติเครดิต" }),
    highlight: page
      .getByRole("heading", { name: "ประวัติเครดิต" })
      .locator(".."),
  });
  // a creator (named by an admin) also gets a toolkit
  const cr = await admin
    .from("creators")
    .insert({ user_id: M.id, display_name: "คุณสุขใจ" });
  if (cr.error) throw cr.error;
  cleanup.push(async () => admin.from("creators").delete().eq("user_id", M.id));
  await go(page, "/rewards");
  await shot("226-rewards-creator-link", {
    highlight: link(page, "Creator toolkit"),
  });
  await link(page, "Creator toolkit").click();
  await page.waitForURL(/\/creator/, { waitUntil: "commit" });
  await settle(page);
  await shot("227-creator-open", {});
  await shot("228-creator-numbers", {
    scrollTo: page.getByRole("heading", { name: "ตัวเลขของคุณ" }),
    highlight: page
      .getByRole("heading", { name: "ตัวเลขของคุณ" })
      .locator(".."),
  });
  await shot("229-creator-share", {
    scrollTo: page.getByRole("heading", { name: "ข้อความพร้อมส่ง" }),
    highlight: page
      .getByRole("heading", { name: "ข้อความพร้อมส่ง" })
      .locator(".."),
  });
  await admin.from("creators").delete().eq("user_id", M.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 20. Shop, cart, orders
// ═══════════════════════════════════════════════════════════════════════════════
register("shop", async (S) => {
  const { page, shot, admin, M } = S;
  await ensureCredit(S);
  const tag = `mu${Date.now().toString(36)}`;
  const partner = await admin
    .from("shop_partners")
    .insert({ name: `${tag} ร้านพาร์ตเนอร์ตัวอย่าง`, contact: "line:@sample" })
    .select("id");
  if (partner.error) throw partner.error;
  const pid = partner.data[0].id;
  const defs = [
    [
      "แมกนีเซียม 200 มก.",
      "magnesium",
      390,
      450,
      ["sleep", "stress"],
      "product-1.png",
      "เสริมแมกนีเซียมสำหรับผู้ที่ได้รับไม่พอจากอาหาร",
    ],
    [
      "วิตามินดี 3",
      "vitamin-d",
      290,
      null,
      ["general", "energy"],
      "product-2.png",
      "เสริมวิตามินดีสำหรับผู้ที่ได้รับแสงแดดน้อย",
    ],
    [
      "โอเมก้า 3 น้ำมันปลา",
      "omega3",
      590,
      null,
      ["nutrition", "general"],
      "product-3.png",
      "เสริมกรดไขมันโอเมก้า 3 สำหรับผู้ที่กินปลาน้อย",
    ],
  ];
  const { readFileSync: rf } = await import("node:fs");
  const productIds = [];
  for (const [name, sku, price, compare, tags, img, summary] of defs) {
    const pr = await admin
      .from("shop_products")
      .insert({
        sku: `${tag}-${sku}`,
        partner_id: pid,
        name_th: name,
        brand: "ตัวอย่าง",
        summary_th: summary,
        description_th: `${summary} (สินค้าตัวอย่างสำหรับคู่มือ)`,
        ingredients: "สารสำคัญตามที่ระบุบนฉลาก",
        usage_note: "รับประทานวันละ 1 เม็ด หลังอาหาร",
        caution:
          "ผู้ตั้งครรภ์ ให้นมบุตร หรือมีโรคประจำตัว ควรปรึกษาแพทย์หรือเภสัชกรก่อนใช้",
        fda_no: "00-0-00000-0-0000",
        serving: "60 เม็ด",
        price_thb: price,
        compare_at_thb: compare,
        stock: 50,
        focus_tags: tags,
        active: true,
      })
      .select("id");
    if (pr.error) throw pr.error;
    const id = pr.data[0].id;
    productIds.push(id);
    const bytes = rf(S.fx[img]);
    const path = `${id}/1.png`;
    const up = await admin.storage
      .from("shop-images")
      .upload(path, bytes, { contentType: "image/png" });
    if (up.error) throw up.error;
    const row = await admin
      .from("shop_product_images")
      .insert({
        product_id: id,
        path,
        mime: "image/png",
        bytes: bytes.length,
        position: 0,
      });
    if (row.error) throw row.error;
  }
  cleanup.push(async () => {
    for (const id of productIds) {
      const objs =
        (await admin.storage.from("shop-images").list(id)).data ?? [];
      if (objs.length)
        await admin.storage
          .from("shop-images")
          .remove(objs.map((o) => `${id}/${o.name}`));
    }
    await admin.from("shop_orders").delete().eq("user_id", M.id);
    await admin.from("shop_products").delete().like("sku", `${tag}%`);
    await admin.from("shop_partners").delete().like("name", `${tag}%`);
  });

  await fromMore(S, "ร้านค้าอาหารเสริม", /\/shop/);
  await shot("230-shop-open", { highlight: page.getByText(/เครดิตของคุณ ฿/) });
  await shot("231-shop-picks", {
    scrollTo: page.getByRole("heading", { name: "เลือกให้คุณ" }),
    highlight: page.getByRole("heading", { name: "เลือกให้คุณ" }).locator(".."),
  });
  const filter = page.getByRole("navigation", { name: "กรองตามเรื่องที่สนใจ" });
  await shot("232-shop-filter", { scrollTo: filter, highlight: filter });
  await filter.getByRole("link", { name: "การนอน" }).click();
  await page.waitForURL(/tag=sleep/, { waitUntil: "commit" });
  await settle(page);
  await shot("233-shop-filtered", {
    scrollTo: page.getByRole("navigation", { name: "กรองตามเรื่องที่สนใจ" }),
    highlight: page.getByRole("navigation", { name: "กรองตามเรื่องที่สนใจ" }),
  });
  await page
    .getByRole("list", { name: "ร้านค้าอาหารเสริม" })
    .getByRole("link", { name: /แมกนีเซียม/ })
    .click();
  await page.waitForURL(/\/shop\/[0-9a-f-]{36}/, { waitUntil: "commit" });
  await settle(page);
  await shot("234-shop-product", {});
  await shot("235-shop-product-details", {
    scrollTo: page.getByText("วิธีรับประทาน"),
    highlight: page.getByText("คำเตือน").locator(".."),
  });
  await page.locator("#qty").fill("2");
  await shot("236-shop-add", {
    scrollTo: btn(page, "ใส่ตะกร้า"),
    highlight: [page.locator("#qty"), btn(page, "ใส่ตะกร้า")],
  });
  await btn(page, "ใส่ตะกร้า").click();
  await page.waitForURL(/\/shop\/cart/, { waitUntil: "commit" });
  await settle(page);
  await shot("237-cart", { highlight: page.getByText("ใส่ตะกร้าแล้ว") });
  await page.locator(".card input[type=number]").first().fill("1");
  await page.getByRole("button", { name: "อัปเดตจำนวน" }).first().click();
  await settle(page);
  await shot("238-cart-updated", {
    scrollTo: page.getByRole("region", { name: "ยอดที่ต้องชำระ" }),
    highlight: page.getByRole("region", { name: "ยอดที่ต้องชำระ" }),
  });
  await page.getByRole("checkbox", { name: /ใช้เครดิตเป็นส่วนลด/ }).check();
  await shot("239-cart-credit", {
    scrollTo: page.getByRole("checkbox", { name: /ใช้เครดิตเป็นส่วนลด/ }),
    highlight: page
      .getByRole("checkbox", { name: /ใช้เครดิตเป็นส่วนลด/ })
      .locator("xpath=ancestor::label[1]"),
  });
  await page.locator("#co-name").fill("คุณสุขใจ ตัวอย่าง");
  await page.locator("#co-phone").fill("0800000000");
  await page
    .locator("#co-address")
    .fill("99/9 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง");
  await page.locator("#co-province").fill("กรุงเทพมหานคร");
  await page.locator("#co-postal").fill("10110");
  await shot("240-cart-address", {
    scrollTo: page.locator("#co-name"),
    highlight: page
      .getByRole("heading", { name: "ที่อยู่จัดส่ง" })
      .locator(".."),
  });
  await shot("241-cart-checkout", {
    scrollTo: btn(page, "สั่งซื้อและไปชำระเงิน"),
    highlight: btn(page, "สั่งซื้อและไปชำระเงิน"),
  });
  await btn(page, "สั่งซื้อและไปชำระเงิน").click();
  await page.waitForURL(/\/shop\/orders\/[0-9a-f-]{36}/, {
    waitUntil: "commit",
  });
  await settle(page);
  await page.getByRole("img", { name: /QR PromptPay/ }).waitFor();
  await shot("242-order-qr", {
    highlight: page.getByRole("img", { name: /QR PromptPay/ }),
  });
  await page.locator("#payer-ref").fill("1234");
  await shot("243-order-reference", {
    scrollTo: page.locator("#payer-ref"),
    highlight: [page.locator("#payer-ref"), btn(page, "ฉันโอนแล้ว")],
  });
  const orderId = page.url().split("/").pop();
  // (not reported for real: that would page the admins; what the app shows next is set directly)
  let up = await admin
    .from("shop_orders")
    .update({
      status: "payment_reported",
      payer_ref: "1234",
      reported_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("id");
  if (up.error || up.data.length !== 1) throw new Error("order update failed");
  await page.reload();
  await settle(page);
  await shot("244-order-reported", {
    highlight: page.getByText(/แจ้งโอนแล้ว ร้านจะตรวจ/),
  });
  up = await admin
    .from("shop_orders")
    .update({
      status: "shipped",
      carrier: "Kerry Express",
      tracking_no: "KEX0000000001",
      shipped_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("id");
  if (up.error || up.data.length !== 1) throw new Error("order update failed");
  await page.reload();
  await settle(page);
  await shot("245-order-shipped", {
    highlight: page.getByRole("heading", { name: "การจัดส่ง" }).locator(".."),
  });
  await link(page, "ออเดอร์ของฉัน").first().click();
  await page.waitForURL(/\/shop\/orders$/, { waitUntil: "commit" });
  await settle(page);
  await shot("246-orders-list", {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 21. Company plan
// ═══════════════════════════════════════════════════════════════════════════════
register("company", async (S) => {
  const { page, shot, admin, M } = S;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(
    { length: 8 },
    () => letters[Math.floor(Math.random() * letters.length)],
  ).join("");
  const co = await admin
    .from("companies")
    .insert({
      name: "บริษัท ตัวอย่าง จำกัด",
      code,
      seats: 10,
      tier: "premium",
      valid_until: day(90),
      active: true,
      note: "sample for the user manual",
    })
    .select("id");
  if (co.error) throw co.error;
  cleanup.push(async () =>
    admin.from("companies").delete().eq("id", co.data[0].id),
  );
  await fromMore(S, "แพ็กเกจองค์กร", /\/company/);
  await shot("250-company-open", {});
  await page.locator("#co-code").fill(code);
  await shot("251-company-code", { highlight: page.locator("#co-code") });
  await btn(page, "เข้าร่วมองค์กร").click();
  await page.getByText("เข้าร่วมองค์กรแล้ว").waitFor();
  await settle(page);
  await shot("252-company-joined", {
    highlight: page
      .getByRole("heading", { name: "องค์กรของคุณ" })
      .locator(".."),
  });
  await shot("253-company-stats", {
    scrollTo: page.getByRole("heading", { name: "สถิติรวมแบบไม่ระบุตัวตน" }),
    highlight: page
      .getByRole("heading", { name: "สถิติรวมแบบไม่ระบุตัวตน" })
      .locator(".."),
  });
  await page
    .getByRole("checkbox", { name: /ฉันยินยอมให้นับข้อมูลของฉัน/ })
    .check();
  await btn(page, "บันทึก").click();
  await page.getByText("ตอนนี้: นับรวมอยู่").waitFor();
  await settle(page);
  await shot("254-company-stats-on", {
    scrollTo: page.getByText("ตอนนี้: นับรวมอยู่"),
    highlight: page.getByText("ตอนนี้: นับรวมอยู่"),
  });
  await shot("255-company-leave", {
    scrollTo: btn(page, "ออกจากองค์กร"),
    highlight: btn(page, "ออกจากองค์กร"),
  });
  await btn(page, "ออกจากองค์กร").click();
  await page.getByText("ออกจากองค์กรแล้ว").waitFor();
  void M;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 22. Achievements
// ═══════════════════════════════════════════════════════════════════════════════
register("achievements", async (S) => {
  const { page, shot } = S;
  await go(page, "/today");
  const card = link(page, /ดูความสำเร็จ/, false);
  await shot("260-today-achievements-card", {
    scrollTo: card,
    highlight: card,
  });
  await card.click();
  await page.waitForURL(/\/achievements/, { waitUntil: "commit" });
  await settle(page);
  await shot("261-achievements-open", {});
  await shot("262-achievements-earned", {
    scrollTo: page.getByText(/ได้เมื่อ/).first(),
    highlight: page
      .getByText(/ได้เมื่อ/)
      .first()
      .locator("xpath=ancestor::li[1]"),
  });
  await shot("263-achievements-locked", {
    scrollTo: page.locator("progress").first(),
    highlight: page
      .locator("progress")
      .first()
      .locator("xpath=ancestor::li[1]"),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 23. Notifications
// ═══════════════════════════════════════════════════════════════════════════════
register("notifications", async (S) => {
  const { page, shot, admin, M } = S;
  const rows = [
    {
      kind: "trial_ending",
      title: "ทดลองใช้ Premium เหลืออีก 3 วัน",
      body: "เลือกแพ็กเกจเพื่อใช้ต่อได้ไม่สะดุด หรือใช้ Free-lite ต่อก็ได้\nสิ้นสุด: 7 ต.ค. 2569",
      href: "/subscription",
    },
    {
      kind: "payment_paid",
      title: "ชำระเงินเรียบร้อย",
      body: "เปิดสิทธิ์แพ็กเกจ Gold ให้แล้ว\nใช้ได้ถึง: 3 พ.ย. 2569",
      href: "/subscription",
    },
  ].map((r, i) => ({
    ...r,
    user_id: M.id,
    created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
  }));
  const r = await admin.from("app_notifications").insert(rows);
  if (r.error) throw r.error;
  await go(page, "/today");
  const bell = page.getByRole("link", { name: /^แจ้งเตือน/ }).first();
  await shot("270-notifications-bell", { highlight: bell });
  await bell.click();
  await page.waitForURL(/\/notifications/, { waitUntil: "commit" });
  await settle(page);
  await shot("271-notifications-list", {});
  await shot("272-notifications-mark-all", {
    highlight: btn(page, "ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว"),
  });
  await page.getByRole("link", { name: /ชำระเงินเรียบร้อย/ }).click();
  await page.waitForURL(/\/subscription/, { waitUntil: "commit" });
  await settle(page);
  await shot("273-notifications-opened", {});
  await go(page, "/notifications");
  await btn(page, "ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว").click();
  await settle(page);
  await shot("274-notifications-read", {});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 24. Install as an app
// ═══════════════════════════════════════════════════════════════════════════════
register("install", async (S) => {
  const { page, shot } = S;
  await fromMore(S, "ติดตั้งเป็นแอปบนเครื่อง", /\/install/);
  await shot("280-install-open", {});
  await shot("281-install-steps", {
    scrollTo: page.getByRole("heading", { name: "วิธีติดตั้งบนอุปกรณ์อื่น" }),
    highlight: page
      .getByRole("heading", { name: "วิธีติดตั้งบนอุปกรณ์อื่น" })
      .locator(".."),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 25. Settings (account, language, theme, notifications, consent, data rights) + sign-out / sign-in
// ═══════════════════════════════════════════════════════════════════════════════
register("settings", async (S) => {
  const { page, shot, admin, M } = S;
  await fromMore(S, "ตั้งค่า", /\/settings/);
  await shot("290-settings-open", {
    highlight: page.getByRole("heading", { name: "บัญชี" }).locator(".."),
  });
  await page
    .getByRole("group", { name: "ธีมสี" })
    .getByRole("button", { name: "มืด" })
    .click();
  await settle(page);
  await page.waitForTimeout(500);
  await shot("291-settings-dark", {
    highlight: page.getByRole("group", { name: "ธีมสี" }),
  });
  await page
    .getByRole("group", { name: "ธีมสี" })
    .getByRole("button", { name: "ตามอุปกรณ์" })
    .click();
  await settle(page);
  await page.waitForTimeout(500);
  const line = page.getByRole("heading", { name: "การเข้าสู่ระบบด้วย LINE" });
  if (await line.count())
    await shot("292-settings-line", {
      scrollTo: line,
      highlight: line.locator(".."),
    });
  else
    await shot("292-settings-line", {
      scrollTo: page.getByRole("heading", { name: "การแจ้งเตือนทาง LINE" }),
      highlight: page
        .getByRole("heading", { name: "การแจ้งเตือนทาง LINE" })
        .locator(".."),
    });
  const notif = page.getByRole("heading", { name: "การแจ้งเตือนทาง LINE" });
  await shot("293-settings-notif-unlinked", {
    scrollTo: notif,
    highlight: notif.locator(".."),
  });
  // once a LINE account is linked, the two switches appear (the link itself needs the real LINE app: a sample link is stored)
  const ll = await admin
    .from("line_links")
    .insert({
      user_id: M.id,
      line_sub: `Usample${randomBytes(8).toString("hex")}`,
      display_name: "คุณสุขใจ",
    });
  if (ll.error) throw ll.error;
  await go(page, "/settings");
  await page.getByRole("checkbox", { name: /เตือนเช็กอินรายวัน/ }).check();
  await shot("294-settings-notif-linked", {
    scrollTo: page.getByRole("heading", { name: "การแจ้งเตือนทาง LINE" }),
    highlight: page
      .getByRole("heading", { name: "การแจ้งเตือนทาง LINE" })
      .locator(".."),
  });
  await page
    .locator("section", {
      has: page.getByRole("heading", { name: "การแจ้งเตือนทาง LINE" }),
    })
    .getByRole("button", { name: "บันทึก" })
    .click();
  await page.getByText("บันทึกการตั้งค่าแล้ว").waitFor();
  await settle(page);
  await shot("295-settings-notif-saved", {
    scrollTo: page.getByText("บันทึกการตั้งค่าแล้ว"),
    highlight: page.getByText("บันทึกการตั้งค่าแล้ว"),
  });
  const consent = page.getByRole("heading", { name: "ความยินยอมที่ให้ไว้" });
  await shot("296-settings-consent", {
    scrollTo: consent,
    highlight: consent.locator(".."),
  });
  const optional = page.getByRole("heading", {
    name: "เปลี่ยนความยินยอมที่ไม่บังคับ",
  });
  await page
    .getByRole("checkbox", { name: /ฉันต้องการรับข่าวสารและโปรโมชัน/ })
    .check();
  await shot("297-settings-optional", {
    scrollTo: optional,
    highlight: optional.locator(".."),
  });
  await btn(page, "บันทึกการเปลี่ยนแปลง").click();
  await page.getByText(/บันทึกความยินยอมแล้ว/).waitFor();
  await settle(page);
  await shot("298-settings-optional-saved", {
    scrollTo: page.getByText(/บันทึกความยินยอมแล้ว/),
    highlight: page.getByText(/บันทึกความยินยอมแล้ว/),
  });
  const rights = page.getByRole("heading", { name: "สิทธิของคุณตามกฎหมาย" });
  await shot("299-settings-rights", {
    scrollTo: rights,
    highlight: rights.locator(".."),
  });
  const exp = page.getByRole("button", { name: /ดาวน์โหลดข้อมูลของฉัน/ });
  const dl = page
    .waitForEvent("download", { timeout: 30_000 })
    .catch(() => null);
  await exp.click();
  await page.getByText(/ดาวน์โหลดแล้ว \(/).waitFor({ timeout: 30_000 });
  await dl;
  await shot("300-settings-exported", {
    scrollTo: page.getByText(/ดาวน์โหลดแล้ว \(/),
    highlight: page.getByText(/ดาวน์โหลดแล้ว \(/),
  });
  const store = page.getByRole("heading", { name: "ที่เก็บข้อมูลของคุณ" });
  await shot("301-settings-datastore", {
    scrollTo: store,
    highlight: store.locator(".."),
  });
  await page.getByRole("button", { name: "ลบบัญชีและข้อมูลทั้งหมด" }).click();
  await page.locator("#phrase").waitFor();
  await shot("302-settings-delete-preview", {
    scrollTo: page.getByRole("heading", {
      name: "สิ่งที่จะเกิดขึ้นเมื่อลบบัญชี",
    }),
    highlight: page
      .getByRole("heading", { name: "สิ่งที่จะเกิดขึ้นเมื่อลบบัญชี" })
      .locator(".."),
  });
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  const out = btn(page, "ออกจากระบบ");
  await shot("303-settings-signout", { scrollTo: out, highlight: out });
  await out.click();
  await page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit", timeout: 60_000 });
  await settle(page);
  await shot("304-signed-out-landing", {
    highlight: link(page, "เข้าสู่ระบบ"),
  });
  await link(page, "เข้าสู่ระบบ").click();
  await page.waitForURL(/\/auth/, { waitUntil: "commit" });
  await settle(page);
  await page.getByLabel("อีเมล").fill(M.email);
  await page.getByLabel("รหัสผ่าน").fill(M.password);
  await shot("305-signin-form", {
    highlight: [page.getByLabel("อีเมล"), page.getByLabel("รหัสผ่าน")],
  });
  // the screenshot masked the e-mail in the field: type the real one again
  await page.getByLabel("อีเมล").fill(M.email);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL(/\/today/, { waitUntil: "commit", timeout: 60_000 });
  await settle(page);
  await shot("306-signin-today", {});
});

register("delete-account", async (S) => {
  const D = await newUser("คุณลบบัญชี");
  const d = await session(S, D);
  await go(d.page, "/settings");
  await d.page.getByRole("button", { name: "ลบบัญชีและข้อมูลทั้งหมด" }).click();
  await d.page.locator("#phrase").waitFor();
  await d.snap("307-delete-open", {
    scrollTo: d.page.locator("#phrase"),
    highlight: d.page.locator("#phrase").locator(".."),
  });
  await d.page.locator("#phrase").fill("ลบบัญชี");
  await d.snap("308-delete-typed", {
    scrollTo: d.page.getByRole("button", { name: "ลบบัญชีถาวร" }),
    highlight: d.page.getByRole("button", { name: "ลบบัญชีถาวร" }),
  });
  await d.page.getByRole("button", { name: "ลบบัญชีถาวร" }).click();
  await d.page.waitForURL((u) => u.pathname === "/", { waitUntil: "commit", timeout: 60_000 });
  await settle(d.page);
  await d.snap("309-delete-done", {
    highlight: d.page.getByRole("status").first(),
  });
  await d.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 26. The bottom bar, the More sheet and the language switch
// ═══════════════════════════════════════════════════════════════════════════════
register("more", async (S) => {
  const { page, shot } = S;
  await go(page, "/today");
  const bar = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
  await shot("310-bottom-bar", { highlight: bar });
  await shot("311-header-lang", {
    highlight: page.getByRole("group", { name: "ภาษา" }),
  });
  await openMore(page);
  await shot("312-more-open", {});
  const list = page.getByRole("dialog").locator("div.overflow-y-auto");
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(300);
  await shot("313-more-bottom", {
    highlight: [
      page.getByRole("dialog").getByText("คู่มือการใช้งาน"),
      page.getByRole("dialog").getByRole("button", { name: "ออกจากระบบ" }),
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 27. What a Free-lite person sees (paid features show their plan)
// ═══════════════════════════════════════════════════════════════════════════════
register("freelite", async (S) => {
  S.F ??= await newUser("คุณทดลองครบ");
  await endTrial(S, S.F.id);
  const f = await session(S, S.F);
  for (const [id, path, name] of [
    ["320-free-passport", "/passport", "สำหรับแพ็กเกจ Premium"],
    ["321-free-agent", "/agent", "สำหรับแพ็กเกจ Premium"],
    ["322-free-wearables", "/wearables", "สำหรับแพ็กเกจ Gold ขึ้นไป"],
    ["323-free-family", "/family", "การชวนสมาชิกสำหรับ Premium"],
  ]) {
    await go(f.page, path);
    await f.snap(id, {
      highlight: f.page.getByRole("heading", { name }).locator(".."),
    });
  }
  await go(f.page, "/timeline");
  await f.snap("324-free-timeline", {
    scrollTo: f.page.getByText(/แพ็กเกจของคุณดูย้อนหลังได้/).first(),
    highlight: f.page.getByText(/แพ็กเกจของคุณดูย้อนหลังได้/).first(),
  });
  await go(f.page, "/vault");
  await f.snap("325-free-vault", {
    highlight: f.page.getByText(/ใช้ไป \d+ จาก/),
  });
  await f.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 28. Insight card on Today + legal pages
// ═══════════════════════════════════════════════════════════════════════════════
register("insight", async (S) => {
  const { page, shot } = S;
  await ensureHistory(S);
  await go(page, "/today");
  const card = page.locator("#insight");
  if (await card.count()) {
    await shot("330-today-insight", { highlight: card });
    await shot("331-today-insight-ai", {
      scrollTo: btn(page, "ให้ AI อธิบายเพิ่ม"),
      highlight: btn(page, "ให้ AI อธิบายเพิ่ม"),
    });
  } else console.warn("no insight card today (data does not trigger one)");
  await go(page, "/privacy");
  await shot("332-privacy", {});
  await go(page, "/terms");
  await shot("333-terms", {});
});

// PART2 (more chapters are added below)

const exitCode = await (async () => {
  try {
    await main();
    return failures.length ? 1 : 0;
  } catch (err) {
    console.error("recorder crashed:", err);
    return 2;
  } finally {
    for (const fn of cleanup.reverse())
      await fn().catch((e) => console.error("cleanup:", e?.message ?? e));
    // also any leftover of an interrupted earlier run of THIS recorder (its own e-mail prefix only)
    const left = await db()
      .auth.admin.listUsers({ page: 1, perPage: 200 })
      .then((r) => r.data?.users ?? [])
      .catch(() => []);
    for (const u of left)
      if (u.email?.startsWith("usrman") && !created.includes(u.id))
        created.push(u.id);
    for (const id of created) {
      await db()
        .from("shop_orders")
        .delete()
        .eq("user_id", id)
        .then(
          () => {},
          () => {},
        );
      await db()
        .from("payments")
        .delete()
        .eq("user_id", id)
        .then(
          () => {},
          () => {},
        );
    }
    await removeUsers(created).catch((e) =>
      console.error("removeUsers:", e?.message ?? e),
    );
    console.log(`removed ${created.length} test users`);
  }
})();
if (failures.length) console.error("failed chapters:", failures.join(", "));
process.exit(exitCode);
