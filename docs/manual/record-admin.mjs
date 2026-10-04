// Records the ADMIN manual: really operates the app at 390×844 against a local server (default
// http://localhost:3102) and writes docs/manual/shots/admin/*.png (one screenshot per step).
//
//   NODE_USE_ENV_PROXY=1 node docs/manual/record-admin.mjs            # every section
//   NODE_USE_ENV_PROXY=1 node docs/manual/record-admin.mjs payments leads   # only these
//
// The Supabase project is SHARED (owner's data + platform settings). Everything this script changes in
// shared settings is snapshotted first (state file) and restored in `finally`; every row, file and user it
// creates is removed again. Sections: access home payments leads biomarkers rewards paywall analytics
// ai prompts manual rules flags shop corporate creators admins
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  db,
  makeUser,
  signInAndConsent,
  startRecorder,
} from "./lib/recorder.mjs";

const BASE = process.env.MANUAL_BASE ?? "http://localhost:3102";
const STATE_FILE =
  process.env.MANUAL_STATE ?? "/tmp/claude-0/work/admin-state.json";
const ONLY = process.argv.slice(2);
const wants = (name) => ONLY.length === 0 || ONLY.includes(name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SETTING_COLS = [
  "feature_flags",
  "manual_url",
  "promptpay_id",
  "reward_referral_thb",
  "reward_referee_thb",
  "reward_challenge_thb",
  "redeem_max_subscription_thb",
  "redeem_max_other_thb",
  "referral_min_checkin_days",
  "referral_max_rewards",
  "challenge_max_rewards_per_month",
  "paywall_ab",
  "shop_shipping_thb",
  "shop_free_shipping_from_thb",
  "updated_by",
  "updated_at",
];

const d = db();
/** Everything created so far, persisted so a crash can still be cleaned (see cleanup()). */
const made = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
  : {
      startedAt: new Date(Date.now() - 5000).toISOString(),
      baseline: null,
      users: [],
      partners: [],
      skus: [],
      orders: [],
      companies: [],
      keys: [],
      unknown: [],
      leadsUsers: [],
    };
const TAG = (made.tag ??= `MAN${Date.now().toString(36).toUpperCase()}`);
const save = () => {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(made));
};

// ── baseline of everything a section may touch ─────────────────────────────────────────────
async function snapshot() {
  if (made.baseline) return;
  const one = async (t) => (await d.from(t).select("*")).data;
  made.baseline = {
    platform: (
      await d
        .from("platform_settings")
        .select(SETTING_COLS.join(","))
        .eq("id", true)
        .single()
    ).data,
    ai_settings: await one("ai_settings"),
    notification_settings: await one("notification_settings"),
    automation_rules: await one("automation_rules"),
    promptMax:
      (
        await d
          .from("ai_prompt_versions")
          .select("id")
          .order("id", { ascending: false })
          .limit(1)
      ).data?.[0]?.id ?? 0,
    aiEventMax:
      (
        await d
          .from("ai_events")
          .select("id")
          .order("id", { ascending: false })
          .limit(1)
      ).data?.[0]?.id ?? 0,
    counts: await counts(),
  };
  save();
}
const WATCH = [
  "payments",
  "user_subscriptions",
  "checkup_leads",
  "lab_unknown_markers",
  "biomarker_extras",
  "shop_partners",
  "shop_products",
  "shop_product_images",
  "shop_orders",
  "companies",
  "creators",
  "ai_prompt_versions",
  "product_events",
  "reward_ledger",
  "referrals",
  "admins",
  "app_notifications",
  "notification_queue",
  "privacy_audit_log",
];
async function counts() {
  const out = {};
  for (const t of WATCH)
    out[t] = (
      await d.from(t).select("*", { count: "exact", head: true })
    ).count;
  return out;
}

async function restore() {
  const b = made.baseline;
  if (!b) return;
  const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, row[c]]));
  const cur = (
    await d
      .from("platform_settings")
      .select(SETTING_COLS.join(","))
      .eq("id", true)
      .single()
  ).data;
  const patch = pick(
    b.platform,
    SETTING_COLS.filter((c) => !["updated_by", "updated_at"].includes(c)),
  );
  // put the "last edited by/at" back only if the last editor was one of our own test users
  if (made.users.includes(cur?.updated_by))
    Object.assign(patch, pick(b.platform, ["updated_by", "updated_at"]));
  await d.from("platform_settings").update(patch).eq("id", true);
  for (const row of b.ai_settings ?? []) {
    const { id, ...rest } = row;
    await d.from("ai_settings").update(rest).eq("id", id);
  }
  for (const row of b.notification_settings ?? []) {
    const { id, ...rest } = row;
    await d.from("notification_settings").update(rest).eq("id", id);
  }
  for (const row of b.automation_rules ?? []) {
    const { key, ...rest } = row;
    await d.from("automation_rules").update(rest).eq("key", key);
  }
}

async function cleanup() {
  const ids = made.users;
  // shop: orders → products (photos too) → partners
  const buyerOrders = ids.length
    ? ((await d.from("shop_orders").select("id").in("user_id", ids)).data ?? [])
    : [];
  const orderIds = [
    ...new Set([...made.orders, ...buyerOrders.map((o) => o.id)]),
  ];
  if (orderIds.length) await d.from("shop_orders").delete().in("id", orderIds);
  const prods =
    (
      await d
        .from("shop_products")
        .select("id")
        .like("sku", `${made.tag ?? "MAN"}%`)
    ).data ?? [];
  const prodBySku = made.skus.length
    ? ((await d.from("shop_products").select("id").in("sku", made.skus)).data ??
      [])
    : [];
  for (const p of [...prods, ...prodBySku]) {
    const objs = (await d.storage.from("shop-images").list(p.id)).data ?? [];
    if (objs.length)
      await d.storage
        .from("shop-images")
        .remove(objs.map((o) => `${p.id}/${o.name}`));
    await d.from("shop_products").delete().eq("id", p.id);
  }
  for (const n of made.partners)
    await d.from("shop_partners").delete().eq("name", n);
  // money + people
  if (ids.length) {
    await d.from("user_subscriptions").delete().in("user_id", ids);
    await d.from("payments").delete().in("user_id", ids);
    await d.from("checkup_leads").delete().in("user_id", ids);
    await d.from("product_events").delete().in("user_id", ids);
    await d.from("privacy_audit_log").delete().in("user_id", ids);
    await d.from("creators").delete().in("user_id", ids);
  }
  for (const c of made.companies)
    await d.from("companies").delete().eq("name", c);
  for (const k of made.keys)
    await d.from("biomarker_extras").delete().eq("key", k);
  for (const n of made.unknown)
    await d.from("lab_unknown_markers").delete().eq("normalized_name", n);
  // admin prompt additions / AI events this run caused
  if (made.baseline) {
    await d
      .from("ai_prompt_versions")
      .delete()
      .gt("id", made.baseline.promptMax);
    await d
      .from("ai_events")
      .delete()
      .gt("id", made.baseline.aiEventMax)
      .in("task", ["prompt_review", "config"]);
  }
  // notices our test users caused for the REAL admins, and LINE messages still waiting for them
  await d
    .from("app_notifications")
    .delete()
    .in("kind", ["payment_review", "lead_new"])
    .gte("created_at", made.startedAt);
  const admins = (await d.from("admins").select("user_id")).data ?? [];
  if (admins.length)
    await d
      .from("notification_queue")
      .delete()
      .in(
        "user_id",
        admins.map((a) => a.user_id),
      )
      .eq("status", "queued")
      .gte("created_at", made.startedAt);
  for (const id of ids) await d.auth.admin.deleteUser(id);
  made.users = [];
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────
const users = {};
async function person(role, name) {
  if (users[role]) return users[role];
  const u = await makeUser(made.users, {
    email: `${TAG.toLowerCase()}-${role}@roosuk-manual.test`,
    name,
  });
  save();
  users[role] = u;
  return u;
}
const asAdmin = async () => {
  const u = await person("admin", "ผู้ดูแล ตัวอย่าง");
  await d.from("admins").upsert({ user_id: u.id });
  return u;
};

/** A second phone browser signed in as `user` (for "what the person sees" shots). */
async function as(user, fn, opts) {
  const r = await startRecorder({ manual: "admin", base: BASE });
  const raw = r.shot;
  r.shot = async (id, o) => {
    await idle(r.page);
    shots.push(`admin/${id}.png`);
    console.log("  shot", id, "(as user)");
    return raw(id, o);
  };
  try {
    await signInAndConsent(r.page, user, opts);
    return await fn(r);
  } finally {
    await r.close();
  }
}

/** A real payer: Gold monthly → pay page → "I have transferred" with a reference. */
async function payerReports(user, ref) {
  await as(user, async ({ page }) => {
    await page.goto("/subscription");
    await page.waitForLoadState("networkidle");
    const gold = page
      .locator("li")
      .filter({ has: page.getByRole("heading", { name: "Gold" }) })
      .last();
    await gold.getByRole("button", { name: /รายเดือน/ }).click();
    await page.waitForURL(/\/subscription\/pay\//);
    await page.getByLabel(/เลขอ้างอิงบนสลิป/).fill(ref);
    await page.getByRole("button", { name: "แจ้งโอนแล้ว" }).click();
    await page.getByText("ได้รับแจ้งการโอนแล้ว").first().waitFor();
  });
  // the report notified every admin (the owner's accounts too): remove those test notices right away
  await d
    .from("app_notifications")
    .delete()
    .in("kind", ["payment_review", "lead_new"])
    .gte("created_at", made.startedAt);
  const admins = (await d.from("admins").select("user_id")).data ?? [];
  if (admins.length)
    await d
      .from("notification_queue")
      .delete()
      .in(
        "user_id",
        admins.map((a) => a.user_id),
      )
      .eq("status", "queued")
      .gte("created_at", made.startedAt);
}

const shots = [];
/** (Re)sign the admin's own browser in as `u`, only when it is not already. */
async function signInAgain(u) {
  await page.goto("/today");
  if (/\/auth/.test(page.url())) await signInAndConsent(page, u);
}
let R; // the admin's recorder
const idle = (pg) =>
  pg
    .waitForFunction(() => !document.querySelector(".animate-spin"), null, {
      timeout: 15000,
    })
    .catch(() => {});
const shot = async (id, opts) => {
  await idle(R.page);
  await maskExtras(R.page);
  shots.push(await R.shot(id, opts));
  console.log("  shot", id);
};
const go = async (path) => {
  await R.page.goto(path);
  await R.page.waitForLoadState("networkidle");
};
/** Hides the real admins' display names (the owner's accounts live in the shared project). */
async function maskExtras(page) {
  await page.evaluate(() => {
    // the owner's real PromptPay number: show a sample instead (last digits too)
    const pp = document.querySelector("#promptpayId");
    if (pp && pp.value) pp.value = "0812345678";
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode())
      if (/•{5,}\d{4}/.test(n.nodeValue))
        n.nodeValue = n.nodeValue.replace(/•{5,}\d{4}/g, "••••••5678");
    for (const li of document.querySelectorAll("#admins li")) {
      if (li.textContent.includes("roosuk-manual.test")) continue;
      for (const s of li.querySelectorAll("span.text-muted"))
        if (s.textContent.trim().startsWith("·")) s.textContent = "";
    }
  });
}
const status = (page) => page.getByRole("status").filter({ hasText: /\S/ });
const section = async (name, fn) => {
  if (!wants(name)) return;
  console.log(`# ${name}`);
  try {
    await fn();
  } catch (e) {
    console.error(`!! section ${name} failed:`, e.message);
    await R.page
      .screenshot({ path: `/tmp/claude-0/work/fail-${name}.png` })
      .catch(() => {});
    process.exitCode = 1;
  }
};
const lastShopSettingsRestore = async () => {};

// seeds that are done by really operating the app as a normal user (idempotent per run)
let payersDone = false;
async function ensurePayers() {
  if (payersDone) return;
  payersDone = true;
  const p1 = await person("payer1", "สมหญิง ใจดี");
  const p2 = await person("payer2", "สมชาย รักสุข");
  await payerReports(p1, "SCB-4821");
  await payerReports(p2, "KBANK-7305");
}
let leadsDone = false;
async function ensureLeads() {
  if (leadsDone) return;
  leadsDone = true;
  const l1 = await person("lead1", "วิภา สนใจตรวจ");
  const l2 = await person("lead2", "ประสิทธิ์ ใฝ่รู้");
  await as(l1, async ({ page }) => {
    await page.goto("/checkup-interest");
    await page.waitForLoadState("networkidle");
    await page.getByRole("radio", { name: "ตรวจสุขภาพที่บ้าน" }).check();
    await page.getByRole("radio", { name: "โทรศัพท์" }).check();
    await page.getByLabel("เบอร์โทรศัพท์").fill("080-000-0000");
    await page
      .getByLabel(/อยากบอกอะไรเพิ่มเติม/)
      .fill("สะดวกให้โทรหลัง 17.00 น.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "ส่งคำขอ" }).click();
    await page
      .getByRole("heading", { name: "คำขอของคุณรอการติดต่อกลับ" })
      .waitFor();
  });
  await as(l2, async ({ page }) => {
    await page.goto("/checkup-interest");
    await page.waitForLoadState("networkidle");
    await page.getByRole("radio", { name: "แพ็กเกจตรวจสุขภาพ" }).check();
    await page.getByRole("radio", { name: "LINE" }).check();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "ส่งคำขอ" }).click();
    await page
      .getByRole("heading", { name: "คำขอของคุณรอการติดต่อกลับ" })
      .waitFor();
  });
  await d
    .from("app_notifications")
    .delete()
    .in("kind", ["payment_review", "lead_new"])
    .gte("created_at", made.startedAt);
  const admins = (await d.from("admins").select("user_id")).data ?? [];
  if (admins.length)
    await d
      .from("notification_queue")
      .delete()
      .in(
        "user_id",
        admins.map((a) => a.user_id),
      )
      .eq("status", "queued")
      .gte("created_at", made.startedAt);
}
const UNKNOWN = {
  normalized_name: "lipoprotein a ตัวอย่างคู่มือ",
  display_name: "Lipoprotein (a) [ตัวอย่างคู่มือ]",
  unit_sample: "nmol/L",
  times_seen: 4,
};
let unknownDone = false;
async function ensureUnknown() {
  if (unknownDone) return;
  unknownDone = true;
  made.unknown.push(UNKNOWN.normalized_name);
  save();
  const { error } = await d.from("lab_unknown_markers").insert(UNKNOWN);
  if (error) throw error;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────
await snapshot();
R = await startRecorder({ manual: "admin", base: BASE });
const { page } = R;
try {
  const admin = await asAdmin();

  // ════════════ access: how to reach the Admin area ════════════
  await section("access", async () => {
    // a normal account gets a plain "not found"
    const normal = await person("normal", "สมศรี ผู้ใช้ทั่วไป");
    await signInAndConsent(page, normal);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await shot("access-1-notfound");
    await R.ctx.clearCookies();
    // an admin: More sheet → "ผู้ดูแลระบบ"
    await signInAndConsent(page, admin);
    await page.waitForLoadState("networkidle");
    await shot("access-2-today", {
      highlight: page.getByRole("button", { name: "เพิ่มเติม" }),
    });
    await page.getByRole("button", { name: "เพิ่มเติม" }).click();
    const link = page
      .getByRole("dialog")
      .getByRole("link", { name: "ผู้ดูแลระบบ" });
    await link.waitFor();
    await shot("access-3-more", { highlight: link, scrollTo: link });
    await link.click();
    await page.waitForURL(/\/admin$/);
    await page.waitForLoadState("networkidle");
    await shot("access-4-home");
  });

  // ════════════ home ════════════
  await section("home", async () => {
    await ensurePayers();
    await ensureLeads();
    await ensureUnknown();
    await signInAgain(admin);
    await go("/admin");
    await shot("home-1-top");
    await shot("home-2-middle", {
      scrollTo: page.getByRole("link", { name: /ค่าอ้างอิงแล็บที่เพิ่มเอง/ }),
    });
    await shot("home-3-bottom", {
      scrollTo: page.getByRole("link", { name: "สวิตช์ฟีเจอร์" }),
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot("home-4-admins");
  });

  // ════════════ payments ════════════
  await section("payments", async () => {
    await ensurePayers();
    await signInAgain(admin);
    await go("/admin/payments");
    await shot("payments-1-top", {
      highlight: page.locator("form.card").first(),
    });
    const field = page.getByLabel("เลขพร้อมเพย์รับเงิน");
    await field.fill("12345");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "เลขพร้อมเพย์ไม่ถูกต้อง" })
      .waitFor();
    await shot("payments-2-invalid", {
      highlight: page
        .getByRole("alert")
        .filter({ hasText: "เลขพร้อมเพย์ไม่ถูกต้อง" }),
    });
    await field.fill("081-234-5678");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }).waitFor();
    await shot("payments-3-saved", {
      highlight: page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }),
    });
    // the sample id was only for this screenshot: put the real one back at once
    await d
      .from("platform_settings")
      .update({ promptpay_id: made.baseline.platform.promptpay_id })
      .eq("id", true);

    await go("/admin/payments");
    const q1 = page.locator("li.card").filter({ hasText: "SCB-4821" });
    const q2 = page.locator("li.card").filter({ hasText: "KBANK-7305" });
    await shot("payments-4-queue", {
      highlight: q1,
      scrollTo: page.locator("#queue-h"),
    });
    await q2
      .getByLabel("หมายเหตุถึงผู้จ่าย (ไม่บังคับ)")
      .fill("ไม่พบยอดโอนในสเตทเมนต์ของวันนี้");
    await shot("payments-5-note", {
      highlight: q2.getByLabel("หมายเหตุถึงผู้จ่าย (ไม่บังคับ)"),
      scrollTo: q2.getByLabel("หมายเหตุถึงผู้จ่าย (ไม่บังคับ)"),
    });
    await q2.getByRole("button", { name: "ตรวจไม่พบการโอน" }).click();
    await page.locator("#history-h").waitFor();
    await page.waitForLoadState("networkidle");
    await shot("payments-6-rejected", {
      highlight: page.locator("#history-h + ul li").first(),
      scrollTo: page.locator("#history-h"),
    });
    await shot("payments-7-confirm-btn", {
      highlight: q1.getByRole("button", { name: "ยืนยันว่าได้รับเงิน" }),
      scrollTo: q1.getByRole("button", { name: "ยืนยันว่าได้รับเงิน" }),
    });
    await q1.getByRole("button", { name: "ยืนยันว่าได้รับเงิน" }).click();
    await page
      .locator("#history-h + ul li")
      .filter({ hasText: "SCB-4821" })
      .waitFor();
    await page.waitForLoadState("networkidle");
    await shot("payments-8-history", { scrollTo: page.locator("#history-h") });

    // what the payer sees afterwards
    await as(users.payer1, async (r) => {
      await r.page.goto("/subscription");
      await r.page.waitForLoadState("networkidle");
      await r.shot("payments-9-user-plan");
    });
    await as(users.payer2, async (r) => {
      await r.page.goto("/subscription");
      await r.page.waitForLoadState("networkidle");
      await r.shot("payments-10-user-rejected", {
        scrollTo: r.page.getByText(/ตรวจไม่พบการโอน/).first(),
      });
    });
  });

  // ════════════ leads ════════════
  await section("leads", async () => {
    await ensureLeads();
    await signInAgain(admin);
    await go("/admin/leads");
    await shot("leads-1-list");
    const c1 = page.locator("li.card").filter({ hasText: "ตรวจสุขภาพที่บ้าน" });
    await shot("leads-2-card", { highlight: c1, scrollTo: c1 });
    // what the person sees while the request is still "new"
    await as(users.lead1, async (r) => {
      await r.page.goto("/checkup-interest");
      await r.page.waitForLoadState("networkidle");
      await r.shot("leads-5-user-waiting");
    });
    await c1.getByLabel("สถานะ").selectOption("contacted");
    await c1
      .getByLabel("บันทึกของทีม")
      .fill("โทรแล้ว นัดตรวจวันเสาร์ 09.00 น.");
    await shot("leads-3-edit", {
      highlight: [c1.getByLabel("สถานะ"), c1.getByLabel("บันทึกของทีม")],
      scrollTo: c1.getByLabel("บันทึกของทีม"),
    });
    await c1.getByRole("button", { name: "บันทึก" }).click();
    await page.waitForLoadState("networkidle");
    // (the status box can still show the old value right after saving; a reload shows what is stored)
    await sleep(1500);
    await go("/admin/leads");
    await shot("leads-4-saved", {
      highlight: page
        .locator("li.card")
        .filter({ hasText: "ตรวจสุขภาพที่บ้าน" }),
      scrollTo: page
        .locator("li.card")
        .filter({ hasText: "ตรวจสุขภาพที่บ้าน" }),
    });
  });

  // ════════════ biomarkers ════════════
  await section("biomarkers", async () => {
    await ensureUnknown();
    await signInAgain(admin);
    await go("/admin/biomarkers");
    await shot("biomarkers-1-top");
    const card = page
      .locator("li.card")
      .filter({ hasText: UNKNOWN.display_name });
    await shot("biomarkers-2-queue", { highlight: card, scrollTo: card });
    await card.getByText("สร้างค่าอ้างอิง").click();
    await card.getByLabel("ชื่อภาษาไทย").waitFor();
    await shot("biomarkers-3-form", {
      scrollTo: card.getByLabel("ชื่อภาษาไทย"),
    });
    await shot("biomarkers-3b-ai-button", {
      highlight: card.getByRole("button", { name: /ให้ AI ร่างช่วงค่า/ }),
      scrollTo: card.getByRole("button", { name: /ให้ AI ร่างช่วงค่า/ }),
    });
    const KEY = "manual_demo_lpa";
    made.keys.push(KEY);
    save();
    await card.getByLabel(/^รหัส/).fill(KEY);
    await card
      .getByLabel("ชื่อภาษาไทย")
      .fill("ไลโปโปรตีน (เอ) [ตัวอย่างคู่มือ]");
    await card.getByLabel(/ปกติ ไม่เกิน/).fill("75");
    await card.getByLabel(/เฝ้าระวัง ไม่เกิน/).fill("125");
    await card
      .getByLabel("ที่มาของช่วงค่า (บังคับ)")
      .fill("ตัวอย่างประกอบคู่มือ ไม่ใช่ข้อมูลทางการแพทย์จริง");
    await shot("biomarkers-4-filled", {
      highlight: [
        card.getByLabel(/ปกติ ไม่เกิน/),
        card.getByLabel(/เฝ้าระวัง ไม่เกิน/),
        card.getByLabel("ที่มาของช่วงค่า (บังคับ)"),
      ],
      scrollTo: card.getByLabel(/ปกติ ไม่เกิน/),
    });
    await card.getByRole("button", { name: "บันทึกเป็นร่าง" }).click();
    await card
      .getByRole("status")
      .filter({ hasText: "บันทึกเป็นร่างแล้ว" })
      .waitFor();
    await shot("biomarkers-5-saved", {
      highlight: card
        .getByRole("status")
        .filter({ hasText: "บันทึกเป็นร่างแล้ว" }),
      scrollTo: card
        .getByRole("status")
        .filter({ hasText: "บันทึกเป็นร่างแล้ว" }),
    });
    await go("/admin/biomarkers");
    const extra = page
      .locator("li.card")
      .filter({ hasText: `(${KEY}, nmol/L)` });
    await shot("biomarkers-6-draft", { highlight: extra, scrollTo: extra });
    await extra.getByRole("checkbox").check();
    await shot("biomarkers-7-approve", {
      highlight: extra.locator("form").first(),
      scrollTo: extra.getByRole("checkbox"),
    });
    await extra.getByRole("button", { name: "รับรองและเริ่มใช้" }).click();
    await page.waitForLoadState("networkidle");
    const done = page
      .locator("li.card")
      .filter({ hasText: `(${KEY}, nmol/L)` });
    await done.getByRole("button", { name: "ถอนการรับรอง" }).waitFor();
    await shot("biomarkers-8-approved", { highlight: done, scrollTo: done });
    await done.getByText("แก้ไขรายการนี้").click();
    await shot("biomarkers-9-edit", {
      scrollTo: done.getByText("แก้ไขรายการนี้"),
    });
    await done.getByRole("button", { name: "ลบ", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await shot("biomarkers-10-deleted", {
      scrollTo: page.locator("#bm-extras"),
    });
  });

  // ════════════ rewards ════════════
  await section("rewards", async () => {
    await signInAgain(admin);
    await go("/admin/rewards");
    await shot("rewards-1-top");
    const ref = page.getByLabel(/รางวัลชวนเพื่อน \(฿/);
    await shot("rewards-2-form", { highlight: ref, scrollTo: ref });
    await ref.fill("15");
    await shot("rewards-3-edit", { highlight: ref, scrollTo: ref });
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }).waitFor();
    await shot("rewards-4-saved", {
      highlight: page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }),
    });
    const viewer = await person("viewer", "มานะ ผู้ชม");
    await as(viewer, async (r) => {
      await r.page.goto("/rewards");
      await r.page.waitForLoadState("networkidle");
      await r.shot("rewards-5-user-rewards", {
        scrollTo: r.page.getByText(/ชวนเพื่อน/).first(),
      });
      await r.page.goto("/challenges");
      await r.page.waitForLoadState("networkidle");
      await r.shot("rewards-6-user-challenges");
    });
    await d
      .from("platform_settings")
      .update({
        reward_referral_thb: made.baseline.platform.reward_referral_thb,
      })
      .eq("id", true);
  });

  // ════════════ paywall ════════════
  await section("paywall", async () => {
    await ensurePayers();
    await signInAgain(admin);
    await go("/admin/paywall");
    await shot("paywall-1-top");
    await shot("paywall-2-results", { scrollTo: page.locator("#pw-res") });
    await page.getByLabel("ทุกคนเห็น B", { exact: true }).check();
    await shot("paywall-3-pick", {
      highlight: page.getByLabel("ทุกคนเห็น B", { exact: true }),
      scrollTo: page.getByLabel("ทุกคนเห็น B", { exact: true }),
    });
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "บันทึกโหมดแล้ว" })
      .waitFor();
    await shot("paywall-4-saved", {
      highlight: page.getByRole("status").filter({ hasText: "บันทึกโหมดแล้ว" }),
    });
    const viewer = await person("viewer", "มานะ ผู้ชม");
    await as(viewer, async (r) => {
      await r.page.goto("/subscription");
      await r.page.waitForLoadState("networkidle");
      const gold = r.page
        .locator("li")
        .filter({ has: r.page.getByRole("heading", { name: "Gold" }) })
        .last();
      await r.shot("paywall-5-user-b", { scrollTo: gold });
    });
    await page.getByLabel("ทุกคนเห็น A", { exact: true }).check();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "บันทึกโหมดแล้ว" })
      .waitFor();
    await as(viewer, async (r) => {
      await r.page.goto("/subscription");
      await r.page.waitForLoadState("networkidle");
      const gold = r.page
        .locator("li")
        .filter({ has: r.page.getByRole("heading", { name: "Gold" }) })
        .last();
      await r.shot("paywall-6-user-a", { scrollTo: gold });
    });
    // back to the split the owner had
    await page.getByLabel("แบ่งครึ่ง A/B", { exact: true }).check();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "บันทึกโหมดแล้ว" })
      .waitFor();
    await d
      .from("platform_settings")
      .update({ paywall_ab: made.baseline.platform.paywall_ab })
      .eq("id", true);
  });

  // ════════════ analytics ════════════
  await section("analytics", async () => {
    await ensurePayers();
    await signInAgain(admin);
    await go("/admin/analytics");
    await shot("analytics-1-top");
    await shot("analytics-2-funnel", { scrollTo: page.locator("#funnel-h") });
    await shot("analytics-3-retention", { scrollTo: page.locator("#ret-h") });
    await shot("analytics-4-events", { scrollTo: page.locator("#ev-h") });
    const chip = page.getByRole("link", { name: "7 วัน" });
    await chip.click();
    await page.waitForURL(/days=7/);
    await page.waitForLoadState("networkidle");
    await shot("analytics-5-7days", {
      highlight: page.getByRole("link", { name: "7 วัน" }),
    });
  });

  // ════════════ ai ════════════
  await section("ai", async () => {
    await signInAgain(admin);
    await go("/admin/ai");
    await shot("ai-1-top");
    await shot("ai-2-keys", { scrollTo: page.locator("#keys-h") });
    const first = page.locator("#routing-h ~ form li.card").first();
    await shot("ai-3-routing", { highlight: first, scrollTo: first });
    await first.getByText("รุ่นโมเดล").click();
    await shot("ai-4-models", {
      highlight: first.getByRole("button", { name: "ทดสอบ" }).first(),
      scrollTo: first.getByRole("button", { name: "ทดสอบ" }).first(),
    });
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }).waitFor();
    await shot("ai-5-saved", {
      highlight: page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }),
      scrollTo: page.getByRole("status").filter({ hasText: "บันทึกแล้ว" }),
    });
    await shot("ai-6-events", { scrollTo: page.locator("#events-h") });
  });

  // ════════════ prompts ════════════
  await section("prompts", async () => {
    await signInAgain(admin);
    await go("/admin/prompts");
    await shot("prompts-1-top");
    const card = page.locator("li.card").filter({
      has: page.getByRole("heading", { name: "สร้างคำแนะนำรายวัน" }),
    });
    await card.getByText("คำสั่งหลักของระบบ (อ่านอย่างเดียว)").click();
    await shot("prompts-2-builtin", {
      highlight: card.locator("pre").first(),
      scrollTo: card.locator("pre").first(),
    });
    await shot("prompts-3-guardrails", {
      highlight: card.getByText("กฎที่โค้ดบังคับ (อ่านอย่างเดียว)"),
      scrollTo: card.getByText("กฎที่โค้ดบังคับ (อ่านอย่างเดียว)"),
    });
    const ta = card.getByLabel("คำสั่งเสริมจากแอดมิน");
    await ta.fill(
      'ใช้ภาษาที่อบอุ่น กระชับ และลงท้ายด้วย "ค่ะ" ทุกประโยค (ตัวอย่างสำหรับคู่มือ)',
    );
    await shot("prompts-4-typed", { highlight: ta, scrollTo: ta });
    // 1) the code check refuses a link
    await ta.fill("อ่านเพิ่มเติมที่ https://example.com ก่อนตอบ");
    await card.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
    const alert = card.getByRole("alert");
    await alert.waitFor();
    await shot("prompts-5-rejected", { highlight: alert, scrollTo: alert });
    // 2) a normal text goes to the AI reviewer (its answer, or "cannot answer", decides)
    await ta.fill(
      'ใช้ภาษาที่อบอุ่น กระชับ และลงท้ายด้วย "ค่ะ" ทุกประโยค (ตัวอย่างสำหรับคู่มือ)',
    );
    await card.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
    await card
      .locator("[role=alert],[role=status]")
      .first()
      .waitFor({ timeout: 60000 });
    await page.waitForLoadState("networkidle");
    await shot("prompts-6-review-result", {
      highlight: card.locator("[role=alert],[role=status]").first(),
      scrollTo: card.locator("[role=alert],[role=status]").first(),
    });
    // 3) the saved state with its history (written here directly if the reviewer was unavailable)
    const saved =
      (
        await d
          .from("ai_prompt_versions")
          .select("id")
          .eq("task", "daily_plan")
          .gt("id", made.baseline.promptMax)
      ).data ?? [];
    if (saved.length === 0)
      await d.from("ai_prompt_versions").insert({
        task: "daily_plan",
        body: 'ใช้ภาษาที่อบอุ่น กระชับ และลงท้ายด้วย "ค่ะ" ทุกประโยค (ตัวอย่างสำหรับคู่มือ)',
        created_by: admin.id,
        review: { verdict: "ok", reasons: [], model: "manual-demo" },
      });
    await go("/admin/prompts");
    const card2 = page.locator("li.card").filter({
      has: page.getByRole("heading", { name: "สร้างคำแนะนำรายวัน" }),
    });
    await card2.getByText("ประวัติการแก้ไข").click();
    await shot("prompts-7-saved-history", {
      highlight: card2.getByText("ประวัติการแก้ไข"),
      scrollTo: card2.getByText("ประวัติการแก้ไข"),
    });
    // 4) clearing needs no review
    const ta2 = card2.getByLabel("คำสั่งเสริมจากแอดมิน");
    await ta2.fill("");
    await card2.getByRole("button", { name: "ตรวจสอบและบันทึก" }).click();
    await card2
      .getByRole("status")
      .filter({ hasText: "ลบคำสั่งเสริมแล้ว" })
      .waitFor();
    await shot("prompts-8-cleared", {
      highlight: card2
        .getByRole("status")
        .filter({ hasText: "ลบคำสั่งเสริมแล้ว" }),
      scrollTo: card2
        .getByRole("status")
        .filter({ hasText: "ลบคำสั่งเสริมแล้ว" }),
    });
    await shot("prompts-9-reviewer-note", {
      scrollTo: page.getByText("งานนี้คือผู้ตรวจคำสั่งเสริมเอง"),
    });
  });

  // ════════════ manual ════════════
  await section("manual", async () => {
    const viewer = await person("viewer", "มานะ ผู้ชม");
    await as(viewer, async (r) => {
      await r.page.goto("/today");
      await r.page.getByRole("button", { name: "เพิ่มเติม" }).click();
      const item = r.page.getByRole("dialog").getByText("คู่มือการใช้งาน");
      await item.waitFor();
      await r.shot("manual-1-user-before", { highlight: item, scrollTo: item });
    });
    await signInAgain(admin);
    await go("/admin/manual");
    await shot("manual-2-page");
    const f = page.getByLabel("ลิงก์คู่มือ (https)");
    await f.fill("https://example.com/roosuk-user-guide.pdf");
    await shot("manual-3-typed", { highlight: f });
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "บันทึกลิงก์แล้ว" })
      .waitFor();
    await shot("manual-4-saved", {
      highlight: page
        .getByRole("status")
        .filter({ hasText: "บันทึกลิงก์แล้ว" }),
    });
    await as(viewer, async (r) => {
      await r.page.goto("/today");
      await r.page.getByRole("button", { name: "เพิ่มเติม" }).click();
      const item = r.page
        .getByRole("dialog")
        .getByRole("link", { name: "คู่มือการใช้งาน" });
      await item.waitFor();
      await r.shot("manual-5-user-after", { highlight: item, scrollTo: item });
    });
    await f.fill("");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "ล้างลิงก์แล้ว" })
      .waitFor();
    await shot("manual-6-cleared", {
      highlight: page.getByRole("status").filter({ hasText: "ล้างลิงก์แล้ว" }),
    });
    await d
      .from("platform_settings")
      .update({ manual_url: made.baseline.platform.manual_url })
      .eq("id", true);
  });

  // ════════════ rules ════════════
  await section("rules", async () => {
    await signInAgain(admin);
    await go("/admin/rules");
    await shot("rules-1-top");
    const lineForm = page.locator("form").filter({ has: page.locator("#cap") });
    await shot("rules-2-line", { highlight: lineForm, scrollTo: lineForm });
    await page.locator("#cap").fill("250");
    await shot("rules-3-line-edit", {
      highlight: page.locator("#cap"),
      scrollTo: page.locator("#cap"),
    });
    await lineForm.getByRole("button", { name: "บันทึก" }).click();
    await page.waitForLoadState("networkidle");
    await shot("rules-4-line-saved", {
      highlight: page.getByText(/ส่งแล้วเดือนนี้ \d+ จาก 250/),
      scrollTo: page.getByText(/ส่งแล้วเดือนนี้ \d+ จาก 250/),
    });
    const rule = page
      .locator("li")
      .filter({ has: page.locator("code", { hasText: "checkin_reminder" }) });
    await shot("rules-5-rule", {
      highlight: rule,
      scrollTo: rule.getByRole("checkbox"),
    });
    await page.locator("#checkin_reminder-hour").fill("20");
    await shot("rules-6-rule-edit", {
      highlight: page.locator("#checkin_reminder-hour"),
      scrollTo: page.locator("#checkin_reminder-hour"),
    });
    await rule.getByRole("button", { name: "บันทึก" }).click();
    await page.waitForLoadState("networkidle");
    await shot("rules-7-rule-saved", {
      highlight: page.locator("#checkin_reminder-hour"),
      scrollTo: page.locator("#checkin_reminder-hour"),
    });
    await shot("rules-8-ticks", { scrollTo: page.locator("#ticks-h") });
    await restore();
  });

  // ════════════ flags ════════════
  await section("flags", async () => {
    await signInAgain(admin);
    await go("/admin/flags");
    await shot("flags-1-list");
    const row = page.locator("li.card").filter({ hasText: "จองตรวจสุขภาพ" });
    await shot("flags-2-row", { highlight: row, scrollTo: row });
    await row.getByRole("button", { name: "ปิด", exact: true }).click();
    await page.waitForLoadState("networkidle");
    const off = page.locator("li.card").filter({ hasText: "จองตรวจสุขภาพ" });
    await off.getByText("ปิดอยู่").waitFor();
    await shot("flags-3-off", { highlight: off, scrollTo: off });
    await off.getByRole("button", { name: "เปิด", exact: true }).click();
    await page.waitForLoadState("networkidle");
    const on = page.locator("li.card").filter({ hasText: "จองตรวจสุขภาพ" });
    await on.getByText("เปิดอยู่").waitFor();
    await shot("flags-4-on", { highlight: on, scrollTo: on });
    // the effect on a person: a switched-off feature stops for them (shown with "แพ็กเกจองค์กร", for a few seconds only)
    const viewer = await person("viewer", "มานะ ผู้ชม");
    const corp = () =>
      page.locator("li.card").filter({ hasText: "แพ็กเกจองค์กร" });
    await corp().getByRole("button", { name: "ปิด", exact: true }).click();
    await corp().getByText("ปิดอยู่").waitFor();
    try {
      await as(viewer, async (r) => {
        await r.page.goto("/company");
        await r.page.waitForLoadState("networkidle");
        await r.shot("flags-5-user-off");
      });
    } finally {
      await go("/admin/flags");
      await corp().getByRole("button", { name: "เปิด", exact: true }).click();
      await corp().getByText("เปิดอยู่").waitFor();
      await d
        .from("platform_settings")
        .update({ feature_flags: made.baseline.platform.feature_flags })
        .eq("id", true);
    }
  });

  // ════════════ shop ════════════
  await section("shop", async () => {
    const PARTNER = "ร้านพาร์ตเนอร์ตัวอย่าง (คู่มือ)";
    const SKU = `${TAG}-A1`;
    made.partners.push(PARTNER);
    made.skus.push(SKU, `${TAG}-IMP1`, `${TAG}-IMP2`);
    save();
    const png = async (label, color) => {
      const pg = await R.browser.newPage({
        viewport: { width: 600, height: 600 },
      });
      await pg.setContent(
        `<body style="margin:0;display:flex;align-items:center;justify-content:center;width:600px;height:600px;background:linear-gradient(135deg,${color},#2DD4A7);font:700 56px sans-serif;color:#fff;text-align:center">${label}</body>`,
      );
      const buf = await pg.screenshot({ type: "png" });
      await pg.close();
      return buf;
    };
    await signInAgain(admin);

    // ── partners ──
    await go("/admin/shop/partners");
    await shot("shop-4-partners");
    const add = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "เพิ่มพาร์ตเนอร์" }) });
    await add.getByLabel("ชื่อพาร์ตเนอร์").fill(PARTNER);
    await add
      .getByLabel("ช่องทางติดต่อ (โทร/LINE/อีเมล)")
      .fill("LINE: @partner-demo");
    await add
      .getByLabel("บันทึก", { exact: true })
      .fill("ส่งสินค้าภายใน 2 วันทำการ");
    await shot("shop-5-partner-form", {
      highlight: add,
      scrollTo: add.getByLabel("ชื่อพาร์ตเนอร์"),
    });
    await add.getByRole("button", { name: "เพิ่มพาร์ตเนอร์" }).click();
    await add.getByRole("status").filter({ hasText: "บันทึกแล้ว" }).waitFor();
    await go("/admin/shop/partners");
    const prow = page
      .locator("li.card")
      .filter({ has: page.locator(`input[value="${PARTNER}"]`) });
    await shot("shop-6-partner-added", { highlight: prow, scrollTo: prow });

    // ── a product ──
    await go("/admin/shop/products");
    await shot("shop-7-products", {
      highlight: page.getByRole("link", { name: "เพิ่มสินค้าใหม่" }),
    });
    await page.getByRole("link", { name: "เพิ่มสินค้าใหม่" }).click();
    await page.waitForURL(/products\/new/);
    await page.waitForLoadState("networkidle");
    await shot("shop-8-new-form");
    const fill = async (summary) => {
      await page.getByLabel("รหัสสินค้า (SKU)").fill(SKU);
      await page
        .getByLabel("พาร์ตเนอร์ที่จัดส่ง")
        .selectOption({ label: PARTNER });
      await page
        .getByLabel("ชื่อสินค้า (ไทย)")
        .fill("แมกนีเซียม 200 มก. (ตัวอย่างคู่มือ)");
      await page
        .getByLabel("ชื่อสินค้า (อังกฤษ)")
        .fill("Magnesium 200 mg (manual sample)");
      await page.getByLabel("ยี่ห้อ").fill("BrandX");
      await page.getByLabel("ราคาขาย (บาท)").fill("390");
      await page.getByLabel(/ราคาก่อนลด/).fill("450");
      await page.getByLabel(/สต็อก \(เว้นว่าง/).fill("5");
      await page.getByLabel("คำอธิบายสั้น (ไทย)").fill(summary);
      await page
        .getByLabel("คำเตือน")
        .fill("ปรึกษาแพทย์หรือเภสัชกรก่อนใช้ หากตั้งครรภ์หรือมีโรคประจำตัว");
      await page.getByLabel("เลขทะเบียน อย.").fill("12-1-12345-1-0001");
      await page.getByRole("checkbox", { name: "การนอน" }).check();
      await page.getByRole("checkbox", { name: /วางขาย/ }).check();
    };
    await fill("ช่วยรักษาโรคเบาหวานให้หายขาด");
    await shot("shop-9-form-filled", {
      highlight: page.getByLabel("คำอธิบายสั้น (ไทย)"),
      scrollTo: page.getByLabel("คำอธิบายสั้น (ไทย)"),
    });
    await page.getByRole("button", { name: "บันทึกสินค้า" }).click();
    const bad = page.getByRole("alert");
    await bad.waitFor();
    await shot("shop-10-claims-error", { highlight: bad, scrollTo: bad });
    await page
      .getByLabel("คำอธิบายสั้น (ไทย)")
      .fill("แมกนีเซียมเสริมอาหาร รับประทานวันละ 1 เม็ดพร้อมอาหารเย็น");
    await page.getByRole("button", { name: "บันทึกสินค้า" }).click();
    await page.waitForURL(/\/admin\/shop\/products\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    await shot("shop-11-created", {
      highlight: page.getByRole("status").first(),
    });
    // photos
    const p1 = await png("ตัวอย่างสินค้า 1", "#0A8FA3");
    const p2 = await png("ตัวอย่างสินค้า 2", "#1E90FF");
    await page.locator("#photos").setInputFiles([
      { name: "photo1.png", mimeType: "image/png", buffer: p1 },
      { name: "photo2.png", mimeType: "image/png", buffer: p2 },
    ]);
    await shot("shop-12-photos-chosen", {
      highlight: page.locator("#photos"),
      scrollTo: page.locator("#photos"),
    });
    await page
      .locator("button.btn", { hasText: /เลือกรูป|กำลังอัปโหลด/ })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "อัปโหลดแล้ว 2 รูป" })
      .waitFor({ timeout: 60000 });
    await page.waitForLoadState("networkidle");
    await shot("shop-13-photos-done", {
      highlight: page.getByRole("list", { name: /รูปสินค้า/ }),
      scrollTo: page.getByRole("list", { name: /รูปสินค้า/ }),
    });
    await page.getByRole("button", { name: "เลื่อนลง 1" }).click();
    await page.waitForLoadState("networkidle");
    await shot("shop-14-reorder", {
      highlight: [page.getByRole("button", { name: "เลื่อนขึ้น 2" })],
      scrollTo: page.getByRole("list", { name: /รูปสินค้า/ }),
    });
    await page.getByRole("button", { name: "ลบรูป 2" }).click();
    await page.waitForLoadState("networkidle");
    await shot("shop-15-photo-deleted", {
      scrollTo: page.getByRole("list", { name: /รูปสินค้า/ }),
    });
    await page.getByLabel(/สต็อก \(เว้นว่าง/).fill("8");
    await page.getByRole("button", { name: "บันทึกสินค้า" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "บันทึกแล้ว" })
      .last()
      .waitFor();
    await shot("shop-16-edit-saved", {
      highlight: page
        .getByRole("status")
        .filter({ hasText: "บันทึกแล้ว" })
        .last(),
      scrollTo: page
        .getByRole("status")
        .filter({ hasText: "บันทึกแล้ว" })
        .last(),
    });
    await go("/admin/shop/products");
    const prodCard = page.locator("li").filter({ hasText: SKU });
    await shot("shop-17-products-list", {
      highlight: prodCard,
      scrollTo: prodCard,
    });
    const buyer = await person("buyer", "สมศักดิ์ ผู้ซื้อ");
    await as(buyer, async (r) => {
      await r.page.goto("/shop");
      await r.page.waitForLoadState("networkidle");
      const item = r.page.getByText("แมกนีเซียม 200 มก.").first();
      await r.shot("shop-18-user-shop", { scrollTo: item });
    });

    // ── import ──
    await go("/admin/shop/import");
    await shot("shop-19-import", {
      highlight: page.getByRole("link", { name: "ดาวน์โหลดตัวอย่าง CSV" }),
    });
    const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const cols = [
      "sku",
      "partner",
      "name_th",
      "name_en",
      "brand",
      "price_thb",
      "compare_at_thb",
      "stock",
      "summary_th",
      "summary_en",
      "description_th",
      "description_en",
      "ingredients",
      "usage_note",
      "caution",
      "fda_no",
      "serving",
      "tags",
      "active",
      "images",
    ];
    const row = (o) => cols.map((c) => q(o[c] ?? "")).join(",");
    const csv = [
      cols.join(","),
      row({
        sku: `${TAG}-IMP1`,
        partner: PARTNER,
        name_th: "วิตามินดีสาม (ตัวอย่างคู่มือ)",
        name_en: "Vitamin D3 (manual sample)",
        brand: "BrandX",
        price_thb: "250",
        stock: "20",
        summary_th: "วิตามินดีเสริมอาหาร",
        usage_note: "รับประทานวันละ 1 เม็ดหลังอาหาร",
        caution: "ปรึกษาแพทย์หรือเภสัชกรก่อนใช้",
        tags: "general",
        active: "ใช่",
      }),
      row({
        sku: `${TAG}-IMP2`,
        partner: PARTNER,
        name_th: "ผลิตภัณฑ์ราคาผิด (ตัวอย่าง)",
        price_thb: "abc",
        stock: "5",
        active: "ใช่",
      }),
    ].join("\n");
    const imp = await png("วิตามินดี", "#FF7A6B");
    await page.locator("#imp-files").setInputFiles([
      {
        name: "products.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("﻿" + csv),
      },
      { name: `${TAG}-IMP1_1.png`, mimeType: "image/png", buffer: imp },
    ]);
    await shot("shop-20-import-files", {
      highlight: page.locator("#imp-files"),
      scrollTo: page.locator("#imp-files"),
    });
    await page.getByRole("button", { name: "นำเข้า", exact: true }).click();
    const res = page
      .getByRole("status")
      .filter({ hasText: /บันทึกสินค้า \d+ รายการ/ });
    await res.waitFor({ timeout: 60000 });
    await shot("shop-21-import-result", { highlight: res, scrollTo: res });

    // ── orders: made like a buyer would (RPC = what checkout calls), then run by the admin ──
    const prod = (
      await d.from("shop_products").select("id").eq("sku", SKU).single()
    ).data;
    const seedOrder = async (qty, ref) => {
      const r = await d.rpc("create_shop_order", {
        p_user: buyer.id,
        p_lines: [{ product_id: prod.id, qty }],
        p_ship: {
          name: "คุณสมศักดิ์ ตัวอย่าง",
          phone: "0800000000",
          address: "99/9 ถนนตัวอย่าง แขวงทดสอบ เขตสมมติ",
          province: "กรุงเทพมหานคร",
          postal: "10110",
          note: "",
        },
        p_use_credit: false,
        p_credit_max: 0,
        p_shipping: 50,
        p_free_from: 500,
        p_promptpay: "0812345678",
      });
      if (r.error || !r.data?.ok)
        throw new Error(
          "seed order failed " + JSON.stringify(r.error ?? r.data),
        );
      made.orders.push(r.data.id);
      save();
      await d
        .from("shop_orders")
        .update({
          status: "payment_reported",
          payer_ref: ref,
          reported_at: new Date().toISOString(),
        })
        .eq("id", r.data.id);
      return r.data;
    };
    await seedOrder(1, "SCB-9981");
    await seedOrder(2, "KBANK-1175");
    await go("/admin/shop");
    await shot("shop-1-home");
    const settings = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "ค่าจัดส่ง" }) });
    await shot("shop-2-settings", { highlight: settings, scrollTo: settings });
    await settings.getByLabel("ค่าจัดส่ง (บาท)").fill("60");
    await settings.getByRole("button", { name: "บันทึก", exact: true }).click();
    await settings
      .getByRole("status")
      .filter({ hasText: "บันทึกแล้ว" })
      .waitFor();
    await shot("shop-3-settings-saved", {
      highlight: settings.getByRole("status"),
      scrollTo: settings,
    });
    await d
      .from("platform_settings")
      .update({ shop_shipping_thb: made.baseline.platform.shop_shipping_thb })
      .eq("id", true);

    await go("/admin/shop/orders");
    await shot("shop-22-orders", {
      highlight: page.getByRole("link", { name: "ทั้งหมด" }),
    });
    await shot("shop-23-orders-export", {
      highlight: page.locator("section[aria-labelledby=exp-h]"),
      scrollTo: page.locator("section[aria-labelledby=exp-h]"),
    });
    const orderLink = page
      .locator("a.card")
      .filter({ hasText: "฿440" })
      .first();
    await shot("shop-24-orders-list", {
      highlight: orderLink,
      scrollTo: orderLink,
    });
    await orderLink.click();
    await page.waitForURL(/orders\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    await shot("shop-25-order-detail");
    const step = (name) => page.getByRole("button", { name });
    await shot("shop-26-order-steps", {
      highlight: step("ยืนยันว่าได้รับเงินแล้ว"),
      scrollTo: step("ยืนยันว่าได้รับเงินแล้ว"),
    });
    await step("ยืนยันว่าได้รับเงินแล้ว").click();
    await page
      .getByRole("status")
      .filter({ hasText: "ชำระแล้ว" })
      .first()
      .waitFor();
    await page.waitForLoadState("networkidle");
    await shot("shop-27-paid", { highlight: page.getByRole("status").first() });
    await step("ส่งให้พาร์ตเนอร์แล้ว").click();
    await page
      .getByRole("status")
      .filter({ hasText: "ส่งให้พาร์ตเนอร์แล้ว" })
      .first()
      .waitFor();
    await page.waitForLoadState("networkidle");
    await shot("shop-28-processing", {
      highlight: page.getByRole("status").first(),
    });
    await step("พาร์ตเนอร์จัดส่งแล้ว").click();
    await page.getByRole("alert").filter({ hasText: "เลขพัสดุ" }).waitFor();
    await page.waitForLoadState("networkidle");
    await shot("shop-29-tracking-error", {
      highlight: page.getByRole("alert").filter({ hasText: "เลขพัสดุ" }),
    });
    await page.getByLabel("ขนส่ง").fill("Flash Express");
    await page.getByLabel("เลขพัสดุ").fill("TH0123456789");
    await shot("shop-30-tracking-filled", {
      highlight: [page.getByLabel("ขนส่ง"), page.getByLabel("เลขพัสดุ")],
      scrollTo: page.getByLabel("ขนส่ง"),
    });
    await step("พาร์ตเนอร์จัดส่งแล้ว").click();
    await page
      .getByRole("status")
      .filter({ hasText: "จัดส่งแล้ว" })
      .first()
      .waitFor();
    await page.waitForLoadState("networkidle");
    await shot("shop-31-shipped", {
      highlight: page.getByRole("status").first(),
    });
    await step("ลูกค้าได้รับสินค้าแล้ว").click();
    await page
      .getByRole("status")
      .filter({ hasText: "ได้รับสินค้าแล้ว" })
      .first()
      .waitFor();
    await page.waitForLoadState("networkidle");
    await shot("shop-32-delivered", {
      highlight: page.getByRole("status").first(),
    });
    await page
      .getByLabel("บันทึกภายใน")
      .fill("ลูกค้าโทรสอบถามเรื่องการจัดส่ง ตอบแล้ว");
    await shot("shop-33-note", {
      highlight: page.getByLabel("บันทึกภายใน"),
      scrollTo: page.getByLabel("บันทึกภายใน"),
    });
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await page.waitForLoadState("networkidle");
    await as(buyer, async (r) => {
      await r.page.goto("/shop/orders");
      await r.page.waitForLoadState("networkidle");
      await r.shot("shop-34-user-orders");
    });
    // cancel the other order: stock (and credit) come back
    await go("/admin/shop/orders");
    await page.locator("a.card").filter({ hasText: "฿780" }).first().click();
    await page.waitForURL(/orders\/[0-9a-f-]{36}/);
    await page.waitForLoadState("networkidle");
    const reason = page.getByLabel("เหตุผลที่ยกเลิก");
    await reason.fill("ลูกค้าขอยกเลิก (ตัวอย่าง)");
    await shot("shop-35-cancel", {
      highlight: page.getByRole("button", { name: /ยกเลิกออเดอร์/ }),
      scrollTo: reason,
    });
    await page.getByRole("button", { name: /ยกเลิกออเดอร์/ }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "ยกเลิกแล้ว" })
      .first()
      .waitFor();
    await page.waitForLoadState("networkidle");
    await shot("shop-36-cancelled", {
      highlight: page.getByRole("status").first(),
    });
    // delete the imported product (the one no order refers to)
    const impId = (
      await d
        .from("shop_products")
        .select("id")
        .eq("sku", `${TAG}-IMP1`)
        .single()
    ).data.id;
    await go(`/admin/shop/products/${impId}`);
    await shot("shop-37-delete-product", {
      highlight: page.getByRole("button", { name: "ลบสินค้านี้" }),
      scrollTo: page.getByRole("button", { name: "ลบสินค้านี้" }),
    });
    await page.getByRole("button", { name: "ลบสินค้านี้" }).click();
    await page.waitForURL(/\/admin\/shop\/products$/);
    await page.waitForLoadState("networkidle");
    await shot("shop-38-product-deleted");
  });

  // ════════════ corporate ════════════
  await section("corporate", async () => {
    const NAME = "บริษัท ตัวอย่างคู่มือ จำกัด";
    made.companies.push(NAME);
    save();
    await signInAgain(admin);
    await go("/admin/corporate");
    await shot("corporate-1-top");
    const add = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "เพิ่มองค์กร" }) });
    await add.getByLabel("ชื่อองค์กร").fill(NAME);
    await add.getByLabel("จำนวนที่นั่ง").fill("10");
    await add.getByLabel(/ใช้ได้ถึงวันที่/).fill("2027-12-31");
    await add.getByLabel("บันทึก (ไม่บังคับ)").fill("สัญญาปี 2570 (ตัวอย่าง)");
    await shot("corporate-2-form", {
      highlight: add,
      scrollTo: add.getByLabel("ชื่อองค์กร"),
    });
    await add.getByRole("button", { name: "เพิ่มองค์กร" }).click();
    await add.getByRole("status").filter({ hasText: "บันทึกแล้ว" }).waitFor();
    await shot("corporate-3-saved", {
      highlight: add.getByRole("status"),
      scrollTo: add.getByRole("status"),
    });
    await go("/admin/corporate");
    const card = page
      .locator("li.card")
      .filter({ has: page.locator(`[data-testid="code-${NAME}"]`) });
    const code = (
      (await card.locator(`[data-testid="code-${NAME}"]`).textContent()) ?? ""
    )
      .replace(/.*:\s*/, "")
      .trim();
    await shot("corporate-4-card", {
      highlight: card.locator(`[data-testid="code-${NAME}"]`),
      scrollTo: card.locator(`[data-testid="code-${NAME}"]`),
    });
    const member = await person("member", "วัชระ พนักงาน");
    await as(member, async (r) => {
      await r.page.goto("/company");
      await r.page.waitForLoadState("networkidle");
      await r.page.getByLabel("รหัสองค์กร", { exact: true }).fill(code);
      await r.shot("corporate-5-user-join", {
        highlight: r.page.getByLabel("รหัสองค์กร", { exact: true }),
      });
      await r.page.getByRole("button", { name: "เข้าร่วมองค์กร" }).click();
      await r.page.waitForURL(/joined=1/);
      await r.page.waitForLoadState("networkidle");
      await r.shot("corporate-6-user-joined");
      await r.page.goto("/subscription");
      await r.page.waitForLoadState("networkidle");
      await r.shot("corporate-7-user-plan");
    });
    await go("/admin/corporate");
    const card2 = page
      .locator("li.card")
      .filter({ has: page.locator(`[data-testid="code-${NAME}"]`) });
    await shot("corporate-8-used", {
      highlight: card2.getByText(/ที่นั่งที่ใช้/),
      scrollTo: card2.getByText(/ที่นั่งที่ใช้/),
    });
    await shot("corporate-9-edit", {
      highlight: card2.getByRole("button", { name: "บันทึก", exact: true }),
      scrollTo: card2.getByRole("button", { name: "บันทึก", exact: true }),
    });
    await shot("corporate-10-delete", {
      highlight: card2.getByRole("button", { name: /ลบองค์กร/ }),
      scrollTo: card2.getByRole("button", { name: /ลบองค์กร/ }),
    });
    await card2.getByRole("button", { name: /ลบองค์กร/ }).click();
    await page.waitForLoadState("networkidle");
    await shot("corporate-11-deleted");
  });

  // ════════════ creators ════════════
  await section("creators", async () => {
    const creator = await person("creator", "ภัทรา ครีเอเตอร์");
    await signInAgain(admin);
    await go("/admin/creators");
    await shot("creators-1-top");
    const add = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "ตั้งเป็น Creator" }) });
    await add
      .getByLabel("อีเมลของผู้ใช้ที่มีบัญชีอยู่แล้ว")
      .fill("nobody-here@example.test");
    await add.getByLabel(/รหัสแนะนำ/).fill("MANUAL23");
    await add.getByLabel("ชื่อที่แสดง").fill("ครีเอเตอร์ ตัวอย่าง");
    await add.getByRole("button", { name: "ตั้งเป็น Creator" }).click();
    await add.getByRole("alert").waitFor();
    await shot("creators-2-notfound", {
      highlight: add.getByRole("alert"),
      scrollTo: add.getByRole("alert"),
    });
    await add
      .getByLabel("อีเมลของผู้ใช้ที่มีบัญชีอยู่แล้ว")
      .fill(creator.email);
    await shot("creators-3-filled", {
      highlight: add,
      scrollTo: add.getByLabel(/รหัสแนะนำ/),
    });
    await add.getByRole("button", { name: "ตั้งเป็น Creator" }).click();
    await add
      .getByRole("status")
      .filter({ hasText: "ตั้งเป็น Creator แล้ว" })
      .waitFor();
    await shot("creators-4-added", {
      highlight: add.getByRole("status"),
      scrollTo: add.getByRole("status"),
    });
    await go("/admin/creators");
    const row = page.locator("li.card").filter({ hasText: "MANUAL23" });
    await shot("creators-5-list", { highlight: row, scrollTo: row });
    await as(creator, async (r) => {
      await r.page.goto("/creator");
      await r.page.waitForLoadState("networkidle");
      await r.shot("creators-6-user-toolkit");
    });
    await go("/admin/creators");
    await page
      .locator("li.card")
      .filter({ hasText: "MANUAL23" })
      .getByRole("button", { name: "ถอด Creator" })
      .click();
    await page.waitForLoadState("networkidle");
    await shot("creators-7-removed");
  });

  // ════════════ admins ════════════
  await section("admins", async () => {
    const cand = await person("cand", "ธนา ผู้ดูแลใหม่");
    await signInAgain(admin);
    await go("/admin");
    const card = page.locator("#admins");
    await shot("admins-1-card", { scrollTo: card.locator("h2") });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot("admins-2-list");
    const f = page.getByLabel("อีเมลของผู้ใช้ที่มีบัญชีอยู่แล้ว");
    await f.fill("nobody-here@example.test");
    await card.getByRole("button", { name: "เพิ่มเป็น Admin" }).click();
    await card.getByRole("alert").waitFor();
    await shot("admins-3-notfound", {
      highlight: card.getByRole("alert"),
      scrollTo: card.getByRole("alert"),
    });
    await f.fill(`  ${cand.email.toUpperCase()} `);
    await shot("admins-4-typed", { highlight: f, scrollTo: f });
    await card.getByRole("button", { name: "เพิ่มเป็น Admin" }).click();
    await card
      .getByRole("status")
      .filter({ hasText: "เป็น Admin แล้ว" })
      .waitFor();
    await shot("admins-5-added", {
      highlight: card.getByRole("status"),
      scrollTo: card.getByRole("status"),
    });
    const mine = card
      .getByRole("listitem")
      .filter({ hasText: "roosuk-manual.test" })
      .filter({ hasText: "ธนา" });
    await shot("admins-6-new-row", { highlight: mine, scrollTo: mine });
    await as(cand, async (r) => {
      await r.page.goto("/admin");
      await r.page.waitForLoadState("networkidle");
      await r.shot("admins-7-new-admin-sees");
    });
    await card
      .getByRole("listitem")
      .filter({ hasText: "ธนา" })
      .getByRole("button", { name: /ถอนสิทธิ์ Admin/ })
      .click();
    await page.waitForURL(/admins=revoked/);
    await page.waitForLoadState("networkidle");
    await shot("admins-8-revoked", {
      highlight: page
        .getByRole("status")
        .filter({ hasText: "ถอนสิทธิ์ Admin แล้ว" }),
      scrollTo: page
        .getByRole("status")
        .filter({ hasText: "ถอนสิทธิ์ Admin แล้ว" }),
    });
  });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await R.close().catch(() => {});
  let cleaned = true;
  await restore().catch(
    (e) => ((cleaned = false), console.error("restore failed", e.message)),
  );
  await cleanup().catch(
    (e) => ((cleaned = false), console.error("cleanup failed", e.message)),
  );
  const after = await counts();
  const diff = Object.entries(after).filter(
    ([k, v]) => v !== made.baseline?.counts?.[k],
  );
  console.log(
    "count differences vs baseline (other workers may add rows too):",
    JSON.stringify(diff),
  );
  if (cleaned && existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  console.log(`${shots.length} shots`);
}
