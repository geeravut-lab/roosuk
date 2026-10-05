// Renders content.mjs to a Thai PDF in the app's brand colours (Chromium + Noto Sans Thai).
// Run from the repo root:  NODE_USE_ENV_PROXY=1 node docs/research/build.mjs
// (Noto Sans Thai must be installed for the page footer: see docs/manual/README.md)
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
const font = (w, f) =>
  `@font-face{font-family:"Noto Sans Thai";font-weight:${w};src:url("${pathToFileURL(join(ROOT, "src/assets/fonts", f)).href}")}`;
const logo = pathToFileURL(join(ROOT, "docs", "RooSuk Logo.png")).href;
const dot = (k) =>
  k === "u" ? `<span class="q">?</span>` : `<span class="dot ${k}"></span>`;
const cell = (k) => `<td class="sym">${dot(k)}</td>`;
const list = (items) =>
  `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;

const matrix = (
  rows,
  withRoo = true,
) => `<table class="mx"><colgroup><col style="width:27mm"><col style="width:14mm">${doc.cols.map(() => '<col style="width:9.4mm">').join("")}<col></colgroup>
<thead><tr><th>ผลิตภัณฑ์</th><th>ประเทศ</th>${doc.cols.map((c) => `<th class="sym">${esc(c)}</th>`).join("")}<th>จุดเด่น / ข้อสังเกต</th></tr></thead><tbody>
${withRoo ? `<tr class="roo"><td><strong>${esc(doc.rooSuk.name)}</strong></td><td>ไทย</td>${doc.rooSuk.v.map(cell).join("")}<td>${inline(doc.rooSuk.note)}</td></tr>` : ""}
${rows.map(([n, c, v, note]) => `<tr><td><strong>${esc(n)}</strong></td><td>${esc(c)}</td>${v.map(cell).join("")}<td>${inline(note)}</td></tr>`).join("")}
</tbody></table>`;

const simple = (head, rows, cls = "") =>
  `<table class="t ${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td>${i === 0 ? `<strong>${inline(c)}</strong>` : inline(c)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;

const verdictChip = (v) => {
  const k = v.startsWith("ได้เปรียบ")
    ? "good"
    : v.startsWith("เสียเปรียบ")
      ? "bad"
      : "mid";
  return `<span class="chip ${k}">${esc(v)}</span>`;
};

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
${font(400, "NotoSansThai-Regular.ttf")}${font(700, "NotoSansThai-Bold.ttf")}
:root{--teal:#0A8FA3;--teal-d:#07707F;--mint:#2DD4A7;--coral:#FF7A6B;--bg:#F7FBFA;--ink:#1F2A30}
@page{size:A4;margin:16mm 14mm 18mm}
*{box-sizing:border-box}
html{font-family:"Noto Sans Thai",sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}h1,h2,h3,p,ul{margin:0}strong{font-weight:700}
code{font-family:"Noto Sans Thai",monospace;background:#E6F4F6;color:var(--teal-d);border-radius:4px;padding:0 3px;font-size:9.5pt}
.cover{height:296mm;margin:-16mm -14mm 0;padding:40mm 22mm;background:linear-gradient(160deg,var(--teal) 0%,#0b9db0 55%,var(--mint) 140%);color:#fff;page-break-after:always;display:flex;flex-direction:column;justify-content:space-between}
.cover img{width:34mm;height:34mm;border-radius:8mm;background:#fff;padding:3mm}
.cover h1{font-size:30pt;line-height:1.5;margin-top:14mm}.cover .sub{font-size:14.5pt;line-height:1.7;margin-top:4mm}
.pill{display:inline-block;background:var(--coral);color:var(--ink);font-weight:700;border-radius:99px;padding:1mm 5mm;margin-top:8mm;font-size:10.5pt}
.cover .meta{font-size:10pt;line-height:1.9;border-top:1px solid rgba(255,255,255,.5);padding-top:5mm}
h2.t{font-size:18pt;color:var(--teal-d);line-height:1.6;border-bottom:3px solid var(--mint);padding-bottom:2mm;margin-bottom:4mm}
h3.s{font-size:12.5pt;color:var(--teal-d);margin:5mm 0 1mm;line-height:1.7}
.sec{page-break-before:always}
ul{padding-left:6mm}li{margin-bottom:2mm}
.legend{background:var(--bg);border-left:3px solid var(--teal);padding:2mm 4mm;margin:3mm 0;font-size:9.3pt;color:var(--teal-d)}
table{width:100%;border-collapse:collapse;margin-top:2mm}
th{background:var(--teal);color:#fff;text-align:left;padding:1.4mm 2mm;font-weight:700;font-size:8.6pt;line-height:1.5}
td{padding:1.4mm 2mm;border-bottom:1px solid #dcebed;vertical-align:top;font-size:8.6pt;line-height:1.65}
tr{break-inside:avoid;page-break-inside:avoid}
tbody tr:nth-child(even) td{background:#F7FBFA}
.mx{table-layout:fixed}.mx td.sym,.mx th.sym{text-align:center;padding:1.4mm 0;font-size:7.4pt;line-height:1.4}
.mx td.sym{line-height:1.2;vertical-align:middle}
.dot{display:inline-block;width:3.2mm;height:3.2mm;border-radius:50%;border:1.2px solid #0b9b6f;vertical-align:middle}.dot.y{background:#0b9b6f}.dot.p{background:linear-gradient(90deg,#f2a93b 50%,#fff 50%);border-color:#c98200}.dot.n{border-color:#aab6bb;background:#fff}.q{color:#8a6bd1;font-weight:700;font-size:10pt}.lg .dot{margin:0 1mm 0 2mm}
tr.roo td{background:#DDF7EE!important;border-bottom:2px solid var(--mint)}
.t td{font-size:9pt}.t th{font-size:9pt}
.chip{display:inline-block;border-radius:99px;padding:0 2.5mm;font-weight:700;font-size:8.5pt;line-height:1.7}
.chip.good{background:#C9F5E6;color:#0b6b55}.chip.mid{background:#FFE7BD;color:#7a4b00}.chip.bad{background:#FFD9D3;color:#a3301f}
.box{border-radius:3mm;padding:2.5mm 4mm;margin:4mm 0}
.coral{background:#FFF0ED;border:1px solid #ffc7bf}.sky{background:#E8F2FF;border:1px solid #b5d6ff}
.verd li{font-size:10.3pt}
</style></head><body>
<div class="cover"><div><img src="${logo}" alt=""/><h1>${esc(doc.title)}</h1><div class="sub">${esc(doc.subtitle)}</div><span class="pill">${esc(doc.badge)}</span></div>
<div class="meta">${doc.meta.map((m) => `<div>${esc(m)}</div>`).join("")}</div></div>

<div><h2 class="t">สรุปสำหรับผู้บริหาร</h2><ul class="verd">${doc.verdict.map((v) => `<li>${inline(v)}</li>`).join("")}</ul>
<h3 class="s">วิธีค้นหาและข้อจำกัดของข้อมูล</h3>${list(doc.method)}</div>

<div class="sec"><h2 class="t">1. ทั่วโลก (นอกเอเชีย)</h2>
<div class="legend lg">${dot("y")} มี ${dot("p")} บางส่วน ${dot("n")} ไม่พบในแหล่งที่ตรวจ <span class="q" style="margin-left:2mm">?</span> ยังไม่ยืนยัน — คอลัมน์: อาหาร=สแกนอาหารรูป/บาร์โค้ด · ผลตรวจ=อ่านผลเลือด · แชต AI=ถามจากข้อมูลตัวเอง · อุปกรณ์=ข้อมูลอุปกรณ์สวมใส่ · เอกสาร=ตู้เอกสาร/เวชระเบียน · แชร์หมอ=แชร์/สรุปให้แพทย์ · คะแนน=คะแนนรายวัน/สตรีค/แต้มรางวัล · ร้านค้า=อาหารเสริม/สินค้า</div>
${matrix(doc.global)}</div>

<div class="sec"><h2 class="t">2. เอเชีย (ไม่รวมไทย)</h2>${matrix(doc.asia)}</div>

<div class="sec"><h2 class="t">3. ประเทศไทย</h2>${matrix(doc.thai)}</div>

<div class="sec"><h2 class="t">4. เทียบรายฟีเจอร์: ใครทำอะไรอยู่ และ RooSuk อยู่ตรงไหน</h2>
<table class="t"><thead><tr><th style="width:44mm">ฟีเจอร์</th><th>คู่เทียบที่พบ</th><th style="width:28mm">ตำแหน่ง RooSuk</th></tr></thead><tbody>
${doc.heat.map(([f, c, v]) => `<tr><td><strong>${esc(f)}</strong></td><td>${inline(c)}</td><td>${verdictChip(v)}</td></tr>`).join("")}</tbody></table></div>

<div class="sec"><h2 class="t">5. เปรียบเทียบราคา</h2>${simple(["ผู้ให้บริการ", "ราคาที่พบ", "ที่มา"], doc.prices)}
<div class="box coral"><strong>หมายเหตุ:</strong> ราคาส่วนใหญ่มาจากผลการค้นหาและเว็บบุคคลที่สาม ไม่ใช่หน้าทางการ และแอปหลายตัวทดลองเปลี่ยนราคาตลอด ใช้เป็นภาพรวม ไม่ใช่ราคาอ้างอิงทางการค้า · เมื่อประมาณเทียบ Gold 49 ฿ ≈ US$1.4 ตามแผนหลัก</div>
<h2 class="t" style="margin-top:6mm">6. ภัยคุกคามที่ควรจับตา</h2>${simple(["เหตุการณ์", "ระดับ", "เหตุผล", "แนวทางตอบ"], doc.threats)}</div>

<div class="sec"><h2 class="t">7. ข้อเสนอเชิงกลยุทธ์ (ความเห็นของ Claude)</h2>${list(doc.recs)}</div>

<div class="sec"><h2 class="t">8. ข้อมูลตลาดและกฎระเบียบ</h2>${simple(["ประเด็น", "ข้อมูล"], doc.market)}
<h3 class="s">ข้อมูลที่ยังไม่ยืนยันหรือยังไม่ครอบคลุม</h3>${list(doc.unverified)}
<div class="box sky"><strong>แหล่งอ้างอิง:</strong> รายการลิงก์ทั้งหมด (ประมาณ 100+ ลิงก์ต่อกลุ่ม) อยู่ในไฟล์ดิบ <code>docs/research/raw/global.md</code> · <code>asia.md</code> · <code>thailand.md</code> พร้อมหมายเหตุว่าข้อไหนยังไม่ยืนยัน</div></div>
</body></html>`;

const htmlPath = join(HERE, "report.html");
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
  footerTemplate: `<div style="width:100%;font-size:8pt;line-height:1.8;color:#07707F;padding:0 14mm;display:flex;justify-content:space-between;font-family:'Noto Sans Thai',sans-serif"><span>${esc(doc.footer)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log("wrote", pdf);
