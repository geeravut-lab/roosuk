// Renders a manual (docs/manual/content/<name>.mjs) to a Thai PDF in the app's colours.
// Chromium does the layout, so Thai vowels and tone marks are shaped correctly;
// Noto Sans Thai (the app's own font) is embedded from src/assets/fonts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANUAL = resolve(HERE, "..");
const ROOT = resolve(MANUAL, "..", "..");
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Light inline markup in the content files: **bold** and `code`. */
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
const shotUrl = (rel) => pathToFileURL(join(MANUAL, "shots", rel)).href;

const list = (items) =>
  items?.length
    ? `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`
    : "";

function stepHtml(step, n) {
  const shots = (step.shots ?? (step.shot ? [step.shot] : [])).filter(Boolean);
  const imgs = shots
    .map((s) => {
      if (!existsSync(join(MANUAL, "shots", s)))
        throw new Error(`missing screenshot ${s}`);
      return `<figure><img src="${shotUrl(s)}" alt=""/></figure>`;
    })
    .join("");
  return `<div class="step">
    <div class="step-text"><span class="badge">${n}</span>
      <div>${step.title ? `<h4>${inline(step.title)}</h4>` : ""}<p>${inline(step.text)}</p>
      ${step.note ? `<p class="note">${inline(step.note)}</p>` : ""}</div></div>
    ${imgs ? `<div class="step-shots shots-${shots.length}">${imgs}</div>` : ""}
  </div>`;
}

function sectionHtml(s, index) {
  const rel = s.relations?.length
    ? `<div class="box sky"><h4>เกี่ยวข้องกับเมนูอื่นอย่างไร</h4><ul>${s.relations
        .map(
          (r) => `<li><strong>${esc(r.menu)}</strong> — ${inline(r.text)}</li>`,
        )
        .join("")}</ul></div>`
    : "";
  return `<section class="menu" id="${esc(s.id)}">
    <header class="menu-head">
      <div class="menu-no">${index}</div>
      <div><h2>${esc(s.title)}</h2>${s.path ? `<div class="path">${esc(s.path)}</div>` : ""}</div>
    </header>
    <p class="lead">${inline(s.summary)}</p>
    ${s.access ? `<p class="access">${inline(s.access)}</p>` : ""}
    <div class="steps">${(s.steps ?? []).map((st, i) => stepHtml(st, i + 1)).join("")}</div>
    ${s.results?.length ? `<div class="box mint"><h4>ผลลัพธ์ที่ได้</h4>${list(s.results)}</div>` : ""}
    ${rel}
    ${s.tips?.length ? `<div class="box coral"><h4>ข้อควรรู้</h4>${list(s.tips)}</div>` : ""}
  </section>`;
}

function html(doc) {
  const font = (w, f) =>
    `@font-face{font-family:"Noto Sans Thai";font-weight:${w};src:url("${pathToFileURL(join(ROOT, "src/assets/fonts", f)).href}")}`;
  const logo = pathToFileURL(join(ROOT, "docs", "RooSuk Logo.png")).href;
  const groups = [];
  doc.sections.forEach((s, i) => {
    const g = s.group ?? "";
    let grp = groups.find((x) => x.name === g);
    if (!grp) groups.push((grp = { name: g, items: [] }));
    grp.items.push({ s, no: i + 1 });
  });
  const toc = groups
    .map(
      (g) =>
        `${g.name ? `<h3>${esc(g.name)}</h3>` : ""}<ol class="toc">${g.items
          .map(
            ({ s, no }) =>
              `<li><a href="#${esc(s.id)}"><span class="n">${no}</span>${esc(s.title)}${s.path ? `<small>${esc(s.path)}</small>` : ""}</a></li>`,
          )
          .join("")}</ol>`,
    )
    .join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
${font(400, "NotoSansThai-Regular.ttf")}${font(700, "NotoSansThai-Bold.ttf")}
:root{--teal:#0A8FA3;--teal-d:#07707F;--mint:#2DD4A7;--sky:#1E90FF;--coral:#FF7A6B;--bg:#F7FBFA;--ink:#1F2A30}
@page{size:A4;margin:16mm 14mm 18mm}
*{box-sizing:border-box}
html{font-family:"Noto Sans Thai",sans-serif;color:var(--ink);font-size:11pt;line-height:1.85;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff}
h1,h2,h3,h4,p,ul,ol{margin:0}
strong{font-weight:700}code{font-family:"Noto Sans Thai",monospace;background:#E6F4F6;color:var(--teal-d);border-radius:4px;padding:0 4px}
.cover{height:296mm;margin:-16mm -14mm 0;padding:40mm 22mm;background:linear-gradient(160deg,var(--teal) 0%,#0b9db0 55%,var(--mint) 140%);color:#fff;page-break-after:always;display:flex;flex-direction:column;justify-content:space-between}
.cover img{width:34mm;height:34mm;border-radius:8mm;background:#fff;padding:3mm}
.cover h1{font-size:34pt;line-height:1.5;font-weight:700;margin-top:14mm}
.cover .sub{font-size:15pt;line-height:1.7;opacity:.95;margin-top:4mm}
.cover .meta{font-size:10.5pt;line-height:1.8;opacity:.92;border-top:1px solid rgba(255,255,255,.5);padding-top:5mm}
.pill{display:inline-block;background:var(--coral);color:var(--ink);font-weight:700;border-radius:99px;padding:1mm 5mm;margin-top:8mm;font-size:11pt}
.intro,.tocpage{page-break-after:always}
.intro h2,.tocpage h2{font-size:20pt;color:var(--teal-d);line-height:1.6;border-bottom:3px solid var(--mint);padding-bottom:2mm;margin-bottom:5mm}
.intro p{margin-bottom:3mm}.intro ul{padding-left:6mm;margin-bottom:3mm}
.toc{list-style:none;padding:0;margin-bottom:3mm}.toc li{border-bottom:1px dashed #cfe3e6}
.toc a{display:flex;gap:3mm;align-items:baseline;text-decoration:none;color:var(--ink);padding:.6mm 0}
.toc .n{flex:0 0 7mm;color:#fff;background:var(--teal);border-radius:99px;text-align:center;font-size:9pt;line-height:1.7;font-weight:700}
.toc small{margin-left:auto;color:var(--teal-d);font-size:9pt}
.tocpage h3{color:var(--teal-d);font-size:12.5pt;line-height:1.7;margin:4mm 0 1mm}
.menu{page-break-before:always}
.menu-head{display:flex;gap:4mm;align-items:center;background:linear-gradient(90deg,var(--teal),#0b9db0);color:#fff;border-radius:4mm;padding:3.5mm 5mm;margin-bottom:4mm;break-after:avoid}
.menu-no{flex:0 0 11mm;height:11mm;border-radius:99px;background:var(--mint);color:var(--ink);font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14pt;line-height:1}
.menu-head h2{font-size:18pt;line-height:1.55;font-weight:700}.path{font-size:9.5pt;opacity:.92;line-height:1.5}
.lead{font-size:11.5pt;margin-bottom:2.5mm}
.access{background:var(--bg);border-left:3px solid var(--teal);padding:1.5mm 3.5mm;margin-bottom:3mm;font-size:10pt;color:var(--teal-d)}
.steps{margin:3mm 0}
.step{display:flex;gap:5mm;align-items:flex-start;padding:3mm 0;border-top:1px solid #dcebed;break-inside:avoid;page-break-inside:avoid}
.step-text{flex:1;display:flex;gap:3mm}
.badge{flex:0 0 7.5mm;height:7.5mm;border-radius:99px;background:var(--coral);color:var(--ink);font-weight:700;display:flex;align-items:center;justify-content:center;font-size:10.5pt;line-height:1;margin-top:1.2mm}
.step h4{font-size:11.5pt;color:var(--teal-d);line-height:1.7}
.step p{font-size:10.5pt;line-height:1.8}.step .note{margin-top:1.5mm;font-size:9.5pt;color:#4a5961}
.step-shots{flex:0 0 auto;display:flex;gap:3mm}
figure{margin:0}
.step-shots img{display:block;width:47mm;border:1px solid #bcd7db;border-radius:4mm;box-shadow:0 1.5mm 4mm rgba(10,143,163,.18)}
.step-shots.shots-2 img{width:43mm}
.box{border-radius:3mm;padding:2.5mm 4mm;margin:3mm 0;break-inside:avoid;page-break-inside:avoid}
.box h4{font-size:11pt;line-height:1.7;margin-bottom:1mm}.box ul{padding-left:5mm}.box li{margin-bottom:.8mm;font-size:10.3pt;line-height:1.8}
.mint{background:#E3F8F1;border:1px solid #9be8d2}.mint h4{color:#0b6b55}
.sky{background:#E8F2FF;border:1px solid #b5d6ff}.sky h4{color:#0b5fc0}
.coral{background:#FFF0ED;border:1px solid #ffc7bf}.coral h4{color:#b3402f}
</style></head><body>
<div class="cover"><div><img src="${logo}" alt=""/><h1>${esc(doc.title)}</h1><div class="sub">${esc(doc.subtitle ?? "")}</div>${doc.badge ? `<span class="pill">${esc(doc.badge)}</span>` : ""}</div>
<div class="meta">${doc.meta?.map((m) => `<div>${esc(m)}</div>`).join("") ?? ""}</div></div>
<div class="intro"><h2>${esc(doc.introTitle ?? "ก่อนเริ่มใช้งาน")}</h2>${(doc.intro ?? []).map((p) => (Array.isArray(p) ? list(p) : `<p>${inline(p)}</p>`)).join("")}</div>
<div class="tocpage"><h2>สารบัญ</h2>${toc}</div>
${doc.sections.map((s, i) => sectionHtml(s, i + 1)).join("")}
${doc.closing ? `<section class="menu"><header class="menu-head"><div><h2>${esc(doc.closing.title)}</h2></div></header>${(doc.closing.body ?? []).map((p) => (Array.isArray(p) ? list(p) : `<p>${inline(p)}</p>`)).join("")}</section>` : ""}
</body></html>`;
}

const name = process.argv[2];
if (!name) throw new Error("usage: node build-pdf.mjs <user|admin>");
const doc = (
  await import(pathToFileURL(join(MANUAL, "content", `${name}.mjs`)).href)
).default;
const outDir = join(MANUAL, "out");
mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, `${name}.html`);
writeFileSync(htmlPath, html(doc));
const browser = await chromium.launch({
  executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
});
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.evaluate(() => document.fonts.ready);
const pdf = join(outDir, doc.file);
await page.pdf({
  path: pdf,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  outline: true,
  tagged: true,
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-size:8pt;color:#07707F;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>${esc(doc.footer ?? "")}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log("wrote", pdf);
