// Renders content.mjs to a Thai PDF in the app's brand colours (same engine and
// fonts as docs/manual: Chromium + Noto Sans Thai from src/assets/fonts).
// Run from the repo root:  NODE_USE_ENV_PROXY=1 node docs/status/build.mjs
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import doc from "./content.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
const CHIP = {
  done: ["เสร็จ", "c-done"],
  part: ["บางส่วน", "c-part"],
  todo: ["ยังไม่ทำ", "c-todo"],
};
const chip = (k) => `<span class="chip ${CHIP[k][1]}">${CHIP[k][0]}</span>`;
const font = (w, f) =>
  `@font-face{font-family:"Noto Sans Thai";font-weight:${w};src:url("${pathToFileURL(join(ROOT, "src/assets/fonts", f)).href}")}`;
const logo = pathToFileURL(join(ROOT, "docs", "RooSuk Logo.png")).href;

const count = (rows) => {
  const c = { done: 0, part: 0, todo: 0 };
  for (const r of rows) c[r[1]]++;
  return c;
};

const phaseHtml = (p, n) => {
  const c = count(p.rows);
  return `<section class="phase"><header class="head"><div class="no">${n}</div><div><h2>${esc(p.title)}</h2>
    <div class="sub">เสร็จ ${c.done} · บางส่วน ${c.part} · ยังไม่ทำ ${c.todo} (จาก ${p.rows.length} รายการ)</div></div></header>
    <p class="lead">${inline(p.lead)}</p>
    <table><thead><tr><th>งาน</th><th class="s">สถานะ</th><th>รายละเอียด / หมายเหตุ</th></tr></thead><tbody>
    ${p.rows.map(([a, s, b]) => `<tr><td>${inline(a)}</td><td class="s">${chip(s)}</td><td>${inline(b)}</td></tr>`).join("")}
    </tbody></table></section>`;
};

const list = (items) =>
  `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
${font(400, "NotoSansThai-Regular.ttf")}${font(700, "NotoSansThai-Bold.ttf")}
:root{--teal:#0A8FA3;--teal-d:#07707F;--mint:#2DD4A7;--sky:#1E90FF;--coral:#FF7A6B;--amber:#F2A93B;--bg:#F7FBFA;--ink:#1F2A30}
@page{size:A4;margin:16mm 14mm 18mm}
*{box-sizing:border-box}
html{font-family:"Noto Sans Thai",sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}h1,h2,h3,p,ul{margin:0}strong{font-weight:700}
code{font-family:"Noto Sans Thai",monospace;background:#E6F4F6;color:var(--teal-d);border-radius:4px;padding:0 3px;font-size:9.5pt}
.cover{height:296mm;margin:-16mm -14mm 0;padding:40mm 22mm;background:linear-gradient(160deg,var(--teal) 0%,#0b9db0 55%,var(--mint) 140%);color:#fff;page-break-after:always;display:flex;flex-direction:column;justify-content:space-between}
.cover img{width:34mm;height:34mm;border-radius:8mm;background:#fff;padding:3mm}
.cover h1{font-size:32pt;line-height:1.5;margin-top:14mm}.cover .sub{font-size:15pt;line-height:1.7;margin-top:4mm}
.pill{display:inline-block;background:var(--coral);color:var(--ink);font-weight:700;border-radius:99px;padding:1mm 5mm;margin-top:8mm;font-size:10.5pt}
.cover .meta{font-size:10.5pt;line-height:1.9;border-top:1px solid rgba(255,255,255,.5);padding-top:5mm}
h2.t{font-size:19pt;color:var(--teal-d);line-height:1.6;border-bottom:3px solid var(--mint);padding-bottom:2mm;margin-bottom:5mm}
.page{page-break-after:always}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin:4mm 0 6mm}
.stat{border-radius:4mm;padding:4mm;background:var(--bg);border:1px solid #cfe3e6;text-align:center}
.stat b{display:block;font-size:22pt;line-height:1.4;color:var(--teal-d)}.stat span{font-size:9.5pt}
.sumlist li{margin-bottom:2mm}
ul{padding-left:6mm}
.legend{background:var(--bg);border-left:3px solid var(--teal);padding:2mm 4mm;margin:4mm 0;font-size:9.5pt;color:var(--teal-d)}
table{width:100%;border-collapse:collapse;margin-top:3mm;font-size:9.6pt;line-height:1.7}
th{background:var(--teal);color:#fff;text-align:left;padding:1.6mm 2.4mm;font-weight:700}
td{padding:1.8mm 2.4mm;border-bottom:1px solid #dcebed;vertical-align:top}
tr{break-inside:avoid;page-break-inside:avoid}
tbody tr:nth-child(even) td{background:#F7FBFA}
th.s,td.s{width:19mm;text-align:center}
.chip{display:inline-block;border-radius:99px;padding:0 3mm;font-weight:700;font-size:9pt;line-height:1.7;white-space:nowrap}
.c-done{background:#C9F5E6;color:#0b6b55}.c-part{background:#FFE7BD;color:#7a4b00}.c-todo{background:#E1E8EC;color:#3b4a53}
.phase{page-break-before:always}
.head{display:flex;gap:4mm;align-items:center;background:linear-gradient(90deg,var(--teal),#0b9db0);color:#fff;border-radius:4mm;padding:3.5mm 5mm;margin-bottom:3mm;break-after:avoid}
.no{flex:0 0 11mm;height:11mm;border-radius:99px;background:var(--mint);color:var(--ink);font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14pt;line-height:1}
.head h2{font-size:16pt;line-height:1.6}.head .sub{font-size:9.5pt;opacity:.95;line-height:1.5}
.lead{margin:2mm 0 1mm;font-size:10.5pt}
.p4 td:first-child{font-weight:700;width:46mm}
.note{font-size:9.3pt;color:#4a5961;margin-top:3mm}
.box{border-radius:3mm;padding:2.5mm 4mm;margin:4mm 0;break-inside:avoid}.box h3{font-size:11.5pt;line-height:1.7}.box li{margin-bottom:1mm}
.coral{background:#FFF0ED;border:1px solid #ffc7bf}.coral h3{color:#b3402f}
.sky{background:#E8F2FF;border:1px solid #b5d6ff}.sky h3{color:#0b5fc0}
</style></head><body>
<div class="cover"><div><img src="${logo}" alt=""/><h1>${esc(doc.title)}</h1><div class="sub">${esc(doc.subtitle)}</div><span class="pill">${esc(doc.badge)}</span></div>
<div class="meta">${doc.meta.map((m) => `<div>${esc(m)}</div>`).join("")}</div></div>

<div class="page"><h2 class="t">สรุปภาพรวม</h2>
<div class="stats">${doc.stats.map(([n, l]) => `<div class="stat"><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>
<ul class="sumlist">${doc.summary.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>
<div class="legend">${esc(doc.legend)}</div>
<h2 class="t" style="margin-top:7mm">แผนที่ถนน (Roadmap) และสถานะ</h2>
<table><thead><tr><th class="s">Phase</th><th>ชื่อ</th><th>ขอบเขต</th><th class="s">สถานะ</th></tr></thead><tbody>
${doc.roadmap.map(([n, name, scope, s]) => `<tr><td class="s"><strong>${n}</strong></td><td><strong>${esc(name)}</strong></td><td>${esc(scope)}</td><td class="s">${chip(s)}</td></tr>`).join("")}
</tbody></table></div>

${doc.phases.map((p, i) => phaseHtml(p, i)).join("")}

<section class="phase"><header class="head"><div class="no">4</div><div><h2>Phase 4 — Scale (ยังไม่ได้ทำ)</h2>
<div class="sub">ยังไม่ทำ ${doc.phase4.length} รายการ</div></div></header>
${doc.phase4Intro.map((p) => `<p class="lead">${inline(p)}</p>`).join("")}
<table class="p4"><thead><tr><th>รายการ</th><th>คืออะไร</th><th>สิ่งที่ต้องเตรียมก่อนทำ</th></tr></thead><tbody>
${doc.phase4.map(([a, b, c]) => `<tr><td>${inline(a)}</td><td>${inline(b)}</td><td>${inline(c)}</td></tr>`).join("")}
</tbody></table>
<p class="note">หมายเหตุ: รายการ Phase 4 และตัวเลือกอุปกรณ์มาจากหัวข้อ 6, 9.3, 11 และ 13 (D5, D6, D10) ของแผนหลัก ส่วนคอลัมน์ "สิ่งที่ต้องเตรียมก่อนทำ" เป็นข้อเสนอเบื้องต้นของ Claude เพื่อประกอบการพิจารณา ยังไม่ใช่ข้อตกลงในแผน</p>
</section>

<section class="phase"><h2 class="t">ข้อจำกัดและงานที่เจ้าของต้องทำก่อนเปิดใช้จริง</h2>
<div class="box coral"><h3>ข้อจำกัดที่ต้องรู้</h3>${list(doc.limits)}</div>
<div class="box sky"><h3>งานเตรียม soft launch (ส่วนใหญ่เป็นของเจ้าของโครงการ)</h3>${list(doc.owner)}</div>
</section>
</body></html>`;

const htmlPath = join(HERE, "status.html");
writeFileSync(htmlPath, html);
const browser = await chromium.launch({
  executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
});
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.evaluate(() => document.fonts.ready);
const pdf = join(HERE, doc.file);
await page.pdf({
  path: pdf,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  outline: true,
  tagged: true,
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  headerTemplate: "<span></span>",
  // Needs Noto Sans Thai installed on the machine (see docs/manual/README.md)
  footerTemplate: `<div style="width:100%;font-size:8pt;line-height:1.8;color:#07707F;padding:0 14mm;display:flex;justify-content:space-between;font-family:'Noto Sans Thai',sans-serif"><span>${esc(doc.footer)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log("wrote", pdf);
