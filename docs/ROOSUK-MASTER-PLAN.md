# RooSuk (รู้สุข) — Master Plan

> เอกสารอ้างอิงหลักสำหรับการสร้างระบบ RooSuk จนเสร็จสมบูรณ์
> รวมข้อกำหนดทั้งหมดจากเจ้าของโครงการ + แผนการสร้าง + การตัดสินใจที่ตกลงแล้ว
>
> **สถานะ:** v0.2 — เจ้าของโครงการตัดสินใจ D1–D13 แล้ว (หัวข้อ 13) · พร้อมเริ่ม Phase 0 · คู่มือตั้งค่า Supabase/Netlify: [`SETUP-GUIDE.md`](SETUP-GUIDE.md)
> **อัปเดตล่าสุด:** 2026-10-03
>
> สัญลักษณ์: ✅ ตกลงแล้ว · 🟡 ข้อเสนอ รอตัดสินใจ · ⛔ ห้ามทำ

---

## 1. ข้อมูลโครงการ

| หัวข้อ              | ค่า                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| ชื่อระบบ            | ✅ **RooSuk (รู้สุข)**                                                                             |
| Positioning         | ✅ "AI ที่รู้จักสุขภาพของคุณ" — AI Personal Health OS (ไม่ใช่แค่ระบบจองตรวจ + รับผล)               |
| Repository          | ✅ https://github.com/geeravut-lab/roosuk                                                          |
| Deploy              | ✅ **Netlify**                                                                                     |
| Auth + DB + Storage | ✅ **Supabase**                                                                                    |
| Framework           | ✅ Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 (ตั้งไว้แล้วใน repo)           |
| Logo                | ✅ `docs/RooSuk Logo.jpg` (หัวใจไล่สีทีล→มิ้นต์ เส้นชีพจร รอยยิ้มโคราล จุดสีฟ้า + ตัวอักษร RooSuk) |
| กลุ่มเป้าหมาย       | ผู้ใช้ทั่วไปในไทย (B2C) → ต่อยอด Family / Corporate (B2B2C)                                        |

---

## 2. กฎการทำงานของโครงการ (ต้องปฏิบัติทุกครั้ง)

### 2.1 การทดสอบและการ deploy ✅ (คำสั่งเจ้าของโครงการ ข้อ 5)

1. **ทดสอบบน test environment ของ Claude เสมอ** ได้แก่ `npm run check`, `npm run build`,
   เปิด `next start` ในเครื่อง, Playwright ที่ viewport มือถือ 390×844 และ Supabase โปรเจกต์ของ RooSuk (ใช้ร่วม dev/test/production — ดูข้อ 6)
2. **ไม่ใช้ Netlify production เป็นที่ทดสอบ** เพื่อประหยัด credits — ถ้าต้องตรวจบน production จริง Claude จะแจ้งให้เจ้าของทดสอบเอง
3. **กฎ sync (เจ้าของสั่ง 2026-10-03):** ทุกครั้งที่ปรับงานเสร็จ Claude จะ commit → push branch ทำงาน → fast-forward `main` → push `main`
   (ไม่ force-push `main`) และเพราะ `main` ผูก auto-deploy (Build status = Active) การ sync เข้า `main` คือการ deploy production
   จึง sync เฉพาะงานที่ผ่าน `npm run check` · `netlify.toml` ข้าม build เมื่อแก้เฉพาะเอกสาร/ชุดทดสอบ/SQL/สคริปต์
4. ด่านกันเว็บพัง: build production บน Netlify จะล้มทันที (deploy เดิมยังออนไลน์) ถ้าไม่มีตัวแปร environment ที่จำเป็น — ดู `SETUP-GUIDE.md` B5
5. การทดสอบที่เรียก AI จริงมีค่าใช้จ่าย → unit test ใช้ mock/fixture เป็นค่าเริ่มต้น
   เรียก API จริงเฉพาะชุดทดสอบเล็ก ๆ ที่จำเป็น และไม่เรียกใน CI
6. Supabase ใช้ **โปรเจกต์เดียว** ร่วมกันทั้ง dev/test/production (D11) → ข้อมูลที่มีตอนนี้เป็นข้อมูลทดสอบเท่านั้น
   **ห้ามให้ผู้ใช้จริงสมัครก่อนทำ checklist ล้างข้อมูลและหมุนคีย์** (`SETUP-GUIDE.md` ส่วน C)

✅ มาตรการกัน credit รั่ว (D11):

- เจ้าของปิด **Branch deploys** และ **Deploy Previews** ใน Netlify (ขั้นตอนใน `SETUP-GUIDE.md` ส่วน B) — งานของ Claude อยู่บน branch `claude/*`
- มี `netlify.toml` ใน repo: build เฉพาะ `main` และข้าม build ที่ไม่แตะโค้ดแอป เป็นด่านสำรองอีกชั้น

### 2.2 กฎด้าน Git และคุณภาพโค้ด

- พัฒนาบน branch ที่กำหนด commit ชัดเจน ไม่เปิด PR จนกว่าเจ้าของสั่ง
- รัน `npm run check` ให้ผ่านก่อน commit ทุกครั้ง
- อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด Next.js (Next 16 มี breaking changes — ดู `AGENTS.md`)
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยก่อน · โค้ด/ชื่อตัวแปร/คอมเมนต์เป็นภาษาอังกฤษ

### 2.3 Health guardrails ⛔ (ห้ามละเมิด)

- **AI ไม่วินิจฉัยโรค** — สรุป อธิบายแนวโน้ม ช่วยเตรียมคุยกับแพทย์ แพทย์เป็นผู้ตัดสินใจ
- ทุกคำตอบด้านสุขภาพของ AI มี disclaimer · กรณีความเชื่อมั่นต่ำหรือเสี่ยง → ส่งต่อมนุษย์/แนะนำพบแพทย์
- อาการฉุกเฉิน (เช่น เจ็บหน้าอก หายใจไม่ออก คิดทำร้ายตัวเอง) → แสดงเบอร์ **1669** (เจ็บป่วยฉุกเฉิน) และ **1323** (สายด่วนสุขภาพจิต) ทันที
- **"ผิดปกติ" ตัดสินด้วยโค้ดจากช่วงค่าอ้างอิง (reference range) ไม่ใช่ให้ LLM ตัดสิน** — LLM มีหน้าที่อธิบายเท่านั้น
- AI ไม่แนะนำขนาดยา/ขนาดอาหารเสริม — ให้ปรึกษาแพทย์หรือเภสัชกร
- ไม่ใช้ตัวเลขความแม่นยำที่ไม่มีหลักฐาน (เช่น "แม่นยำขึ้น 95%" ในเอกสารไอเดีย) ในข้อความขาย
- Gamification ให้รางวัล **ความสม่ำเสมอ** ไม่ใช่รูปร่าง/น้ำหนัก
- PDPA: ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหว (มาตรา 26) ต้องขอความยินยอมโดยชัดแจ้ง แยกเป็นรายข้อ (ดูหัวข้อ 7)
- บันทึกบทสนทนา AI เพื่อ audit ได้

---

## 3. Brand & Theme ✅ (คำสั่งเจ้าของโครงการ ข้อ 2)

แนวคิด: **โทนเขียวมิ้นต์-ทีลบนพื้นขาวนวล ใช้ส้มโคราลเป็นสีเน้น** — ตรงกับโลโก้

| บทบาท                | ชื่อ       | ค่าสี        | ใช้กับ                                                                |
| -------------------- | ---------- | ------------ | --------------------------------------------------------------------- |
| สีหลัก (primary)     | Teal       | `#0A8FA3`    | ความน่าเชื่อถือ เป็นการแพทย์แต่ไม่เย็นชา — header, ไอคอน, พื้นที่ใหญ่ |
| สีรอง (secondary)    | Mint Green | `#2DD4A7`    | ความสดชื่น สุขภาพดี — สถานะปกติ, แถบความคืบหน้า                       |
| สีเน้นข้อมูล         | Sky Blue   | `#1E90FF`    | กราฟและตัวเลข                                                         |
| สีปุ่ม/ยิ้ม (accent) | Coral      | `#FF7A6B`    | ปุ่มสำคัญ (CTA) และช่วงให้กำลังใจ เช่น Streak, คะแนนดี                |
| พื้นหลัง             | ขาวนวล     | `#F7FBFA`    | พื้นหลังแอป                                                           |
| ตัวหนังสือ           | เทาเข้ม    | `#1F2A30`    | ข้อความทั้งหมด — **ไม่ใช้ดำสนิท**                                     |
| แจ้งเตือนผิดปกติ     | แดงสด      | ✅ `#E5484D` | **เฉพาะค่าผิดปกติจริงเท่านั้น** ไม่งั้นผู้ใช้จะตกใจ                   |

### 3.1 กฎการใช้สีเพื่อให้อ่านง่าย (คำนวณ contrast แล้ว) ✅

ค่าสีของแบรนด์บางสีคอนทราสต์ไม่พอสำหรับตัวอักษรเล็ก (มาตรฐาน WCAG AA ต้อง ≥ 4.5:1) จึงเสนอกฎดังนี้
โดยไม่เปลี่ยนสีแบรนด์:

| การใช้งาน                                    | ผล contrast                                      | กฎ                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| ปุ่ม Coral + ตัวหนังสือเทาเข้ม `#1F2A30`     | ≈ 5.8 : 1 ✓                                      | ปุ่ม CTA ใช้ตัวหนังสือเทาเข้ม (ไม่ใช้ตัวขาวบนโคราล ≈ 2.5 : 1 ✗)                                                              |
| Teal `#0A8FA3` บนพื้นขาวนวล                  | ≈ 3.7 : 1                                        | ใช้ได้กับไอคอน/หัวข้อตัวใหญ่ · ข้อความเล็กใช้ **Teal เข้ม `#07707F`** (≈ 5.5 : 1 ✓)                                          |
| Mint `#2DD4A7`                               | ตัวขาวบนมิ้นต์ ≈ 1.9 : 1 ✗                       | ใช้เป็นพื้น/แถบ ตัวหนังสือบนมิ้นต์ใช้เทาเข้ม                                                                                 |
| Sky Blue `#1E90FF` บนพื้นขาวนวล              | ≈ 3.1 : 1                                        | ใช้กับเส้นกราฟ/ตัวเลขใหญ่ได้ (กราฟต้องการ ≥ 3 : 1)                                                                           |
| แดง `#E5484D` บนพื้นขาวนวล                   | ≈ 3.75 : 1                                       | ใช้เป็นป้าย/ไอคอน/ตัวเลขใหญ่ · ข้อความอธิบายข้างป้ายใช้เทาเข้ม                                                               |
| เทาเข้ม `#1F2A30` บนพื้นขาวนวล               | ≈ 14 : 1 ✓                                       | ข้อความหลักทั้งหมด                                                                                                           |
| Blustering Blue `#311FFF` (เมนูที่เลือกอยู่) | ≈ 7.6 : 1 บนขาว ✓ · ≈ 6.7 : 1 บนพื้น `#ECEBFF` ✓ | เจ้าของโครงการสั่ง (2026-10-04) — ใช้เฉพาะสถานะ "เมนูที่เลือกอยู่" (sidebar, bottom bar, More) คู่กับตัวหนา + `aria-current` |

### 3.2 ระดับสถานะของค่าสุขภาพ ✅ (D13)

| สถานะ          | สี                       | ตัวอย่างข้อความ                      |
| -------------- | ------------------------ | ------------------------------------ |
| อยู่ในเกณฑ์    | Mint                     | "อยู่ในช่วงปกติ"                     |
| ควรติดตาม      | ✅ เหลืองอำพัน `#F2A93B` | "ค่านี้มีแนวโน้มเพิ่มขึ้น ควรติดตาม" |
| ผิดปกติ (จริง) | แดงสด                    | "อยู่นอกช่วงอ้างอิง ควรปรึกษาแพทย์"  |

ไม่ใช้โคราลกับสถานะเตือน เพราะโคราลคือสีของ "กำลังใจ" — ใช้ปนกันผู้ใช้จะสับสน

### 3.3 โลโก้และไอคอน

- ไฟล์ปัจจุบันเป็น JPG พื้นขาว → ใช้ทำ favicon / PWA icon / หน้า auth ได้
- 🟡 ถ้ามีไฟล์ **SVG หรือ PNG พื้นโปร่งใส** จะได้ไอคอนคมกว่าและวางบนพื้นสีได้
- ฟอนต์: Noto Sans Thai (ไทย) + Geist (ละติน) — ตั้งไว้แล้ว ทรงมนเข้ากับโลโก้

---

## 4. เอกสารต้นทางและลำดับความสำคัญ ✅ (คำสั่งเจ้าของโครงการ ข้อ 1, 3)

| ลำดับ | เอกสาร                                                        | ใช้เพื่อ                                                      |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 1     | `docs/Precision Health Recommended Features Final.pdf`        | **ขอบเขต functions & features หลัก** + Priority + Roadmap     |
| 2     | `docs/Precision Health Idea ChatGPT & Gemini.txt`             | **รายละเอียดของแต่ละ feature** (ใช้เป็นหลักในการลงรายละเอียด) |
| 3     | `docs/Precision Health Subscription Tiers Business Model.pdf` | packages Gold 49 / Premium 89, AI cost, unit economics        |
| 4     | `docs/README.md` + `docs/01–13-*.md`                          | แบบแผนการ implement ที่ผ่าน production มาแล้ว (knowledge)     |
| 5     | `docs/PDPA-RIGHTS-SECTION-KNOWLEDGE.md`                       | หน้าสิทธิตาม PDPA (export / policy / consent / delete)        |
| 6     | `docs/requirements.md`                                        | สรุปย่อของเอกสาร 1–3                                          |

---

## 5. Packages และ Trial ✅ (คำสั่งเจ้าของโครงการ ข้อ 1 · D1–D5)

### 5.1 สิ่งที่ตกลงแล้ว ✅

- ลูกค้าใหม่ได้ใช้ **Premium ฟรี 2 สัปดาห์ (14 วัน)** ทันทีที่สมัคร
- หมด trial แล้ว ลูกค้าเลือก package เพื่อใช้ต่อ: **Gold 49 บาท/เดือน** หรือ **Premium 89 บาท/เดือน**
- Feature และโควตาของ Gold / Premium ตามตารางใน Subscription Tiers PDF
- การจำกัดเน้นที่ AI usage (ต้นทุนผันแปรหลัก) · ทุก package จอง Lab / Home Service / Referral ได้เหมือนกัน

### 5.2 Free package → ✅ ตัดสินใจแล้ว: มี "Free-lite" หลัง trial หมด (D1)

**เหตุผลที่แนะนำ**

1. **Data moat ต้องไม่หายตอน trial หมด** — Timeline / Vault / ผลแล็บที่ผู้ใช้สะสมไว้ 14 วันคือเหตุผลที่เขาจะกลับมาจ่าย
   ถ้าล็อกทั้งแอป ผู้ใช้ที่ยังไม่พร้อมจ่ายจะหายไปพร้อมข้อมูล
2. **Habit loop ต้องเดินต่อได้ในราคาต้นทุนเกือบศูนย์** — check-in, Health Score, Streak คำนวณด้วยโค้ด ไม่ใช้ LLM
3. **PDPA** — ผู้ใช้ต้องเข้าถึงและดาวน์โหลดข้อมูลของตัวเองได้เสมอ ไม่ว่าอยู่ package ไหน
4. **Growth engine** — Shareable card, Referral, Quiz ต้องใช้ได้ฟรีเพื่อดึงคนใหม่
5. Free-lite ทำให้มี **จุด upsell หลายจุด** (โควตาใกล้หมด, ฟีเจอร์ Premium ที่เห็นแต่ใช้ไม่ได้) แทนกำแพงเดียว

**ทางเลือกที่ไม่แนะนำ:** Hard paywall (หมด trial = ใช้ไม่ได้เลยนอกจากดู/ดาวน์โหลดข้อมูล)
— แปลงเป็นเงินเร็วกว่าในระยะสั้น แต่เสียผู้ใช้และข้อมูลที่ยังไม่พร้อมจ่าย

### 5.3 ตารางเปรียบเทียบ ✅ (Gold/Premium ตาม PDF · Free-lite ตาม D2)

| Feature                            | Free-lite (หลัง trial) | Gold 49 ฿         | Premium 89 ฿ (= สิทธิ์ช่วง trial) |
| ---------------------------------- | ---------------------- | ----------------- | --------------------------------- |
| AI Health Quiz / Biological Age    | 1 ครั้ง / 3 เดือน      | 1 ครั้ง/เดือน     | ไม่จำกัด                          |
| AI Chat / Ask My Health            | 5 ข้อความ/เดือน        | 30 ข้อความ/เดือน  | ไม่จำกัด*                         |
| AI Food Snap                       | 3 ครั้ง/เดือน          | 15 ครั้ง/เดือน    | ไม่จำกัด*                         |
| Lab Result OCR / Import            | 1 ครั้ง/เดือน          | 3 ครั้ง/เดือน     | ไม่จำกัด*                         |
| Daily Check-in + Health Score      | ✓ (คำนวณด้วยโค้ด)      | ✓                 | ✓ + Advanced Insights             |
| Today's 3 Actions                  | ✓ แบบ template         | ✓                 | ✓ ปรับเฉพาะตัวด้วย AI             |
| Bio-Streaks & Achievement          | ✓                      | ✓                 | ✓ + Badge พิเศษ                   |
| Health Timeline                    | ย้อนหลัง 30 วัน        | ย้อนหลัง 3 เดือน  | ไม่จำกัด + Predictive             |
| Health Vault                       | 5 ไฟล์                 | 20 ไฟล์           | ไม่จำกัด                          |
| Monthly Health Report              | สรุปย่อ (ไม่ใช้ AI)    | พื้นฐาน           | ละเอียด + Shareable สวย           |
| Shareable Cards                    | ✓ template พื้นฐาน     | ✓                 | ✓ + Template พิเศษ                |
| Health Passport / Pre-Doctor Brief | —                      | —                 | ✓                                 |
| AI Health Agent                    | —                      | —                 | ✓                                 |
| Wearable Integration               | —                      | อ่านข้อมูลพื้นฐาน | อ่าน + AI วิเคราะห์เต็ม           |
| Family Sharing                     | —                      | —                 | เพิ่มสมาชิกได้ 1 คน               |
| Supplement Recommendation          | —                      | พื้นฐาน           | Personalized + Auto-Ship แนะนำ    |
| Priority Booking / Support         | ปกติ                   | ปกติ              | Priority                          |
| จอง Lab / Home Service / Referral  | ✓                      | ✓                 | ✓                                 |
| ดาวน์โหลด/ลบข้อมูลของฉัน (PDPA)    | ✓ เสมอ                 | ✓ เสมอ            | ✓ เสมอ                            |

\* "ไม่จำกัด" = **นับทุกครั้ง แต่ไม่จำกัดด้วยโควตา** และมีเพดาน fair-use ที่ admin ตั้งได้ (0 = ปิด) — ตาม knowledge 10
เพื่อไม่ให้ผู้ใช้คนเดียวทำบิล AI พัง ต้นทุน AI ของ Free-lite ประมาณ ≤ 2–3 บาท/คน/เดือน (ประมาณการ ต้องวัดจริง)

### 5.4 กฎของ trial และการเปลี่ยน package ✅

| เรื่อง             | ข้อเสนอ                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| เริ่ม trial        | อัตโนมัติเมื่อสมัครและยินยอม PDPA ครบ · ไม่ต้องผูกบัตร                                                                                                                                      |
| สิทธิ์ trial       | 1 ครั้งต่อบัญชี (กันสมัครซ้ำด้วยอีเมล/บัญชี LINE ที่ยืนยันแล้ว)                                                                                                                             |
| ต้นทุน trial       | ผู้สมัครทุกคนได้ Premium 14 วัน = ต้นทุน AI ~9–13 บาท/คน (ครึ่งเดือนของ Premium) → **มี fair-use cap แยกของ trial และของ Premium ให้ admin ตั้งได้ (D4)** ค่าเริ่มต้นกำหนดหลังวัดต้นทุนจริง |
| ความยาว trial      | เก็บใน settings (`trial_days = 14`) admin ปรับได้ ไม่ hard-code                                                                                                                             |
| แจ้งเตือน          | ก่อนหมด 3 วัน และ 1 วัน (กฎอัตโนมัติ, knowledge 06) + หน้า paywall ตอนหมดที่สรุป "สิ่งที่คุณสร้างไว้" (จำนวนผลแล็บ, streak, timeline)                                                       |
| หมด trial ไม่เลือก | ตกเป็น Free-lite อัตโนมัติ (D1)                                                                                                                                                             |
| Downgrade          | **ไม่ลบข้อมูล** · ข้อมูลเกินสิทธิ์ถูกซ่อนจากหน้าจอ/AI แต่ยังดาวน์โหลดผ่าน "ข้อมูลของฉัน" ได้เสมอ · Vault เกินโควตา = ดูได้ เพิ่มไม่ได้                                                      |
| ราคา/โควตา         | อยู่ในตาราง settings ที่เดียว ใช้ทั้งหน้า landing, หน้า package, ตอนเก็บเงิน (knowledge 04, 10)                                                                                             |
| รายปี ✅ (D3)      | Gold 490 ฿/ปี · Premium 890 ฿/ปี (เท่ากับจ่าย 10 เดือน ได้ใช้ 12 เดือน)                                                                                                                     |

### 5.5 การชำระเงิน ✅ (D5)

| ระยะ              | วิธี                                                                                  | หมายเหตุ                                                                              |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Phase 1–3         | **QR PromptPay + admin ตรวจสลิป** (knowledge 03, 04) — draft → review → paid/rejected | ไม่มีค่าธรรมเนียม gateway เริ่มได้ทันที แต่ผู้ใช้ต้องโอนเองทุกรอบ และต้องมีคนตรวจสลิป |
| Phase 4 (สุดท้าย) | **Omise recurring** (บัตร / PromptPay ตัดอัตโนมัติ) ตามเอกสาร Business Model          | ลดงานตรวจสลิป เพิ่ม retention ของรายได้                                               |
| ทางเลือก          | ใช้ API ตรวจสลิปอัตโนมัติ (บริการภายนอก) ระหว่างรอ Omise                              | ต้องประเมินค่าบริการ                                                                  |

> ⚠️ ผลของการเลื่อน Omise ไปท้ายสุด: ตลอด Phase 1–3 ผู้ใช้ต้องโอนเองทุกเดือนและ admin ต้องตรวจทุกสลิป
> (ตัวอย่าง: สมาชิกรายเดือน 500 คน ≈ 17 สลิป/วัน) → แนะนำเน้นขายแผนรายปี (ลดจำนวนสลิป) + ส่งเตือนต่ออายุล่วงหน้า (กฎอัตโนมัติ K06)

---

## 6. Feature catalog และการแบ่ง Phase

อ้างอิง: หัวข้อในวงเล็บ = section ใน Recommended Features PDF / Idea TXT

| Module            | Feature                                                                                                              | แหล่งรายละเอียด            | Phase                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------- |
| **Funnel**        | Health/Longevity Quiz 3–5 นาที (ทำได้ **ก่อนสมัคร**) → Health Score + อายุสุขภาพโดยประมาณ                            | PDF 3.1 · TXT Gemini §1    | 1                      |
|                   | Instant 7-day plan · Dynamic upsell gate ไป Lab package / Home Service                                               | PDF 3.1                    | 1                      |
| **Auth**          | สมัคร/ล็อกอินด้วย Email+password (ไม่มี OTP) · Google · LINE Login (D7)                                              | —                          | 0                      |
| **Onboarding**    | สมัคร + consent รายข้อ (Phase 0) · Health Profile 5–10 คำถาม + เริ่ม trial (Phase 1)                                 | TXT §20 ① ②                | 0–1                    |
|                   | ผูก LINE OA เพื่อรับแจ้งเตือน + คิวแจ้งเตือน LINE (K07)                                                              | —                          | 1                      |
| **Scan (Killer)** | ปุ่มใหญ่ "📸 Scan My Health"                                                                                         | TXT §3A                    | 1                      |
|                   | Food Snap → อาหาร, portion, สารอาหาร + เชื่อมกับผลแล็บล่าสุด                                                         | PDF 3.2 · TXT §3A.1        | 1                      |
|                   | Lab Scan (PDF/รูป) → ดึงค่า → **หน้าให้ผู้ใช้ตรวจทาน** → เข้า Timeline + trend                                       | PDF 3.2 · TXT §3A.2        | 1                      |
|                   | Daily Check-in 3–5 ข้อ (นอน พลังงาน อารมณ์ กิจกรรม อาหาร)                                                            | TXT §3A.3                  | 1                      |
|                   | Barcode / Voice log สำรอง                                                                                            | PDF 3.2                    | 2                      |
| **Engagement**    | Personal Health Score (Sleep, Activity, Nutrition, Recovery, Check-up, Lifestyle) + trend — "ควรใส่ใจอะไรสัปดาห์นี้" | TXT §4                     | 1                      |
|                   | Today's 3 Actions + progress bar                                                                                     | TXT §9                     | 1                      |
|                   | Bio-Streaks (consistency > appearance)                                                                               | TXT §10                    | 1                      |
|                   | Achievements / แต้มแลกส่วนลด Lab                                                                                     | PDF 3.3                    | 2                      |
|                   | Monthly Health Report Card + Share with Doctor / Export PDF                                                          | TXT §11                    | 2                      |
|                   | Biological Age Tracker (จาก biomarker)                                                                               | PDF 3.3                    | 4                      |
| **Data moat**     | My Health Timeline™ + "สุขภาพฉันเปลี่ยนไปอย่างไร"                                                                    | TXT §5                     | 1 (พื้นฐาน) / 2 (เต็ม) |
|                   | Health Vault (Lab PDF, ใบสั่งยา, วัคซีน, imaging, ใบรับรอง) + AI อ่านตาม permission                                  | TXT §17                    | 2                      |
|                   | Doctor-ready Health Passport™ (QR / PDF / secure link มีวันหมดอายุ)                                                  | TXT §12                    | 3                      |
|                   | AI Pre-Doctor Brief                                                                                                  | TXT §13                    | 3                      |
| **AI**            | AI Health Chat / Ask My Health Data (คำถามสำเร็จรูป 4 ปุ่ม)                                                          | TXT §7                     | 1                      |
|                   | My Health Agent (tool calling: สรุปเดือน, ตั้งเตือน, เตรียมคำถามหมอ)                                                 | TXT §6                     | 3                      |
|                   | AI Anomaly + Next Action                                                                                             | PDF 3.5                    | 2                      |
|                   | Voice-first Thai AI Concierge                                                                                        | PDF 3.5                    | 4                      |
| **Integration**   | Wearables / IoT (ดูหัวข้อ 9) — นำเข้าไฟล์ + ingestion API + companion app (D10)                                      | TXT §8 · PDF 3.6           | 3–4                    |
| **Monetization**  | Trial + Paywall + Packages (รายเดือน/รายปี) + PromptPay                                                              | PDF 3.7 · Subscription PDF | 1                      |
|                   | Omise recurring (D5)                                                                                                 | Subscription PDF           | 4                      |
|                   | Paywall A/B experiments                                                                                              | PDF 3.7                    | 2                      |
|                   | ปุ่ม "สนใจตรวจสุขภาพ" (เก็บ lead + ติดต่อกลับทาง LINE OA) แทนการจองจริงจนถึง Phase 4                                 | TXT §14 · PDF 3.9          | 1                      |
|                   | จองแพ็กเกจตรวจ / Home Service จริง (D6)                                                                              | TXT §14 · PDF 3.9          | 4                      |
|                   | Supplement recommendation / Auto-Ship + Marketplace                                                                  | PDF 3.7 · TXT §14          | 3                      |
|                   | Family Health (Premium +1) · Corporate plan                                                                          | TXT §15–16                 | 3                      |
| **Viral**         | Shareable Health Cards (ไม่เปิดเผยค่าสุขภาพละเอียด)                                                                  | TXT §21 · PDF 3.8          | 1                      |
|                   | Referral (เช่น ชวน 3 คน = Premium 1 เดือน)                                                                           | TXT §21                    | 2                      |
|                   | Health Challenges (7-Day Better Sleep ฯลฯ)                                                                           | TXT §21                    | 2                      |
|                   | Influencer / Creator toolkit                                                                                         | PDF 3.8                    | 3                      |
| **Ops & Scale**   | Staff portal อัปโหลดผลตรวจ → เข้า Timeline ลูกค้าอัตโนมัติ (D6)                                                      | PDF 3.9                    | 4                      |
|                   | Multi-branch, Franchise, P&L, Unit Economics, AI Business Copilot                                                    | PDF 3.9                    | 4                      |

**หน้าจอหลัก (mobile-first)**

- สาธารณะ: `/` landing · `/quiz` · `/pricing` · `/auth` · `/privacy` · `/terms`
- ผู้ใช้: `/today` · `/scan` (+ ผลอาหาร, ตรวจทานผลแล็บ) · `/timeline` (+ กราฟ biomarker) · `/ask` · `/reports` · `/vault` · `/passport` · `/doctor-brief` · `/family` · `/challenges` · `/referral` · `/book` · `/profile` · `/subscription` · `/inbox` · `/settings`
- Admin: `/admin` (usage) · `/admin/payments` · `/admin/billing` · `/admin/ai` · `/admin/ai-cost` · `/admin/flags` · `/admin/rules` · `/admin/notifications` · `/admin/users` · `/admin/catalog` (ช่วงค่าอ้างอิง, ฐานข้อมูลอาหาร) · `/admin/bookings`

**เมนูมือถือ (knowledge 02):** bottom bar = `วันนี้ · ไทม์ไลน์ · [📸 สแกน] · ถาม AI · เพิ่มเติม`
(ปุ่มสแกนอยู่กลาง เด่นกว่าปุ่มอื่น) เดสก์ท็อปเป็น sidebar แบ่งกลุ่ม: ประจำวัน / ข้อมูลของฉัน / บริการ / บัญชี

---

## 7. การนำ Knowledge files มาใช้ใน RooSuk ✅/🟡 (คำสั่งเจ้าของโครงการ ข้อ 3)

> knowledge เขียนจาก stack TanStack Start / Firebase — แปลงเป็น Next.js 16 + Supabase:
> `createServerFn` → Server Actions / Route Handlers · middleware `requireSupabaseAuth` / `requireAdmin` → helper `requireUser()` / `requireAdmin()` ฝั่ง server
> **กฎข้ามทุกเรื่อง 8 ข้อใน `docs/README.md` ใช้กับ RooSuk ทั้งหมด** (เช่น `.select("id")` ตรวจแถวที่เขียนจริง, ซ่อนปุ่ม ≠ ปิดฟีเจอร์, fallback = ทำงานต่อ, migration ไม่พร้อม deploy)

| #    | Knowledge            | ใช้กับ RooSuk ที่                                                                                                                                                        | การปรับให้เข้ากับ RooSuk                                                                                                                                                                       |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Responsive layout    | AppShell ทุกหน้า, หน้าแชท, กราฟ Timeline/Score                                                                                                                           | breakpoint เดียว `md`, `dvh`, safe-area, `min-w-0` · ทดสอบ Playwright 390×844 แบบวัดค่า                                                                                                        |
| 02   | Navigation           | เมนูผู้ใช้ + admin, จุดแดงแจ้งเตือน                                                                                                                                      | ลิสต์เมนูแบนที่เดียว · bottom bar 4 + เพิ่มเติม · `kindToNav` สำหรับผลแล็บใหม่/นัดตรวจ/โควตา                                                                                                   |
| 03   | PromptPay QR         | จ่ายค่า package (Phase 1) · จองแพ็กเกจตรวจ/Home Service (Phase 4)                                                                                                        | สถานะ `review` มีจริงใน DB · บังคับเลขอ้างอิง · ฝังยอดใน QR                                                                                                                                    |
| 04   | Subscriptions        | Trial 14 วัน, Gold/Premium, Family (+1)                                                                                                                                  | `profiles.plan_tier/plan_expires_at` + payments ledger + `user_subscriptions` (trial = แถว source `trial`) · `isPlanActive()` ฟังก์ชันเดียวที่รู้เรื่องสิทธิ์ครอบครัว · PAYG ยังไม่ใช้ 🟡      |
| 05   | Usage analytics      | Dashboard admin: DAU/WAU/MAU, เมนูยอดนิยม, retention                                                                                                                     | เพิ่มตาราง `product_events` (รายชื่อ event กำหนดฝั่ง server) สำหรับ funnel: quiz → signup → trial → paywall → subscribe · ต้นทุน AI ต่อ task/package                                           |
| 06   | Automation rules     | เตือน trial/package ใกล้หมด, เตือน check-in, streak ใกล้ขาด, สร้าง Monthly Report, เตือนตรวจประจำปี/ตรวจซ้ำ, แจ้ง admin เมื่อ AI cost > 20 ฿/คน/สัปดาห์, ลบข้อมูลตามอายุ | ตัวเลขอยู่ใน DB เงื่อนไขอยู่ในโค้ด · seed `ON CONFLICT DO NOTHING` · บันทึก `last_count`                                                                                                       |
| 07   | LINE notifications   | Daily mission ตอนเช้า, ผลแล็บพร้อม, นัดตรวจ, trial ใกล้หมด, ผลตรวจสลิป (เริ่ม Phase 1 — D7)                                                                              | คิว + งานเบื้องหลัง · **⛔ ไม่ใส่ค่าสุขภาพในการ์ด LINE/altText** (โผล่บน lock screen) — บอกแค่ "มีผลแล็บใหม่พร้อมดู"                                                                           |
| 08   | Manual URL           | ลิงก์คู่มือ + ลิงก์ติดต่อ/LINE OA ที่ admin ตั้งได้                                                                                                                      | https เท่านั้น · ค่าว่าง = ซ่อนเมนู                                                                                                                                                            |
| 09   | Feature flags        | Kill switch ต่อฟีเจอร์: food_scan, lab_scan, health_agent, wearables, family, marketplace, booking, voice                                                                | ด่านที่ server (`assertFeature`) ทุกฟีเจอร์ · ไม่มีค่า = เปิด · ปิดได้ทันทีเมื่อค่า AI พุ่ง                                                                                                    |
| 10   | Billing & quota      | ด่านโควตา AI ด่านเดียว (Free/Gold/Premium/trial)                                                                                                                         | "ไม่จำกัด" ยังนับ · fair-use cap · เดือนตามเวลาไทย · ส่งรหัสข้อความไม่ส่งประโยค · `src/config/plans.ts` กลายเป็นค่า DEFAULTS ส่วนค่าจริงมาจาก DB                                               |
| 11   | AI provider settings | **ตรงกับคำสั่งข้อ 4** — admin เลือก provider/model ต่องาน + fallback                                                                                                     | ขยาย TaskKind เป็นงานของ RooSuk (หัวข้อ 8) · `ai_events` เก็บเฉพาะ fallback/error · ปุ่มทดสอบ model · รายการ model จาก API จริง                                                                |
| 12   | i18n ไทย/อังกฤษ      | ข้อความทั้งแอป, error จาก server, prompt ภาษาที่ AI ตอบ                                                                                                                  | `const th` เป็นต้นฉบับ + `en satisfies Dict` · ปฏิทินพุทธ · `profiles.language`                                                                                                                |
| 13   | Export & deletion    | ขอสำเนาข้อมูล + ลบบัญชี                                                                                                                                                  | `OWNED_TABLES` ครบทุกตาราง · ไฟล์ใน Vault/รูปอาหาร/ผลแล็บเป็น signed URL · payments `ON DELETE SET NULL` · `privacy_audit_log`                                                                 |
| PDPA | สิทธิตามกฎหมาย       | หน้า Settings 3 การ์ด                                                                                                                                                    | (1) ดาวน์โหลดข้อมูล ม.30/31 + นโยบายมีเวอร์ชัน ม.23 + ดูความยินยอมรายข้อ (2) ที่เก็บข้อมูล `DATA_REGION` ค่าเดียว (3) ลบบัญชียืนยัน 2 ขั้น ทำฝั่ง server เพราะมีข้อมูลการเงินที่ต้อง anonymise |

**รายการความยินยอมรายข้อที่เสนอ (PDPA)** 🟡

| key                          | ความยินยอม                                                      | บังคับ                     |
| ---------------------------- | --------------------------------------------------------------- | -------------------------- |
| `terms_privacy`              | ยอมรับข้อกำหนดและนโยบายความเป็นส่วนตัว (ระบุ `POLICY_VERSION`)  | ✓                          |
| `not_medical_service`        | รับทราบว่า RooSuk ไม่ใช่บริการทางการแพทย์ และ AI ไม่วินิจฉัยโรค | ✓                          |
| `sensitive_health_data`      | เก็บและประมวลผลข้อมูลสุขภาพ (ม.26)                              | ✓ (บริการหลักใช้ข้อมูลนี้) |
| `ai_processing_cross_border` | ส่งข้อมูล/รูปไปประมวลผลกับผู้ให้บริการ AI ต่างประเทศ (ม.28)     | ✓ สำหรับฟีเจอร์ AI         |
| `data_region`                | ข้อมูลเก็บที่ Supabase ภูมิภาคสิงคโปร์ (ม.28)                   | ✓                          |
| `photos`                     | เก็บรูปอาหาร/เอกสาร                                             | เลือกได้                   |
| `wearables`                  | เชื่อมข้อมูลจากอุปกรณ์                                          | เลือกได้ (ถามตอนเชื่อม)    |
| `family_sharing`             | แชร์ข้อมูลกับสมาชิกครอบครัว                                     | เลือกได้ (ถามตอนเชิญ)      |
| `marketing`                  | รับข่าวสาร/โปรโมชัน                                             | เลือกได้                   |

---

## 8. AI Provider และ Model ✅/🟡 (คำสั่งเจ้าของโครงการ ข้อ 4)

### 8.1 หลักคิด: ความเชี่ยวชาญเฉพาะทางไม่ได้มาจากการเลือก model อย่างเดียว

| ชั้น                               | หน้าที่                                                                 | ตัวอย่าง                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. LLM                             | อ่านรูป/เอกสาร และอธิบายเป็นภาษาคน                                      | ระบุเมนู + portion, ดึงตารางผลแล็บ, อธิบายภาษาไทยง่าย ๆ                                                                                       |
| 2. ข้อมูลอ้างอิงในระบบ (grounding) | ให้ตัวเลขที่ถูกต้อง ไม่ให้ LLM เดา                                      | **ตารางคุณค่าทางโภชนาการอาหารไทย** (เช่น ของสถาบันโภชนาการ ม.มหิดล) · **ตาราง biomarker + ช่วงค่าอ้างอิง** ตามเพศ/อายุ/หน่วย (map รหัส LOINC) |
| 3. โค้ดตัดสินผล                    | ตัดสิน "ปกติ / ควรติดตาม / ผิดปกติ" และ trend                           | เทียบค่ากับช่วงอ้างอิงในโค้ด → กำหนดสี (แดงเฉพาะผิดปกติจริง)                                                                                  |
| 4. คนตรวจ                          | ผู้ใช้ยืนยันค่าที่อ่านได้ · แพทย์ที่ปรึกษาตรวจ prompt และช่วงค่าอ้างอิง | หน้า "ตรวจทานค่าที่อ่านได้" ก่อนบันทึก                                                                                                        |

### 8.2 คู่หลักที่แนะนำ: **Claude Sonnet + Gemini Flash** ✅ (ตามที่เสนอ) + Claude Haiku สำหรับงานเบา

| งาน (TaskKind)                               | Primary                                           | Fallback         | เหตุผล                                                                           |
| -------------------------------------------- | ------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `food_scan` รูปอาหาร → JSON สารอาหาร         | **Gemini Flash**                                  | Claude Haiku 4.5 | เร็ว ถูก วิชันดี · LLM ระบุเมนู/portion แล้วดึงสารอาหารจากตารางอาหารไทยของระบบ   |
| `lab_extract` PDF/รูปผลแล็บ → JSON biomarker | **Claude Sonnet 5.5**                             | Gemini Flash     | อ่าน PDF ได้ในตัว แม่นกับตาราง/ภาษาไทย · ใช้ structured output บังคับรูปแบบ JSON |
| `lab_explain` อธิบายผลเป็นภาษาง่าย           | **Claude Sonnet 5.5**                             | Gemini Flash     | ทำตาม guardrail ได้ดี · อธิบายจากค่า + ช่วงอ้างอิง + trend ที่โค้ดคำนวณแล้ว      |
| `chat` Ask My Health                         | **Claude Sonnet 5.5**                             | Gemini Flash     | คุณภาพภาษาไทย + ใช้ prompt caching ได้                                           |
| `agent` My Health Agent (tool calling)       | **Claude Sonnet 5.5**                             | —                | tool calling เชื่อถือได้                                                         |
| `quick` FAQ, จัดหมวดคำถาม, สรุปสั้น          | **Claude Haiku 4.5**                              | Gemini Flash     | ถูกและเร็ว                                                                       |
| `safety` คัดกรองข้อความฉุกเฉิน/เสี่ยง        | คำสำคัญในโค้ด + **Claude Haiku 4.5**              | —                | ทำก่อนตอบทุกข้อความ                                                              |
| `daily_plan` Today's 3 Actions               | template ในโค้ด + **Claude Haiku 4.5** (Premium)  | Gemini Flash     | สร้างรวดเดียวตอนกลางคืนผ่าน Batch API (ลดราคา 50%)                               |
| `monthly_report`                             | **Claude Sonnet 5.5** ผ่าน Batch API              | Gemini Flash     | ไม่ต้อง real-time                                                                |
| `quiz` Health Score / อายุสุขภาพ             | **อัลกอริทึมในโค้ด** + Haiku เขียนแผน 7 วัน       | —                | ตัวเลขต้องคงที่และอธิบายได้ ไม่ให้ LLM สุ่ม                                      |
| `voice` (Phase 4)                            | Gemini Flash (รับเสียง inline ได้ — knowledge 11) | —                |                                                                                  |

- ราคาอ้างอิง Claude (USD ต่อ 1M tokens, input/output): Sonnet 5.5 = $2 / $10 · Haiku 4.5 = $1 / $5 · Opus 5.5 = $4 / $20
  (**ไม่ใช้ Opus เป็นค่าเริ่มต้น** — บทเรียน knowledge 10/11: default รุ่นแพงสุดทำให้ขายต่ำกว่าทุน)
- **รุ่นของ Gemini ไม่ hard-code** — knowledge 11 พบว่าเอกสารกับ API จริงไม่ตรงกัน ให้ระบบดึงรายการ model จาก API
  แล้วทดสอบด้วย key จริงก่อนบันทึก
- อายุสุขภาพจากผลเลือด (Phase 4): พิจารณาสูตรที่มีงานวิจัยรองรับ เช่น PhenoAge (ใช้ 9 ค่าเลือด) — ต้องให้แพทย์ที่ปรึกษารับรองก่อน

### 8.3 Router และหน้า Admin (ตาม knowledge 11)

- **ลำดับการตัดสิน 3 ชั้น:** `ai_settings` (admin ตั้ง) → env → ค่าในโค้ด · อ่าน DB ไม่ได้ = ใช้ค่าเดิม ไม่ล่ม
- **router ตามชนิดงาน + ชนิด input:** รูปอาหาร → `food_scan` (Gemini) · PDF/รูปผลแล็บ → `lab_extract` (Claude) ·
  ข้อความ → `safety` ก่อน แล้ว `chat`/`quick` ตาม intent
- **fallback 1 ครั้ง** เฉพาะ error ที่คุ้ม (429, 5xx, network, 401/403) · ทุกการสลับบันทึก `ai_events`
- **หน้า `/admin/ai`:** สถานะปัจจุบัน · provider หลัก/สำรอง · model ต่องาน + ปุ่มทดสอบ · เหตุการณ์ AI ล่าสุด · "มีผลภายใน 1 นาที"
- 🟡 **วิธีเรียก API:** แนะนำใช้ **SDK ทางการของแต่ละเจ้า** (`@anthropic-ai/sdk`, `@google/genai`) ห่อด้วย adapter ของเราเอง
  เพื่อใช้ฟีเจอร์เฉพาะได้เต็ม (prompt caching, PDF, Batch API) แทน library กลางที่รองรับฟีเจอร์เหล่านี้ไม่ครบ

### 8.4 การคุมต้นทุน AI

1. **ด่านโควตาด่านเดียว** ตาม package (knowledge 10) + fair-use cap ของ Premium และ trial
2. **Prompt caching** — system prompt + guardrail + tool definitions + สรุปสุขภาพของผู้ใช้ วางไว้ส่วนต้นที่คงที่
3. **โมเดลเล็กสำหรับงานง่าย** (Haiku) · **Batch API** สำหรับงานไม่ real-time (ลด 50%)
4. **ย่อรูปก่อนส่ง** (เช่น ด้านยาวไม่เกิน ~1024px) ลด token ของรูป
5. **นับ token ทุก call → `ai_usage_monthly`** · หน้า `/admin/ai-cost` ต้นทุนต่อ task/package ·
   กฎเตือนเมื่อเฉลี่ย > 20 ฿/คน/สัปดาห์ (ตาม Business Model)
6. Feature flag ปิดฟีเจอร์ AI ได้ทันทีถ้าค่าใช้จ่ายพุ่ง (knowledge 09)

### 8.5 ความเป็นส่วนตัวกับผู้ให้บริการ AI ⛔

- ใช้ผ่าน **API แบบเสียเงิน** เท่านั้น — **ห้ามใช้ Gemini API free tier กับข้อมูลสุขภาพจริง**
  (เงื่อนไข free tier เปิดให้นำข้อมูลไปใช้ปรับปรุงบริการได้) ต้องเปิด billing ของ Google ก่อนใช้กับผู้ใช้จริง
- ไม่ส่งชื่อ/เลขบัตร/ข้อมูลระบุตัวตนไปพร้อม prompt เกินจำเป็น
- การส่งข้อมูลไปต่างประเทศต้องอยู่ในรายการความยินยอม (`ai_processing_cross_border`)

---

## 9. การเชื่อมต่อ Wearables และ IoT ✅ (คำสั่งเจ้าของโครงการ ข้อ 6 · D10 — เฟสท้าย)

### 9.1 ข้อจำกัดที่ต้องรู้

- **Web app (PWA) อ่าน Apple HealthKit ไม่ได้** — HealthKit ใช้ได้เฉพาะแอป iOS แบบ native
- **Health Connect (Android)** ก็ใช้ได้เฉพาะแอป Android แบบ native
- **Web Bluetooth** ใช้ได้บน Chrome (Android/desktop) แต่ **ไม่รองรับ Safari บน iOS**

### 9.2 หลักคิด: ใช้ "ศูนย์กลางสุขภาพในมือถือ" เป็นตัวแปลงสากล

อุปกรณ์ส่วนใหญ่ (Apple Watch, Garmin, Samsung, Xiaomi, Oura, Withings, เครื่องวัดความดัน/เครื่องชั่งหลายยี่ห้อ)
**sync เข้า Apple Health หรือ Health Connect อยู่แล้ว** → RooSuk เชื่อมแค่ 2 ศูนย์กลางนี้ ก็ได้อุปกรณ์จำนวนมากที่สุด
ด้วยงานน้อยที่สุด (ต้องตรวจความสามารถ sync ของแต่ละแบรนด์ก่อนประกาศว่ารองรับ)

```text
 อุปกรณ์ (นาฬิกา/แหวน/เครื่องชั่ง/เครื่องวัดความดัน)
        │ sync ผ่านแอปของแบรนด์
        ▼
 Apple Health (iOS)  ·  Health Connect (Android)       Cloud API ของแบรนด์      BLE มาตรฐาน
        │                                              (Oura, Withings, ...)   (ความดัน/น้ำตาล/น้ำหนัก)
        ▼                                                      │                      │
 RooSuk companion app (Capacitor ห่อเว็บเดิม)                  │                      │
        └──────────────────────────────┬───────────────────────┴──────────────────────┘
                                       ▼
                     Ingestion API  POST /api/ingest/observations
                     (batch, idempotent ด้วย external_id, ตรวจ consent ราย source)
                                       ▼
                     health_observations (time-series, หน่วยมาตรฐาน, รหัส LOINC)
                                       ▼
                     Health Score · Timeline · AI insights
```

### 9.3 ตัวเลือกและแผนตามเฟส

| ตัวเลือก                                                                                                                                                            | ครอบคลุม                                       | ค่าใช้จ่าย                                                            | เฟส                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------ |
| **A. กรอกเอง + นำเข้าไฟล์ export** (Apple Health `export.zip`, Google Takeout, CSV)                                                                                 | ทุกแบรนด์ (ไม่ real-time)                      | ต่ำมาก ทำบนเว็บได้ทันที                                               | 3                        |
| **B. Ingestion API + data model กลาง** (`health_observations`)                                                                                                      | รองรับทุกตัวเลือกข้างล่าง                      | ต่ำ                                                                   | 3                        |
| **C. Companion app ด้วย Capacitor** (iOS + Android) อ่าน HealthKit + Health Connect แบบ background sync · ได้ push notification และอยู่บน App Store/Play Store ด้วย | กว้างที่สุดผ่านศูนย์กลาง                       | Apple Developer ~$99/ปี + Google Play $25 ครั้งเดียว + งานพัฒนา       | 3                        |
| **D. Cloud API รายแบรนด์** (OAuth บนเว็บ เช่น Oura, Withings, Fitbit/Google, Polar, Garmin*)                                                                        | แบรนด์ที่เปิด API                              | ฟรีเป็นส่วนใหญ่ แต่ต้องทำทีละเจ้า (*Garmin ต้องสมัครโปรแกรม business) | 3–4 ตามความต้องการผู้ใช้ |
| **E. บริการ aggregator** (เชื่อมครั้งเดียวได้หลายแบรนด์)                                                                                                            | กว้าง เร็ว                                     | คิดเงินต่อผู้ใช้ต่อเดือนเป็น USD — ต้องเทียบกับราคา 49/89 ฿           | ทางเลือกแทน C/D          |
| **F. BLE อุปกรณ์การแพทย์มาตรฐาน** (GATT: Blood Pressure, Glucose, Weight Scale, Thermometer, Pulse Oximeter, Heart Rate)                                            | อุปกรณ์ที่ใช้มาตรฐาน                           | ต่ำ · Android ผ่าน Web Bluetooth, iOS ผ่าน companion app              | 4                        |
| **G. CGM** (เครื่องวัดน้ำตาลต่อเนื่อง)                                                                                                                              | ผ่าน Health Connect/HealthKit หรือ partner API | ขึ้นกับผู้ผลิต                                                        | 4                        |

**แผนที่ตัดสินใจแล้ว (D10):** Phase 3 ทำ A + B + C ไปด้วยกัน (นำเข้าไฟล์ + ingestion API + companion app ได้อุปกรณ์มากที่สุดต่อแรงที่ลง)
→ Phase 4 เพิ่ม D/F ตามที่ผู้ใช้ขอจริง · E ใช้เมื่ออยากออกตลาดเร็วและงบรองรับ

**รูปแบบข้อมูลกลาง (ออกแบบ schema ตอนเริ่ม Phase 3):** `user_id, type (steps, heart_rate, sleep_session, weight, bp_systolic, ...),
value, unit, start_at, end_at, source (healthkit / health_connect / oura / ble / manual / lab), device, external_id (กันซ้ำ)`
· อ้างอิงแนวคิด FHIR Observation / LOINC เพื่อต่อกับโรงพยาบาล/แล็บในอนาคต · ถอนความยินยอมราย source = หยุด sync + เลือกลบข้อมูลของ source นั้นได้

---

## 10. สถาปัตยกรรมระบบ

```text
 Browser / PWA (มือถือก่อน)  ·  Companion app (Phase 3)  ·  LINE
                 │
                 ▼
 Next.js 16 บน Netlify ─ Server Actions / Route Handlers (requireUser / requireAdmin / assertFeature)
   ├─ Personal Health OS: Profile · Score · Timeline · Daily Actions · Vault · Passport
   ├─ AI layer: router ต่อ TaskKind → quota gate → provider adapter (Claude / Gemini) → fallback → ai_events
   ├─ Billing: packages · trial · PromptPay review · (Omise Phase 4)
   └─ Admin: settings · flags · rules · AI · cost · usage · payments
                 │
                 ▼
 Supabase: Auth · Postgres + RLS ทุกตารางข้อมูลผู้ใช้ · Storage (bucket ส่วนตัว + signed URL) · pg_cron
                 │
 งานเบื้องหลัง: Supabase pg_cron สำหรับงาน SQL ล้วน (หมดอายุ, ลบข้อมูลเก่า)
               + Netlify Scheduled Function ความถี่ต่ำสำหรับงานที่เรียกภายนอก (LINE, AI batch) — ประหยัด Netlify credits
```

**ตารางหลัก (ร่าง)**

| กลุ่ม        | ตาราง                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| บัญชี & PDPA | `profiles` (plan_tier, plan_expires_at, language, ai_suspended) · `consents` + ประวัติ · `privacy_audit_log`                                     |
| ตั้งค่า      | `platform_settings` (ราคา โควตา trial_days feature_flags manual_url promptpay_id) · `ai_settings` · `automation_rules` · `notification_settings` |
| การเงิน      | `payments` (draft → review → paid/rejected, `ON DELETE SET NULL`) · `user_subscriptions` · `families` / `family_members`                         |
| AI           | `ai_usage_monthly` · `ai_events` · `chat_threads` / `chat_messages` (audit)                                                                      |
| สุขภาพ       | `health_profiles` · `quiz_results` · `daily_checkins` · `daily_actions` · `health_scores` (snapshot รายวัน) · `streaks`                          |
| อาหาร        | `food_logs` (+ รูปใน storage) · `food_catalog` (ตารางอาหารไทย)                                                                                   |
| แล็บ         | `lab_reports` (ไฟล์ต้นฉบับ) · `lab_results` (ค่า + หน่วย + ช่วงอ้างอิง + flag + LOINC) · `biomarker_catalog`                                     |
| Wearables    | `health_observations` · `data_sources` (การเชื่อมต่อ + consent)                                                                                  |
| Vault/Share  | `vault_documents` · `passport_links` (token + หมดอายุ) · `share_cards`                                                                           |
| แจ้งเตือน    | `app_notifications` · `notification_log` (คิว LINE) · `line_links`                                                                               |
| Growth       | `usage_daily` · `product_events` · `referrals` · `challenges`                                                                                    |
| บริการ       | `lab_packages` · `bookings`                                                                                                                      |

---

### 10.1 Authentication (D7)

| วิธี                            | Phase | หมายเหตุ                                                                                  |
| ------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| Email + password (ยังไม่มี OTP) | 0     | ต้องยืนยันอีเมลหรือไม่ ดู 13.1 ข้อ R1                                                     |
| Google                          | 0     | Supabase OAuth provider · ต้องสร้าง OAuth client ใน Google Cloud (`SETUP-GUIDE.md` A4)    |
| LINE Login                      | 0     | ทำ flow เองฝั่ง server (ดู 13.1 ข้อ R2) · ต้องมี LINE Login channel (`SETUP-GUIDE.md` A5) |
| ผูก LINE OA เพื่อรับแจ้งเตือน   | 1     | ต้องเป็นเพื่อนกับ OA (knowledge 07)                                                       |

---

## 11. Roadmap การสร้าง ✅ (ปรับตามการตัดสินใจ D1–D13)

| Phase                             | ระยะเวลา (ประมาณ) | ขอบเขต                                                                                                                                                                                                                                                                                                                                                                                                                                                             | เกณฑ์ว่าเสร็จ                                                                  |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **0 Foundation**                  | 1–2 สัปดาห์       | Theme + โลโก้ + PWA icon · AppShell + เมนู (K01/02) · i18n โครงสองภาษา เปิดไทยก่อน (K12) · Auth: Email+password / Google / LINE Login (D7) · schema ฐาน + RLS · consent รายข้อ · platform_settings + feature flags (K09) · admin role · Playwright มือถือ                                                                                                                                                                                                          | สมัคร/ล็อกอินได้ทั้ง 3 วิธี + ยินยอมรายข้อ · `npm run check` + Playwright ผ่าน |
| **1 MVP+ (AI Health Check loop)** | 5–7 สัปดาห์       | Quiz ก่อนสมัคร + Score + แผน 7 วัน + Shareable card · Trial 14 วัน + paywall + packages รายเดือน/รายปี + Free-lite + PromptPay (K03/04) · ด่านโควตา (K10) + AI router + `/admin/ai` (K11) · Food Scan · Lab Scan + หน้าตรวจทาน · Today (check-in, score, 3 actions, streak) · Timeline พื้นฐาน · Ask My Health · Health Profile · หน้า PDPA 3 การ์ด (K13 + PDPA) · usage analytics + funnel (K05) · ผูก LINE + แจ้งเตือน LINE (K07) · ปุ่ม "สนใจตรวจสุขภาพ" (lead) | ผู้ใช้เดินครบ loop: Quiz → สมัคร → Scan → Insight → Today → จ่ายเงิน ได้       |
| **2 Habit + Data moat**           | 4–6 สัปดาห์       | Monthly Report · Timeline เต็ม + กราฟ · Health Vault · กฎอัตโนมัติ (K06) · Achievements · Referral + Challenges · Barcode/Voice · Paywall A/B · AI Anomaly + Next Action · manual URL (K08) · Dark mode (D12)                                                                                                                                                                                                                                                      | retention dashboard มีข้อมูล · กฎอัตโนมัติทำงานพร้อมด่านโควตา                  |
| **3 Intelligence + Wearables**    | 4–6 สัปดาห์       | Health Agent · Passport + Pre-Doctor Brief · Family (+1) · Wearables: นำเข้าไฟล์ + ingestion API + Companion app (Capacitor) HealthKit/Health Connect (D10) · Supplement + Marketplace · Corporate plan พื้นฐาน · Creator toolkit                                                                                                                                                                                                                                  | Premium มีฟีเจอร์ครบตามตาราง                                                   |
| **4 Scale (สุดท้าย)**             | ต่อเนื่อง         | **Omise recurring (D5)** · **จองแพ็กเกจตรวจ + Home Service + Staff portal อัปโหลดผล (D6)** · Multi-branch / Franchise · BLE / CGM · อายุสุขภาพจากผลเลือด · Genomic insights · Voice Thai · B2B dashboard · AI Business Copilot · P&L / Unit Economics                                                                                                                                                                                                              |                                                                                |

### 11.1 สถานะ Phase 0 (อัปเดต 2026-10-03)

| งาน                                                  | สถานะ                                                                                                        | หมายเหตุ                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Theme + โลโก้ + PWA icon + manifest                  | ✅ เสร็จ                                                                                                     | โลโก้โปร่งใสสร้างจาก `docs/RooSuk Logo.jpg` ด้วย `npm run assets:brand`                                                      |
| AppShell + เมนู (K01/02)                             | ✅ เสร็จ                                                                                                     | sidebar / bottom bar (ปุ่มสแกนกลาง) / sheet "เพิ่มเติม" · ทดสอบ Playwright 390×844 และ 1280×800 · axe ไม่พบ serious/critical |
| i18n สองภาษา (K12)                                   | ✅ เสร็จ                                                                                                     | ไทยเป็นต้นฉบับ · อังกฤษ `satisfies` · สลับภาษาด้วย cookie + `profiles.language`                                              |
| Auth: Email+password / Google / LINE                 | ✅ Email ทดสอบกับ Supabase จริงผ่าน · 🟡 Google และ LINE รอเจ้าของทดสอบด้วยบัญชีจริง                         | ดู 11.2                                                                                                                      |
| schema ฐาน + RLS                                     | ✅ apply ลง Supabase จริงแล้ว (6 ตาราง เปิด RLS ครบ) · ทดสอบ RLS ทั้งบน Postgres จำลอง (16 ข้อ) และ JWT จริง | `npm run db:status`                                                                                                          |
| consent รายข้อ + หน้านโยบาย/ข้อกำหนด (ร่าง)          | ✅ เสร็จ                                                                                                     | เนื้อหากฎหมายเป็นร่าง ต้องให้ผู้เชี่ยวชาญตรวจก่อนเปิดจริง                                                                    |
| platform_settings + feature flags (K09) + admin role | ✅ ทดสอบกับของจริงผ่าน (เปิด/ปิด flag, non-admin ได้ 404) · รอตั้งบัญชีเจ้าของเป็น admin                     | `scripts/grant-admin.mjs <อีเมล>`                                                                                            |
| Playwright มือถือ                                    | ✅ เสร็จ                                                                                                     | `npm run build && npm run e2e`                                                                                               |

### 11.2 ผลการทดสอบกับ Supabase จริง (2026-10-03) และสิ่งที่พบ

ชุดทดสอบ `e2e/live` (รัน `E2E_LIVE=1 npx playwright test e2e/live --project=mobile`) สร้างผู้ใช้ทดสอบเอง แล้วลบทิ้งทุกครั้ง ผ่านทั้ง 4 ข้อ:
ล็อกอิน → ถูกบังคับยินยอม → เข้าแอป → ออกจากระบบ · สมัครสมาชิก + โปรไฟล์ถูกสร้างโดย trigger · RLS ด้วย JWT จริง · แอดมินเปิด/ปิด flag

- **R2 ยืนยันแล้ว:** Supabase ยอมรับอีเมลสังเคราะห์ `…@line-users.roosuk.invalid` (ใช้สร้างผู้ใช้ LINE ได้)
- **พบและแก้:** หลังล็อกอินด้วย server action การ redirect ซ้อนสองชั้น (→ `/today` → `/consent`) ทำให้ URL ค้างผิด — ตอนนี้ action เลือกปลายทางเองตั้งแต่แรก (`resolvePostLoginPath`)
- **ค่า Auth ของโปรเจกต์ที่ตรวจพบ (อ่านอย่างเดียว):** Site URL = `https://roosuk.netlify.app` · ยืนยันอีเมลปิดอยู่ (`mailer_autoconfirm`) · Google เปิดและตั้ง client แล้ว · ความยาวรหัสผ่านขั้นต่ำฝั่ง Supabase = 6 (แอปบังคับ 8)
- **⚠ ต้องแก้ใน Supabase dashboard:** Redirect URLs มี `https://roosuk.netlify.app` แต่ไม่มี `/**` จึงไม่ตรงกับ `/auth/callback` → Google login จะกลับมาที่หน้าแรกโดยไม่เข้าสู่ระบบ ให้เพิ่ม `https://roosuk.netlify.app/**`
- **ก่อนเปิดใช้จริง:** เปิดยืนยันอีเมล + ตั้ง SMTP ของตัวเอง · ตั้งความยาวรหัสผ่านขั้นต่ำเป็น 8 · เพิ่ม `NEXT_PUBLIC_SITE_URL`

### 11.3 ความคืบหน้า Phase 1

| งาน                                                        | สถานะ                                                                                                                                                                           | หมายเหตุ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ทดลอง Premium 14 วัน เริ่มเมื่อยินยอมครบ (D1)              | ✅ เสร็จ + ทดสอบกับของจริง                                                                                                                                                      | เก็บฝั่งเซิร์ฟเวอร์ ผู้ใช้แก้เองไม่ได้ · `trial_days` ปรับได้ใน `platform_settings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Free-lite หลังหมด trial (D1–D2)                            | ✅ เสร็จ + ทดสอบ                                                                                                                                                                | ไม่ restart trial ซ้ำ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ด่านโควตา AI (K10)                                         | ✅ เสร็จ + ทดสอบกับฐานข้อมูลจริง                                                                                                                                                | `checkAndConsume()` — atomic ใน SQL, ล้มแบบปิดกั้น, นับ "ไม่จำกัด" ด้วย, หน้าต่างโควตา 3 เดือนของ Quiz, เพดาน fair-use ของ trial/Premium (D4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| หน้า `/subscription`                                       | ✅ เสร็จ                                                                                                                                                                        | แพ็กเกจปัจจุบัน · แถบการใช้ AI · เปรียบเทียบ 3 แพ็กเกจ (ราคา D3 จากฐานข้อมูล)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ชำระเงิน PromptPay + admin ตรวจสลิป (K03/04)               | ✅ เสร็จ + ทดสอบกับฐานข้อมูลจริง                                                                                                                                                | ตาราง `payments` + `user_subscriptions` (ledger, RLS: ผู้ใช้อ่านของตัวเองเท่านั้น) · draft → review → paid/rejected (reject แล้วแจ้งใหม่ได้) · ยอด+เลขพร้อมเพย์ถูกตรึงในแถว · เลขอ้างอิงบังคับ · `confirm_payment()` เป็น SQL transaction เดียว (ยืนยันซ้ำไม่ได้, ต่ออายุแพ็กเกจเดิมต่อจากวันหมดอายุ) · `/subscription/pay/[id]` · `/admin/payments` (ตั้งเลขพร้อมเพย์ + คิวตรวจ + ประวัติ) · การแจ้งเตือน LINE รอ slice ของ LINE                                                                                                                                                                                                                                                                                                                                    |
| AI router + `/admin/ai` (K11)                              | ✅ เสร็จ (ทดสอบด้วย mock · Gemini key ตรวจกับ API จริงแล้ว)                                                                                                                     | adapter ของเราเอง บน SDK ทางการ (`@anthropic-ai/sdk`, `@google/genai`) · เลือกผู้ให้บริการ/โมเดลต่อ TaskKind 3 ชั้น (ฐานข้อมูล → ค่าในโค้ด) · fallback 1 ครั้งเฉพาะ error ที่คุ้ม · log เฉพาะ fallback/error (ไม่เก็บข้อความผู้ใช้) · หน้า admin: สถานะ key, เลือกหลัก/สำรอง, รุ่นต่อ provider×งาน + ปุ่มทดสอบ, เหตุการณ์ล่าสุด · **ยังไม่มี `ANTHROPIC_API_KEY`** (ระบบถอยไปใช้ Gemini ให้เอง และ log ไว้) · ต้องใส่ key AI ทั้งสองตัวใน **Netlify** ด้วยตอนใช้งานจริง                                                                                                                                                                                                                                                                                              |
| Daily check-in · Health Score · Today's 3 Actions · Streak | ✅ เสร็จ + ทดสอบกับฐานข้อมูลจริง                                                                                                                                                | `daily_checkins` (5 แตะ: นอน/ขยับ/พลังงาน/อารมณ์/อาหาร — ไม่ถาม น้ำหนัก/รูปร่าง) + `action_completions` · RLS บังคับ "วันนี้ (เวลาไทย)" เท่านั้น ย้อนวันเพื่อโกง streak ไม่ได้ · Health Score 6 ด้าน คำนวณด้วยโค้ด (ผลตรวจรอ Lab Scan, ไม่มีข้อมูล = ไม่หักคะแนน) + เทรนด์เมื่อมีข้อมูลพอ · 3 Actions แบบ template (คงที่ทั้งวัน) · streak นับการมาเช็กอินล้วน ๆ · แจ้งเตือนอารมณ์ต่ำต่อเนื่อง 3 วัน (สายด่วน 1323) · Timeline พื้นฐาน (กราฟ 14 วัน + ประวัติ ตามสิทธิ์ย้อนหลังของแพ็กเกจ — ข้อมูลเก่าไม่ถูกลบ) · ยังไม่มีตาราง `health_scores` (คำนวณสด; เพิ่ม snapshot เมื่อ Timeline ต้องใช้)                                                                                                                                                                     |
| Health Quiz ก่อนสมัคร + แผน 7 วัน                          | ✅ เสร็จ (Shareable card ยังไม่ทำ)                                                                                                                                              | `/quiz` เปิดสาธารณะ ไม่ต้องสมัคร: 8 คำถาม → คะแนน 0–100 + อายุสุขภาพโดยประมาณ (±10 ปี) **คำนวณด้วยโค้ด** ไม่เก็บอะไรของผู้ไม่ได้สมัคร · ผู้ใช้ที่ล็อกอิน: เติมคำตอบจากโปรไฟล์, ผ่านด่านโควตา `healthQuiz`, บันทึกผล + แผน 7 วันที่ AI เขียน (Haiku→Gemini) ผ่านตัวกรองคำต้องห้าม (ยา/อาหารเสริม/รักษา/ลดน้ำหนัก/อดอาหาร — ใช้ตัดคำภาษาไทยจริง) ไม่ผ่าน = ใช้แผน template · เกินโควตาได้ตัวเลขแต่ไม่บันทึก · ไม่ถามน้ำหนัก/รูปร่าง · ⚠ น้ำหนักสูตรเป็นร่างแรก ต้องให้แพทย์ที่ปรึกษารับรอง                                                                                                                                                                                                                                                                             |
| Food Scan + หน้าตรวจทาน                                    | ✅ เสร็จ (ตรรกะ/RLS/UI ทดสอบแล้ว · การอ่านรูปจริงทดสอบด้วยรูปสังเคราะห์ เพราะ sandbox ดาวน์โหลดรูปอาหารไม่ได้ — **เจ้าของช่วยลองถ่ายอาหารจริงบน production ผ่าน Gemini**)       | ย่อรูปในเบราว์เซอร์ → เซิร์ฟเวอร์ตรวจ byte จริง (JPEG/PNG/WebP ≤ 3 MB) → ด่านโควตา → `food_scan` (Gemini → Claude Haiku สำรอง) → **โค้ดกำหนดตัวเลข** จากตารางอาหารไทย 41 รายการ (ร่าง, รอนักกำหนดอาหารตรวจ) ส่วนเมนูนอกตารางเป็น "AI ประมาณการ" ติดป้าย · ร่างมื้อ → ผู้ใช้ตรวจทาน (ปริมาณ/เอาออก) → บันทึก · **ไม่เก็บรูป** · ล้มเหลว/ไม่พบอาหาร = คืนสิทธิ์ (`refund_usage`) · แสดงใน Timeline                                                                                                                                                                                                                                                                                                                                                                     |
| Lab Scan + หน้าตรวจทาน                                     | ✅ เสร็จ (ตรรกะ/RLS/UI ทดสอบแล้ว · อ่าน PDF จริงทดสอบกับ Gemini ด้วย PDF สังเคราะห์: แปลงปี พ.ศ.→ค.ศ., แปลงหน่วย mmol/L→mg/dL, ไม่ให้ค่า 2-hr PP ใช้ช่วงของ fasting ได้ถูกต้อง) | PDF/รูป ≤ 3 MB (ตรวจ byte) → ด่านโควตา → `lab_extract` (Claude → Gemini สำรอง) → **โค้ดกำหนดสถานะทุกค่า** จากตารางช่วงอ้างอิง 22 รายการ (ร่าง unisex — **ต้องให้แพทย์ที่ปรึกษารับรองก่อนเปิดใช้จริง**) + แปลงหน่วย · ชื่อรายการจับคู่ด้วยตาราง alias ของเรา ไม่เชื่อ key ที่โมเดลเดา · ร่าง → ผู้ใช้ตรวจทาน (แก้เลข/เอาออก/ระบุวันที่; สถานะคำนวณใหม่ที่เซิร์ฟเวอร์) → `confirm_lab_report()` SQL เดียวแบบ atomic · สถานะแสดงด้วยไอคอน+ข้อความ (เหลือง = ควรติดตาม, แดงเฉพาะผิดปกติ) · เทียบค่าครั้งก่อน · ไม่เก็บไฟล์ · คืนสิทธิ์เมื่ออ่านไม่ได้ · แสดงใน Timeline · **ยังไม่มี AI อธิบายผล (`lab_explain`)** เพื่อลดความเสี่ยง — ใช้ข้อความ template จากโค้ดก่อน                                                                                                   |
| Health Profile                                             | ✅ เสร็จ + ทดสอบกับฐานข้อมูลจริง                                                                                                                                                | ปีเกิด · เพศ · สูบบุหรี่ · แอลกอฮอล์ · ออกกำลังกาย/สัปดาห์ · โรคประจำตัว (ไม่บังคับ) · เป้าหมาย (ไม่มีเป้าหมายน้ำหนัก/รูปร่าง) · **ไม่ถามน้ำหนัก/ส่วนสูง/ยา** · ทุกข้อ "ข้าม" ได้ · ผู้ใช้เขียนแถวตัวเองผ่าน RLS · ส่ง AI เฉพาะช่วงอายุ ไม่ส่งชื่อ/อีเมล · ⚠ อายุขั้นต่ำและความยินยอมผู้ปกครอง (ผู้เยาว์) ต้องให้ที่ปรึกษากฎหมายตัดสิน ตอนนี้รับปีเกิดที่อายุ 10–110                                                                                                                                                                                                                                                                                                                                                                                                 |
| Timeline                                                   | ✅ พื้นฐาน (check-in · มื้ออาหาร · ผลตรวจ)                                                                                                                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Ask My Health (`/ask`)                                     | ✅ เสร็จ (ตรรกะ/RLS/ด่านความปลอดภัยทดสอบแล้ว · คำตอบจริงจาก Gemini ตรวจแล้ว)                                                                                                    | 4 ชั้นความปลอดภัย: (1) คำฉุกเฉิน/ทำร้ายตัวเองในข้อความ → ข้อความตายตัว (1669 / 1323) **ไม่เรียกโมเดล ไม่หักโควตา** (2) ด่านโควตา `aiChat` (3) โมเดลตอบพร้อม urgency + confidence (4) **โค้ดตรวจคำตอบก่อนแสดง**: ห้ามขนาดยา/สั่งหยุด-ปรับยา/วินิจฉัยตัวผู้ใช้ (รู้จักประโยคปฏิเสธ-เงื่อนไข-คำถาม เพื่อไม่ทิ้งคำตอบที่ปลอดภัย) → แทนที่ด้วยข้อความสุภาพ; urgency สูง/มั่นใจต่ำ → ป้ายเตือน · context = โปรไฟล์(ช่วงอายุ) + คะแนน + ผลแล็บล่าสุด ไม่มีชื่อ/อีเมล · ล้มเหลว = คืนสิทธิ์และคงข้อความที่พิมพ์ไว้ · ทุกข้อความเก็บใน `ai_conversations`/`ai_messages` (audit + ผู้ใช้อ่าน/ลบเองได้)                                                                                                                                                                         |
| AI อธิบายผลแล็บ (`lab_explain`)                            | ✅ เสร็จ                                                                                                                                                                        | ปุ่มในหน้าผลตรวจที่ยืนยันแล้ว · โมเดลอธิบายเฉพาะค่า "ควรติดตาม/ผิดปกติ" จากสถานะที่โค้ดตัดสินไว้ ห้ามเปลี่ยนสถานะ · summary ผิด guardrail = ไม่แสดงคำอธิบายเลย, หมายเหตุรายตัวผิด = ตัดเฉพาะตัวนั้น · มีค่าผิดปกติ = โค้ดบังคับขึ้น "ควรปรึกษาแพทย์" · เก็บลง `lab_reports.explanation` (เปิดซ้ำไม่เสียสิทธิ์) · นับ 1 ครั้งของ `aiChat`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| หน้า PDPA 3 การ์ด (ดาวน์โหลด/ลบข้อมูล)                     | ✅                                                                                                                                                                              | export JSON ครบทุกตารางของผู้ใช้ (บันทึก audit) · เลือก consent ตัวเลือกใหม่ได้ (ต่อ history) · ลบบัญชียืนยัน 2 ขั้นฝั่ง server (ข้อมูลการเงิน/audit คงไว้โดยตัด user_id) · `src/config/user-data.ts` + เทส coverage กันตารางใหม่หลุด export/ลบ · `e2e/live/privacy.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| แจ้งเตือนในแอป + LINE (K07) + กฎอัตโนมัติ                  | ✅ เสร็จ (คิว/กฎ/ตัวส่งทดสอบครบ · **การส่งจริงกับ LINE ยังไม่ได้ทดสอบ** เพราะยังไม่มี `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`)                                                    | กล่องแจ้งเตือนในแอป + กระดิ่งแสดงจำนวน · ผู้ใช้/admin เขียนลง **คิว** เท่านั้น ไม่ push ใน request · `notifyUser()` จุดเดียว (inbox + คิว LINE, ล้มเหลวไม่ทำให้การกระทำต้นทางล้ม, ไม่แจ้งผู้ลงมือเอง, dedupe ต่อเหตุการณ์ทั้งใน inbox และคิว) · เหตุการณ์: แจ้งโอน→admin, ยืนยัน/ปฏิเสธสลิป→ผู้จ่าย · กฎ (ตัวเลขแก้ได้ที่ `/admin/rules` ไม่ต้อง deploy): เตือนเช็กอิน (ต้องเปิดเอง), ทดลอง/แพ็กเกจใกล้หมด, ทิ้งคิวค้าง, ล้างข้อมูลเก่า · ตัวส่ง: โควตารายเดือน + สำรองให้ข้อความสำคัญ, 401/403 หยุด 6 ชม., 400 ไม่ retry, 429 monthly หยุด, 5xx retry ≤3, 409 นับว่าสำเร็จ · ตั้งเวลาด้วย Netlify scheduled function ทุก 10 นาที → `/api/cron/notify` (ปิดสำหรับสาธารณะ ต้องมี `CRON_SECRET`) · ผู้ใช้เปิด/ปิดได้เองในหน้าตั้งค่า (บริการ: เปิด · เตือนรายวัน: ปิด) |
| usage analytics · ปุ่ม "สนใจตรวจสุขภาพ"                    | ⏳                                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 12. สิ่งที่ต้องได้จากเจ้าของโครงการก่อน/ระหว่างสร้าง

| สิ่งที่ต้องใช้                                                                         | ใช้เมื่อ              | หมายเหตุ                                                                            |
| -------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| **Supabase โปรเจกต์ 1 โปรเจกต์** (ใช้ร่วม dev/test/production — D11)                   | Phase 0 (ตอนนี้)      | ภูมิภาคสิงคโปร์ · ขั้นตอนและข้อมูลที่ต้องส่งอยู่ใน `SETUP-GUIDE.md` ส่วน A          |
| ล้างข้อมูลทดสอบ + หมุน/เพิกถอนคีย์ + อัปเกรด Pro                                       | ก่อนเปิดใช้จริง       | checklist ใน `SETUP-GUIDE.md` ส่วน C                                                |
| Netlify: ปิด Branch deploys และ Deploy Previews                                        | Phase 0 (ตอนนี้)      | ขั้นตอนใน `SETUP-GUIDE.md` ส่วน B (ผูก repo แล้ว)                                   |
| Network access ของ environment: เพิ่ม `*.supabase.co`, `api.supabase.com`              | ตอนนี้                | ตอนนี้ Supabase ถูกบล็อก ผมต่อไม่ได้ · ภายหลังเพิ่ม `api.line.me`, `access.line.me` |
| Google OAuth client (สำหรับ Google login)                                              | Phase 0               | `SETUP-GUIDE.md` A4                                                                 |
| SMTP สำหรับส่งอีเมลยืนยัน (เช่น Resend / AWS SES)                                      | ก่อนเปิดใช้จริง       | ดู 13.1 ข้อ R1                                                                      |
| Anthropic API key และ Google AI (Gemini) API key แบบเปิด billing                       | Phase 1               | ใส่เป็น environment variable — **ห้ามส่ง key ในแชท**                                |
| PromptPay ID สำหรับรับเงิน                                                             | Phase 1               | **ตั้งเองที่ `/admin/payments`** (ไม่ต้องส่งในแชท) — ว่างไว้ = ปิดรับชำระเงิน       |
| LINE Login channel (Phase 0) · LINE Official Account + Messaging API channel (Phase 1) | Phase 0 / 1           | `SETUP-GUIDE.md` A5                                                                 |
| รายการแพ็กเกจตรวจ + ราคา (เช่น 1,890 / 3,990 / 8,990 / 24,900+)                        | Phase 4 (ตอนทำการจอง) |                                                                                     |
| แพทย์ที่ปรึกษา (ตรวจ prompt, ช่วงค่าอ้างอิง, ถ้อยคำอายุสุขภาพ)                         | ก่อนเปิดใช้จริง       | ไม่ใช่งานโค้ด แต่สำคัญมาก                                                           |
| โลโก้ SVG/PNG พื้นโปร่งใส                                                              | ไม่บังคับ             |                                                                                     |
| Apple Developer + Google Play account                                                  | Phase 3               | สำหรับ companion app                                                                |

วิธีใส่ค่า key / network access ของ Claude: ดู `SETUP-GUIDE.md` ส่วน A6 — **ห้ามส่ง key ลับในแชท**

---

## 13. การตัดสินใจของเจ้าของโครงการ (D1–D13) ✅

| #     | ประเด็น                        | การตัดสินใจ                                                                                                                   | ผลต่อแผน                                                                  |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| D1–D2 | หลัง trial หมด + โควตา         | **Free-lite** ตามตาราง 5.3                                                                                                    | Chat 5 · Food 3 · Lab 1 · Quiz 1/3 เดือน · Timeline 30 วัน · Vault 5 ไฟล์ |
| D3    | ราคารายปี                      | **Gold 490 ฿ · Premium 890 ฿**                                                                                                | เพิ่มแผนรายปีใน Phase 1                                                   |
| D4    | fair-use cap                   | มีของ **Premium และ trial** · admin ตั้งได้                                                                                   | ด่านโควตา K10 · ค่าเริ่มต้นกำหนดหลังวัดต้นทุนจริง                         |
| D5    | การชำระเงิน                    | Phase 1–3 **PromptPay QR + ตรวจสลิป** → **Omise recurring ใน Phase สุดท้าย (4)**                                              | ดู 5.5 · ความเสี่ยง R4                                                    |
| D6    | การจอง/อัปโหลดผลโดยเจ้าหน้าที่ | **Phase สุดท้าย (4)**                                                                                                         | Phase 1 ใช้ปุ่ม "สนใจ" เก็บ lead แทน · ความเสี่ยง R3                      |
| D7    | วิธีล็อกอิน                    | **Email+password (ไม่มี OTP) + Google + LINE Login ใน Phase 0** · ผูก LINE เพื่อแจ้งเตือนใน Phase 1                           | ดู 10.1 · R1, R2                                                          |
| D8    | ภาษา                           | โครงสองภาษาตั้งแต่ต้น (K12) เปิดไทยก่อน แปลอังกฤษตามมา                                                                        |                                                                           |
| D9    | คู่ AI                         | Claude Sonnet 5.5 + Gemini Flash (billing เปิด) + Claude Haiku 4.5 งานเบา · SDK ทางการ + adapter ของเรา                       | ดูหัวข้อ 8                                                                |
| D10   | wearable                       | นำเข้าไฟล์ + ingestion API + companion app (Capacitor) ทั้งหมดใน **Phase 3**                                                  | ดูหัวข้อ 9                                                                |
| D11   | test environment               | **Supabase โปรเจกต์เดียวใช้ร่วม dev/test/prod** (ล้างข้อมูลก่อนขึ้น production) · ปิด branch deploy/deploy preview บน Netlify | ดู 2.1 ข้อ 6 · R5 · `SETUP-GUIDE.md`                                      |
| D12   | dark mode                      | ไว้ทีหลัง (Phase 2+)                                                                                                          | ธีมสว่างก่อน                                                              |
| D13   | สีสถานะ                        | เหลืองอำพัน `#F2A93B` (ควรติดตาม) · แดง `#E5484D` (ผิดปกติจริง)                                                               | ดู 3.2                                                                    |

### 13.1 ความเสี่ยง/ประเด็นที่เกิดจากการตัดสินใจ (ขอให้รับทราบ — ไม่ต้องตอบถ้าโอเค)

| #   | เรื่อง                             | รายละเอียดและแนวทางที่ใช้                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | อีเมลยืนยันตัวตน (D7)              | อีเมล+รหัสผ่านโดยทั่วไปต้องส่งอีเมลยืนยัน แต่ SMTP เริ่มต้นของ Supabase ถูกจำกัดมาก (ตามที่ผมทราบ ส่งได้เฉพาะอีเมลของสมาชิกทีม Supabase และมีเพดานต่ำ — จะตรวจกับ dashboard จริงตอนตั้งค่า) → ช่วงพัฒนาเลือกปิด "Confirm email" ได้ · **ก่อนเปิดใช้จริงต้องตั้ง SMTP ของตัวเอง** แล้วเปิดการยืนยันอีเมล                                                                                                                                                   |
| R2  | LINE Login (D7)                    | ตามที่ผมทราบ Supabase ไม่มี LINE เป็น provider สำเร็จรูป → ทำ flow เองฝั่ง server (OAuth code → ตรวจ ID token → สร้าง/ล็อกอินผู้ใช้) ทำได้ · LINE ไม่ส่งอีเมลมาเสมอ (ต้องขอสิทธิ์ email และผู้ใช้อาจไม่ให้) → **ไม่รวมบัญชีอัตโนมัติด้วยอีเมล** (เสี่ยงถูกยึดบัญชี) ผู้ใช้เชื่อม Google/LINE เองจากหน้าตั้งค่าหลังล็อกอิน · ผลข้างเคียง: สมัครหลายวิธี = หลายบัญชี = ได้ trial หลายครั้ง → คุมด้วย fair-use cap ของ trial (ต้นทุนส่วนเกิน ≈ 10 บาท/บัญชี) |
| R3  | ไม่มีการจองจริงใน Phase 1 (D6)     | Dynamic upsell gate ของ Quiz/Insight จะพาไปปุ่ม "สนใจตรวจสุขภาพ" (เก็บ lead + ติดต่อกลับทาง LINE OA) ต้องมีช่องทางติดต่อที่มีคนตอบ                                                                                                                                                                                                                                                                                                                        |
| R4  | PromptPay นานถึง Phase 3 (D5)      | ทุกรอบต้องโอนเองและ admin ตรวจทุกสลิป — ดูตัวอย่างตัวเลขใน 5.5 · ลด churn ด้วยแผนรายปี + เตือนต่ออายุ                                                                                                                                                                                                                                                                                                                                                     |
| R5  | Supabase เดียวทั้ง dev/prod (D11)  | (1) ห้ามผู้ใช้จริงสมัครก่อน cleanup (2) service-role key และ access token ที่ใส่ใน environment ของ Claude ต้อง **หมุน/เพิกถอนก่อนเปิดใช้จริง** (3) แพ็กเกจ Free ของ Supabase ถูกพักโปรเจกต์เมื่อไม่มีการใช้งานราว 1 สัปดาห์และไม่มี backup → **อัปเกรด Pro ก่อนมีผู้ใช้จริง** (4) migration ที่ผมรันระหว่างพัฒนาลงฐานข้อมูลนี้จริงทันที                                                                                                                   |
| R6  | Quiz ของ Free-lite เป็นรอบ 3 เดือน | โควตาอื่นเป็นรายเดือน → ด่านโควตาต้องรองรับ "ช่วงเวลา" ของแต่ละโควตา (ทำใน Phase 1 พร้อมด่านโควตา)                                                                                                                                                                                                                                                                                                                                                        |
| R7  | ทดสอบ Google/LINE login            | ในสภาพแวดล้อมของผม ทำได้เฉพาะ Email · การล็อกอินด้วย Google และ LINE ต้องใช้บัญชีจริง ผมจะเตรียมขั้นตอนทดสอบให้คุณทำเอง                                                                                                                                                                                                                                                                                                                                   |

---

## 14. Change log

| วันที่     | เวอร์ชัน | รายละเอียด                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-03 | v0.1     | ร่างแรก: บันทึกข้อกำหนดทั้ง 7 ข้อของเจ้าของโครงการ + แผน + ประเด็นรอตัดสินใจ                                                                                                                                                                                                                                                                                 |
| 2026-10-03 | v0.2     | บันทึกการตัดสินใจ D1–D13 · ปรับ roadmap (LINE → Phase 1, wearables → Phase 3, Omise + การจอง → Phase 4) · เพิ่มหัวข้อ 10.1 Auth และ 13.1 ความเสี่ยง · เพิ่ม `SETUP-GUIDE.md` และ `netlify.toml`                                                                                                                                                              |
| 2026-10-03 | v0.3     | เริ่ม Phase 0: theme, AppShell, i18n, auth (Email/Google/LINE), consent, feature flags, admin, schema + RLS + test, Playwright · เพิ่มหัวข้อ 11.1 สถานะ Phase 0                                                                                                                                                                                              |
| 2026-10-03 | v0.4     | apply migration ลง Supabase จริง · ชุดทดสอบ live ผ่าน · แก้ redirect หลังล็อกอิน · ด่านตรวจ env ตอน build production · กฎ sync เข้า `main` ทุกครั้ง · หัวข้อ 11.2                                                                                                                                                                                            |
| 2026-10-03 | v0.5     | แก้ production 404: deploy แรกของแอปรายงาน "No functions deployed" (Next runtime ไม่ทำงาน) → ระบุ `@netlify/plugin-nextjs` และ `publish = ".next"` ใน `netlify.toml` · จำลอง build ด้วย netlify-cli ได้ server handler + edge handler                                                                                                                        |
| 2026-10-04 | v0.6     | Phase 1 slice A: แพ็กเกจ + trial 14 วัน + ด่านโควตา AI (migration `billing_core` apply แล้ว) · หน้า `/subscription` · ตั้ง `geeravut@gmail.com` เป็น admin · หัวข้อ 11.3                                                                                                                                                                                     |
| 2026-10-04 | v0.6.1   | เมนูที่เลือกอยู่เปลี่ยนเป็น Blustering Blue `#311FFF` (token `--color-active`)                                                                                                                                                                                                                                                                               |
| 2026-10-05 | v0.7     | Phase 1 slice B: ชำระเงิน PromptPay + admin ตรวจสลิป (migration `payments` apply แล้ว) · ชุดทดสอบ live `e2e/live/payments.spec.ts`                                                                                                                                                                                                                           |
| 2026-10-06 | v0.8     | Phase 1 slice C: check-in รายวัน · Health Score · 3 Actions · streak · Timeline พื้นฐาน (migration `daily_habit` apply แล้ว) · ชุดทดสอบ live `e2e/live/habit.spec.ts`                                                                                                                                                                                        |
| 2026-10-07 | v0.9     | Phase 1 slice D: AI provider router + `/admin/ai` (migration `ai_settings` apply แล้ว) · ตรวจรุ่น Gemini กับ API จริง (`gemini-flash-latest` ใช้ได้, `2.5-flash` 404)                                                                                                                                                                                        |
| 2026-10-08 | v0.10    | Phase 1 slice E: Food Scan (migration `meal_logs` + `refund_usage` apply แล้ว) · ตารางอาหารไทยร่าง 41 รายการ · ชุดทดสอบ live `e2e/live/food.spec.ts`                                                                                                                                                                                                         |
| 2026-10-09 | v0.11    | Phase 1 slice F: Lab Scan (migration `lab_results` apply แล้ว) · ตารางช่วงอ้างอิงร่าง 22 รายการ · Gemini default → `gemini-3-flash-preview` / `gemini-flash-lite-latest` (flash-latest 503 ต่อเนื่อง) · retry 1 ครั้งที่ provider เดิมเมื่อ 503/429 · ชุดทดสอบ live `e2e/live/lab.spec.ts`                                                                   |
| 2026-10-10 | v0.12    | Phase 1 slice G: Health Profile (migration `health_profiles` apply แล้ว) · `/profile` · การ์ดชวนตั้งค่าในหน้าวันนี้ · ชุดทดสอบ live `e2e/live/profile.spec.ts`                                                                                                                                                                                               |
| 2026-10-11 | v0.13    | Phase 1 slice H: Health Quiz (migration `quiz_results` apply แล้ว) · `/quiz` สาธารณะ + `/quiz-result/[id]` · ปุ่มบนหน้าแรกและหน้าวันนี้ · ตัวกรองแผน AI ตัดคำไทยด้วย Intl.Segmenter · ชุดทดสอบ live `e2e/live/quiz.spec.ts`                                                                                                                                  |
| 2026-10-12 | v0.14    | Phase 1 slice I: Ask My Health + AI อธิบายผลแล็บ + audit การสนทนา (migration `ai_conversations` apply แล้ว) · **พบว่า GOOGLE_AI_API_KEY เป็นบัญชีฟรี (free tier: 20 ครั้ง/วัน)** → ระบบ log `free_tier` และเตือนที่ `/admin/ai` · Gemini: ลด thinking เป็น LOW + เผื่อ token (เดิม thinking กิน 873/1024 จน JSON ขาด) · ชุดทดสอบ live `e2e/live/ask.spec.ts` |
| 2026-10-13 | v0.15    | Phase 1 slice J: แจ้งเตือนในแอป + LINE + กฎอัตโนมัติ (migration `notifications`, `notifications_dedupe` apply แล้ว) · `/notifications` `/admin/rules` · Netlify scheduled function · พบและแก้บั๊ก inbox ซ้ำทุกรอบด้วยชุดทดสอบ live (`e2e/live/notifications.spec.ts`)                                                                                        |
| 2026-10-14 | v0.16    | Phase 1 slice K: การ์ดสิทธิ PDPA ใน Settings (ดาวน์โหลดข้อมูล · ความยินยอมตัวเลือก · ที่เก็บข้อมูล · ลบบัญชี) · ไม่มี migration ใหม่ · เทส coverage ตรวจว่าทุกตารางที่อ้าง user อยู่ใน export/ลบ หรือถูกจัดเป็นรายการภายใน                                                                                                                                   |
| 2026-10-14 | v0.17    | ปุ่มถ่ายรูปในสแกนอาหาร (กล้องโดยตรง + เลือกจากเครื่อง) · `/admin/ai` เลือกรุ่นโมเดลเป็น dropdown (รายการจาก API ผู้ให้บริการ ถ้าดึงไม่ได้ใช้รุ่นที่โค้ดรู้จัก) · เพิ่ม admin `winner.richboss5@gmail.com` · วิธีสร้าง LIFF ใน SETUP-GUIDE                                                                                                                    |
| 2026-10-14 | v0.18    | ปุ่ม "ทดสอบ" รุ่นโมเดลแสดงเหตุผลจากผู้ให้บริการ (เช่น UNAUTHENTICATED / CREDENTIALS_MISSING) แทนเลข 401 เปล่า ๆ — เฉพาะรหัส ไม่แสดงข้อความอิสระ                                                                                                                                                                                                              |
| 2026-10-14 | v0.19    | แก้ "401 Unauthorized" ของ Gemini บน Netlify: SDK อ่าน `GOOGLE_GEMINI_BASE_URL` / `ANTHROPIC_BASE_URL` ที่ Netlify AI Gateway ใส่ให้อัตโนมัติ ทำให้คำขอไปที่ gateway แทน Google — ตอนนี้ล็อก base URL ตรงไปที่ผู้ให้บริการเสมอ (ข้อมูลสุขภาพไม่ผ่านบุคคลที่สาม) + เทสกันย้อนกลับ                                                                             |

---

## ภาคผนวก A — ข้อกำหนดต้นฉบับจากเจ้าของโครงการ (prompt แรก, 2026-10-03)

> 1. ขอให้ใช้ไฟล์แนบ "Precision Health Recommended Features Final.pdf" ที่แสดง functions & features ของระบบ Precision Health
>    (ที่ผมออกแบบและรวมที่แนะนำมาจากหลายๆ AI Model) เป็นหลัก เพื่อสร้าง Web Application โดยในแต่ล่ะ functions & features
>    จะมีรายละเอียดเบื้องต้นอยู่ในไฟล์แนบ "Precision Health Idea ChatGPT & Gemini.txt" (ให้ใช้ไฟล์นี้เป็นหลักในการลงรายละเอียดของ
>    functions & features ของระบบที่ต้องทำ) และผมต้องการให้ระบบนี้ออกแบบให้มี packages สำหรับลูกค้า 2 แบบ ดังไฟล์แนบ
>    "Precision Health Subscription Tiers Business Model.pdf" โดยเมื่อลูกค้าเริ่มต้นใช้งานระบบจะให้ใช้งานได้แบบ Premium ฟรีเป็นระยะเวลา
>    2 สัปดาห์ และเมื่อหมดแล้วก็จะให้ลูกค้าเลือก packages ที่ต้องการเพื่อใช้งานได้ต่อ (หรืออยากให้คุณแนะนำว่า เราควรมี Free package ไหม
>    ถ้ามีจะจำกัดการใช้งานอะไรที่น้อยกว่า Gold package บ้าง), ขอให้คุณวางแผนการสร้างออกมาให้ผมดูและตัดสินใจก่อน
> 2. ระบบ Precision Health นี้ผมจะใช้ชื่อว่า RooSuk(รู้สุข) โดยผมต้องการใช้ Netlify ในการ deploy ระบบ, ใช้ Supabase ในการทำ
>    Authentication+Database+Storage, และให้ใช้ GitHub ที่ผมสร้างไว้แล้วดัง URL "https://github.com/geeravut-lab/roosuk" นี้,
>    ขอให้ใช้ logo ของระบบดังรูป "RooSuk Logo.jpg" ที่แนบมาด้วย และขอให้ระบบใช้ theme สีดังด้านล่างนี้,
>    - โทนเขียวมิ้นต์-ทีล (Teal-Green) บนพื้นขาวนวล และใช้สีส้มโคราลเป็นสีเน้น ซึ่งตรงกับโลโก้ RooSuk
>    - พาเลตต์ที่แนะนำ
>      - **สีหลัก:** Teal `#0A8FA3` ให้ความรู้สึกน่าเชื่อถือ เป็นการแพทย์แต่ไม่เย็นชา
>      - **สีรอง:** Mint Green `#2DD4A7` ให้ความรู้สึกสดชื่อน สุขภาพดี
>      - **สีเน้นข้อมูล:** Sky Blue `#1E90FF` ใช้กับกราฟและตัวเลข
>      - **สีปุ่ม/ยิ้ม:** Coral `#FF7A6B` ใช้กับปุ่มสำคัญและช่วงที่ให้กำลังใจ เช่น Streak, คะแนนดี
>      - **พื้นหลัง:** ขาวนวล `#F7FBFA` ส่วนตัวหนังสือใช้เทาเข้ม `#1F2A30` ไม่ใช้ดำสนิท
>      - **สีแดงสดใช้เฉพาะแจ้งเตือนค่าผิดปกติจริงๆ ไม่งั้นผู้ใช้จะตกใจ
> 3. ขอให้นำ knowledge ไฟล์ \*.md (README.md เป็นสารบัญสำหรับไฟล์ 01-13\*.md, และไฟล์ PDPA-RIGHTS-SECTION-KNOWLEDGE.md)
>    ที่อยู่ใน path docs ใน repo ของ Github ที่เชื่อมอยู่กับโครงการนี้ ในการทำให้ความสามารถใน knowledges จากไฟล์ทั้งหมดนี้
>    มาอยู่ในระบบ RooSuk นี้ด้วย, โดยให้คุณออกแบบว่าควรนำความสามารถต่างๆมาใช้กับ functions & features อะไรในระบบ RooSuk นี้
> 4. ขอให้คุณแนะนำว่าควรจะใช้ AI Provider และ Model ไหนในการทำ functions & features ต่างๆ เช่น Food Scan และ Lab Result Scan
>    แล้วแปลผลออกมาให้ผู้ใช้งานเข้าใจได้ง่ายๆ (เพราะน่าจะต้องใช้ความเชี่ยวชาญเฉพาะทางในการดำเนินการ) เป็นตัน, แล้วอาจจะทำให้ Admin
>    สามารถตั้งค่าการเลือกใช้ AI Provider และ Model สำหรับ functions & features ที่ต้องการความเชี่ยวชาญเฉพาะทางได้ ตัวอย่างเช่น,
>    - เริ่มด้วย Claude Sonnet + Gemini Flash เป็นคู่หลัก
>    - ทำ Router ง่าย ๆ ในระบบ (ถ้าเป็นรูปอาหาร → Gemini, ถ้าเป็น Lab PDF → Claude)
>    - ใช้ Prompt Caching + Rate Limit ตาม Package (Gold/Premium) เพื่อคุมต้นทุน
> 5. ขอตั้งกฏในการทำงานของคุณสำหรับโครงการนี้ว่า ในการทดสอบขอให้ดำเนินการทดสอบบน test environment ของคุณ ไม่ต้องทดสอบบน
>    production ทุกครั้ง เพราะต้องการประหยัดในการใช้ credits ของ Netlify ในการ deploy production, ยกเว้นว่าจำเป็นต้องทดสอบบน
>    production จริงๆ ก็ให้คุณแจ้งขออนุญาตในการดำเนินการจากผมก่อนทุกครั้ง หรือแจ้งให้ผมดำเนินการทดสอบเอง
> 6. ขอให้คุณเตรียมวิธีและรูปแบบการเชื่อมต่อระบบ RooSuk นี้กับ wearable devices ทั้งสำหรับ Apple และ Andriod, หรือกับ IoT devices
>    เพื่อไว้ใช้ในเฟสท้ายๆด้วย โดยให้เน้นที่สามารถเชื่อมต่อได้ง่ายและใช้ได้กับ devices ที่หลากหลายได้มากที่สุด
> 7. ขอให้คุณบันทึกข้อมูลและรูปแบบที่ผมแจ้งมาทั้งหมดข้างต้นไว้ในไฟล์ .md เพื่อไว้ใช้อ้างอิงในการดำเนินการสร้างระบบ RooSuk
>    จนกระทั่งเสร็จสมบูรณ์ด้วย
>
> หมายเหตุ: ทุกไฟล์ที่แนบมาใน prompt นี้ มีเก็บไว้อยู่ใน path docs ใน repo ของ Github ที่เชื่อมอยู่กับโครงการนี้ด้วย
