// Illustrative sample files for the manuals (a meal photo, a lab report, body photos, a PDF, product
// pictures). They are drawn with HTML so the repo carries no binary photos; every one is plainly a sample.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");
const font = (w, f) =>
  `@font-face{font-family:"NST";font-weight:${w};src:url("${pathToFileURL(join(ROOT, "src/assets/fonts", f)).href}")}`;
const FONTS =
  font(400, "NotoSansThai-Regular.ttf") + font(700, "NotoSansThai-Bold.ttf");
const base = `<style>${FONTS}*{box-sizing:border-box}body{margin:0;font-family:"NST",sans-serif}</style>`;

const FOOD = `${base}<body style="width:900px;height:675px;background:linear-gradient(135deg,#d9c7a8,#b89b72)">
<div style="position:absolute;left:150px;top:60px;width:560px;height:560px;border-radius:50%;background:#fbfaf6;box-shadow:0 18px 40px rgba(0,0,0,.35)"></div>
<div style="position:absolute;left:190px;top:100px;width:480px;height:480px;border-radius:50%;background:#efe9dc"></div>
<div style="position:absolute;left:250px;top:190px;width:360px;height:260px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#f2b84b,#d98a1f);"></div>
<div style="position:absolute;left:300px;top:230px;width:260px;height:30px;border-radius:15px;background:#f7d37b;transform:rotate(-12deg)"></div>
<div style="position:absolute;left:290px;top:290px;width:280px;height:30px;border-radius:15px;background:#f1c15e;transform:rotate(8deg)"></div>
<div style="position:absolute;left:330px;top:345px;width:240px;height:30px;border-radius:15px;background:#e8a93c;transform:rotate(-5deg)"></div>
<div style="position:absolute;left:520px;top:200px;width:110px;height:70px;border-radius:50%;background:#ee8466;transform:rotate(25deg)"></div>
<div style="position:absolute;left:250px;top:215px;width:90px;height:60px;border-radius:50%;background:#ee8466;transform:rotate(-30deg)"></div>
<div style="position:absolute;left:410px;top:400px;width:120px;height:70px;border-radius:80px 80px 0 0;background:#8fc16a"></div>
<div style="position:absolute;left:560px;top:380px;width:90px;height:90px;border-radius:50%;background:#bfe06a;border:8px solid #8fb43c"></div>
<div style="position:absolute;left:300px;top:395px;width:70px;height:40px;border-radius:50%;background:#fff3c4"></div></body>`;

const row = (a, b, c, d, flag) =>
  `<tr style="border-bottom:1px solid #cfd8dc"><td style="padding:10px 12px">${a}</td><td style="padding:10px 12px;text-align:right;font-weight:700;${flag ? "color:#b3402f" : ""}">${b}</td><td style="padding:10px 12px">${c}</td><td style="padding:10px 12px;color:#4a5961">${d}</td></tr>`;
const LAB = `${base}<body style="width:820px;height:760px;background:#fff;padding:48px">
<div style="display:flex;justify-content:space-between;border-bottom:3px solid #0A8FA3;padding-bottom:14px"><div><div style="font-size:30px;font-weight:700;color:#07707F">ผลตรวจเลือด (ตัวอย่าง)</div><div style="color:#4a5961;font-size:18px">โรงพยาบาลตัวอย่าง · ห้องปฏิบัติการ</div></div><div style="font-size:18px;text-align:right">วันที่เก็บตัวอย่าง<br><b>1 ก.ย. 2569</b></div></div>
<div style="margin:18px 0;font-size:18px">ชื่อผู้ตรวจ: <b>ผู้ใช้ตัวอย่าง</b> · เพศหญิง · อายุ 38 ปี</div>
<table style="width:100%;border-collapse:collapse;font-size:20px"><tr style="background:#E3F8F1"><th style="padding:10px 12px;text-align:left">รายการ</th><th style="padding:10px 12px;text-align:right">ผล</th><th style="padding:10px 12px;text-align:left">หน่วย</th><th style="padding:10px 12px;text-align:left">ค่าอ้างอิง</th></tr>
${row("Fasting Glucose (FBS)", "104", "mg/dL", "70-99")}
${row("HbA1c", "5.3", "%", "4.0-5.6")}
${row("Total Cholesterol", "212", "mg/dL", "&lt; 200")}
${row("LDL-C", "148", "mg/dL", "&lt; 130", true)}
${row("HDL-C", "58", "mg/dL", "&gt; 50")}
${row("Triglycerides", "126", "mg/dL", "&lt; 150")}
${row("Creatinine", "0.82", "mg/dL", "0.5-1.1")}
${row("ALT (SGPT)", "24", "U/L", "7-35")}
</table><div style="margin-top:28px;color:#4a5961;font-size:16px">เอกสารตัวอย่างเพื่อใช้ประกอบคู่มือ ไม่ใช่ผลตรวจจริงของใคร</div></body>`;

const person = (extra) =>
  `${base}<body style="width:600px;height:800px;background:linear-gradient(#e9f3f5,#cfe3e8);position:relative">${extra}<div style="position:absolute;bottom:18px;width:100%;text-align:center;color:#4a5961;font-size:20px">ภาพประกอบ (ไม่ใช่รูปจริง)</div></body>`;
const BODY =
  person(`<div style="position:absolute;left:245px;top:70px;width:110px;height:110px;border-radius:50%;background:#e0b99a"></div>
<div style="position:absolute;left:190px;top:190px;width:220px;height:300px;border-radius:70px 70px 30px 30px;background:#0A8FA3"></div>
<div style="position:absolute;left:215px;top:480px;width:75px;height:230px;border-radius:30px;background:#37474f"></div>
<div style="position:absolute;left:310px;top:480px;width:75px;height:230px;border-radius:30px;background:#37474f"></div>
<div style="position:absolute;left:140px;top:200px;width:50px;height:260px;border-radius:25px;background:#0A8FA3"></div>
<div style="position:absolute;left:410px;top:200px;width:50px;height:260px;border-radius:25px;background:#0A8FA3"></div>`);
const FACE =
  person(`<div style="position:absolute;left:150px;top:150px;width:300px;height:380px;border-radius:50%;background:#e0b99a"></div>
<div style="position:absolute;left:215px;top:290px;width:40px;height:20px;border-radius:50%;background:#37474f"></div>
<div style="position:absolute;left:345px;top:290px;width:40px;height:20px;border-radius:50%;background:#37474f"></div>
<div style="position:absolute;left:250px;top:420px;width:100px;height:30px;border-radius:0 0 50px 50px;border-bottom:8px solid #b3402f"></div>`);
const PALM =
  person(`<div style="position:absolute;left:170px;top:300px;width:260px;height:300px;border-radius:60px;background:#e0b99a"></div>
${[0, 1, 2, 3].map((i) => `<div style="position:absolute;left:${180 + i * 62}px;top:${130 + (i === 1 || i === 2 ? -30 : 0)}px;width:48px;height:${190 + (i === 1 || i === 2 ? 30 : 0)}px;border-radius:24px;background:#e0b99a"></div>`).join("")}
<div style="position:absolute;left:96px;top:380px;width:48px;height:150px;border-radius:24px;background:#e0b99a;transform:rotate(-35deg)"></div>`);

const DOC = `${base}<body style="padding:30px 36px;font-size:15px;line-height:1.8"><h1 style="color:#07707F;font-size:26px;margin:0 0 8px">สรุปผลตรวจสุขภาพประจำปี (ตัวอย่าง)</h1>
<p>เอกสารตัวอย่างสำหรับคู่มือ — ผู้ตรวจ: ผู้ใช้ตัวอย่าง · วันที่ตรวจ 1 กันยายน 2569</p>
<ul><li>ความดันโลหิต 118/76 มม.ปรอท</li><li>น้ำตาลในเลือดหลังอดอาหาร 104 มก./ดล. (ควรติดตาม)</li><li>แพทย์แนะนำ: ออกกำลังกายสม่ำเสมอ และตรวจซ้ำใน 6 เดือน</li></ul></body>`;

const product = (
  c1,
  c2,
  label,
) => `${base}<body style="width:800px;height:800px;background:#F7FBFA;position:relative">
<div style="position:absolute;left:270px;top:110px;width:260px;height:110px;border-radius:30px 30px 0 0;background:#37474f"></div>
<div style="position:absolute;left:230px;top:200px;width:340px;height:500px;border-radius:50px;background:linear-gradient(90deg,${c1},${c2});box-shadow:0 20px 40px rgba(0,0,0,.2)"></div>
<div style="position:absolute;left:260px;top:330px;width:280px;height:200px;border-radius:24px;background:#fff;text-align:center;padding-top:44px;font-size:34px;font-weight:700;color:#07707F;line-height:1.5">${label}<div style="font-size:20px;color:#4a5961;font-weight:400">ภาพประกอบตัวอย่าง</div></div></body>`;

export const FILES = {
  "food.jpg": { html: FOOD, w: 900, h: 675, type: "jpeg" },
  "lab.png": { html: LAB, w: 820, h: 760, type: "png" },
  "body.png": { html: BODY, w: 600, h: 800, type: "png" },
  "face.png": { html: FACE, w: 600, h: 800, type: "png" },
  "palm.png": { html: PALM, w: 600, h: 800, type: "png" },
  "product-1.png": {
    html: product("#0A8FA3", "#2DD4A7", "แมกนีเซียม"),
    w: 800,
    h: 800,
    type: "png",
  },
  "product-2.png": {
    html: product("#FF7A6B", "#ffb199", "วิตามินดี"),
    w: 800,
    h: 800,
    type: "png",
  },
  "product-3.png": {
    html: product("#1E90FF", "#7fbcff", "โอเมก้า 3"),
    w: 800,
    h: 800,
    type: "png",
  },
};

/** Draws every sample file into `dir` (once per run) and returns their absolute paths by name. */
export async function makeFixtures(browser, dir) {
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  const out = {};
  for (const [name, f] of Object.entries(FILES)) {
    const html = join(dir, `${name}.html`);
    writeFileSync(html, f.html);
    await page.setViewportSize({ width: f.w, height: f.h });
    await page.goto(pathToFileURL(html).href);
    await page.evaluate(() => document.fonts.ready);
    out[name] = join(dir, name);
    await page.screenshot({
      path: out[name],
      type: f.type,
      ...(f.type === "jpeg" ? { quality: 88 } : {}),
    });
  }
  const docHtml = join(dir, "doc.html");
  writeFileSync(docHtml, DOC);
  await page.goto(pathToFileURL(docHtml).href);
  await page.evaluate(() => document.fonts.ready);
  out["doc.pdf"] = join(dir, "doc.pdf");
  await page.pdf({ path: out["doc.pdf"], format: "A5" });
  await page.close();
  return out;
}
