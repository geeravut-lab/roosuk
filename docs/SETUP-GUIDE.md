# RooSuk — คู่มือตั้งค่าสภาพแวดล้อม (สำหรับเจ้าของโครงการ)

> ประกอบด้วย 3 ส่วน: **A. Supabase** · **B. Netlify** · **C. Checklist ก่อนเปิดใช้จริง**
> อ้างอิงจาก [`ROOSUK-MASTER-PLAN.md`](ROOSUK-MASTER-PLAN.md) (D11: ใช้ Supabase โปรเจกต์เดียวทั้ง dev/test/production)
>
> หน้าตาของ dashboard (Supabase / Netlify / Google / LINE) เปลี่ยนบ่อย ชื่อเมนูด้านล่างอาจต่างไปเล็กน้อย — ถ้าไม่เจอให้หาเมนูที่ความหมายใกล้เคียง

## ลำดับที่แนะนำ

| ลำดับ | ทำอะไร                                                   | ต้องทำก่อนที่ Claude จะเริ่ม Phase 0 หรือไม่          |
| ----- | -------------------------------------------------------- | ----------------------------------------------------- |
| 1     | A1–A3 สร้างโปรเจกต์ Supabase + เก็บค่า                   | ✅ ต้อง                                               |
| 2     | A6 ใส่ค่าใน environment ของ Claude + เปิด network access | ✅ ต้อง                                               |
| 3     | B ปิด auto-deploy บน Netlify                             | ✅ ควรทำก่อน push ครั้งถัดไป                          |
| 4     | A4 ตั้งค่า Auth (Email)                                  | ✅ ต้อง                                               |
| 5     | A4 Google OAuth · A5 LINE Login                          | ทำขนานกับ Phase 0 ได้ (ผมจะบอกเมื่อถึงขั้นที่ต้องใช้) |
| 6     | C ก่อนเปิดใช้จริง                                        | ภายหลัง                                               |

---

## A. Supabase

### A0. ข้อควรรู้ก่อนเริ่ม

- **โปรเจกต์เดียวใช้ทั้ง dev/test/production** — ข้อมูลที่อยู่ในนั้นก่อนเปิดใช้จริงถือเป็นข้อมูลทดสอบเท่านั้น (ทำ C ก่อนเปิดจริง)
- **ภูมิภาค (Region) เปลี่ยนทีหลังไม่ได้** — เลือก **Southeast Asia (Singapore)** (เอกสารความยินยอม PDPA ของเราระบุสิงคโปร์)
- **แผน Free** เหมาะกับช่วงพัฒนา แต่โปรเจกต์จะถูกพักเมื่อไม่มีการใช้งานราว 1 สัปดาห์ และไม่มี backup
  → **อัปเกรดเป็น Pro ก่อนมีผู้ใช้จริง** (อัปเกรดในโปรเจกต์เดิมได้ ไม่ต้องย้าย)
- เก็บรหัสผ่านฐานข้อมูลไว้ใน password manager ของคุณ (ผมไม่จำเป็นต้องใช้)

### A1. สร้างบัญชีและ Organization

1. เข้า supabase.com → Sign in (GitHub หรืออีเมล)
2. สร้าง Organization สำหรับ RooSuk (เช่นชื่อ `roosuk`) เลือกแผน Free ไปก่อน

### A2. สร้างโปรเจกต์

1. **New project** → เลือก organization ที่สร้างไว้
2. **Project name:** `roosuk`
3. **Database password:** กด Generate แล้วเก็บไว้ใน password manager
4. **Region:** **Southeast Asia (Singapore)**
5. ถ้ามีตัวเลือก **Enable automatic RLS** (เปิด RLS อัตโนมัติสำหรับตารางใหม่) แนะนำให้เปิด — ผมจะเขียน policy เองอยู่แล้ว แต่ตัวเลือกนี้เป็นด่านกันพลาด
6. **Create new project** แล้วรอจนสถานะพร้อม (ประมาณ 1–2 นาที)

### A3. เก็บค่าที่ต้องใช้

| ค่า                                                                         | หาได้จาก                                                                                                  | ลับหรือไม่                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Project URL** เช่น `https://abcdxyz.supabase.co`                          | Project Settings → API (หรือ Data API)                                                                    | ไม่ลับ                                                                           |
| **Project ref** = ตัวอักษรหน้า `.supabase.co` (ตัวอย่างข้างบนคือ `abcdxyz`) | จาก Project URL                                                                                           | ไม่ลับ                                                                           |
| **Publishable key** (หรือ `anon` key แบบเดิม)                               | Project Settings → API Keys                                                                               | ไม่ลับ (ฝังในหน้าเว็บอยู่แล้วโดยออกแบบ) — ขึ้นต้น `sb_publishable_…` หรือ `eyJ…` |
| **Secret key** (หรือ `service_role` key แบบเดิม)                            | Project Settings → API Keys                                                                               | **ลับมาก** — ข้าม RLS ได้ทั้งหมด ขึ้นต้น `sb_secret_…` หรือ `eyJ…`               |
| **Access token** (Personal access token)                                    | รูปโปรไฟล์ (มุมขวาบน) → Account Preferences → Access Tokens → Generate new token ตั้งชื่อ `roosuk-claude` | **ลับมาก** — ดูหมายเหตุด้านล่าง                                                  |

**ทำไมผมต้องขอ Access token:** container ของผมต่อฐานข้อมูล Postgres ตรง ๆ ไม่ได้ (port 5432 ถูกบล็อก และไม่มี Docker)
ผมจึงสร้าง/แก้ตารางผ่าน **Supabase Management API (HTTPS)** ซึ่งต้องใช้ token นี้ ผมจะเขียนสคริปต์ `scripts/db-migrate.mjs`
รันไฟล์ใน `supabase/migrations/` ตามลำดับและจดว่ารันไปแล้ว

**ข้อควรระวัง:** Personal access token มีสิทธิ์ในระดับบัญชี (ครอบคลุมทุกโปรเจกต์ที่บัญชีนี้เข้าถึงได้ ไม่จำกัดแค่ RooSuk)
ถ้าบัญชี Supabase ของคุณมีโปรเจกต์อื่นที่สำคัญ แนะนำ **สร้างบัญชี Supabase แยก** สำหรับ RooSuk
(หรืออย่างน้อยจำไว้ว่าต้อง **เพิกถอน token นี้ก่อนเปิดใช้จริง** — ดู C)
ทางเลือกที่ไม่ต้องให้ token: คุณคัดลอกไฟล์ SQL ที่ผมเตรียมไปวางใน SQL Editor เอง ทุกครั้งที่มีการเปลี่ยน schema (ช้ากว่า แต่ปลอดภัยกว่า)

### A4. ตั้งค่า Authentication (Email + Google)

**Authentication → Sign In / Providers (หรือ Providers):**

1. **Email:** เปิดไว้ (ค่าเริ่มต้น) — ยังไม่ต้องเปิด OTP/magic link (D7)
   - ช่วงพัฒนา: ปิด **Confirm email** เพื่อให้ทดสอบสมัครได้ทันที
     (SMTP เริ่มต้นของ Supabase ใช้กับผู้ใช้จริงไม่ได้ ดู R1 ใน Master Plan — **ก่อนเปิดจริงต้องตั้ง SMTP ของตัวเองแล้วเปิดกลับ**)
2. **Google:**
   1. ที่ Google Cloud Console สร้างโปรเจกต์ (หรือใช้ที่มีอยู่) → **APIs & Services → OAuth consent screen**
      (User type: External · ใส่ชื่อแอป RooSuk, อีเมลติดต่อ, โลโก้ · scope พื้นฐาน `email`, `profile`, `openid` ก็พอ)
   2. **Credentials → Create credentials → OAuth client ID → Web application**
      - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
        (Supabase แสดง Callback URL นี้ให้คัดลอกที่หน้า Google provider)
   3. คัดลอก **Client ID** และ **Client secret** ไปใส่ที่หน้า Google provider ใน Supabase แล้วเปิดใช้งาน
   4. ก่อนเปิดใช้จริง ให้ **Publish app** ที่ OAuth consent screen (ไม่งั้นมีเฉพาะ test users ล็อกอินได้)
3. **Authentication → URL Configuration:**
   - **Site URL:** URL Netlify ของ production (เช่น `https://roosuk.netlify.app` หรือโดเมนจริง)
   - **Redirect URLs:** เพิ่ม `http://localhost:3000/**` และ `https://<netlify-url>/**`

ค่า Client ID/secret ของ Google ใส่ใน Supabase dashboard เท่านั้น **ไม่ต้องส่งให้ผม**

### A5. LINE Login (D7 — Phase 0)

> ผมทำ flow เองฝั่ง server ดังนั้นค่าของ LINE Login channel ต้องอยู่ใน environment ของแอป (ไม่ได้ใส่ใน Supabase dashboard)

1. เข้า LINE Developers Console → สร้าง **Provider** (เช่นชื่อ `RooSuk`)
2. สร้าง channel ชนิด **LINE Login** (Channel type: LINE Login · App type: Web app)
3. ที่แท็บ **LINE Login**: เพิ่ม **Callback URL**
   - `https://<netlify-url>/api/auth/line/callback`
   - `http://localhost:3000/api/auth/line/callback`
4. ที่แท็บ **OpenID Connect**: ขอสิทธิ์ใช้ **Email address** (ต้องส่งคำขอและอัปโหลดภาพหน้าจอที่ผู้ใช้ยินยอมให้ใช้อีเมล) —
   ถ้ายังไม่ได้รับอนุมัติ ผู้ใช้ LINE จะไม่มีอีเมลในระบบ (ใช้งานได้ปกติ)
5. เก็บ **Channel ID** และ **Channel secret** (แท็บ Basic settings)
6. ก่อนเปิดใช้จริง เปลี่ยนสถานะ channel จาก _Developing_ เป็น _Published_
7. ค่า: `LINE_LOGIN_CHANNEL_ID` (ไม่ลับ), `LINE_LOGIN_CHANNEL_SECRET` (**ลับ**)

LINE Official Account + Messaging API channel (สำหรับแจ้งเตือน) ใช้ใน **Phase 1** — ผมจะแจ้งขั้นตอนตอนนั้น

### A6. ส่งข้อมูลให้ Claude (สำคัญ: อย่าวางค่าลับในแชท)

**1) ส่งในแชทได้ (ไม่ลับ):**

- Project URL และ Project ref
- ยืนยันว่า region คือ Singapore

**2) ใส่ที่ environment ของ Claude Code (ลับ — ห้ามวางในแชท):**

เมนู cloud environment บนแถบชื่อ session → **Edit** → เพิ่ม environment variables:

| ชื่อตัวแปร                                            | ค่า                                                                                            | ลับ              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                            | Project URL                                                                                    | ไม่              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                       | Publishable key (หรือ anon key)                                                                | ไม่              |
| `SUPABASE_PROJECT_REF`                                | Project ref                                                                                    | ไม่              |
| `SUPABASE_SERVICE_ROLE_KEY`                           | Secret key (หรือ service_role key)                                                             | **ใช่**          |
| `SUPABASE_ACCESS_TOKEN`                               | Personal access token (A3)                                                                     | **ใช่**          |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | จาก A5                                                                                         | secret = **ใช่** |
| `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`              | ใช้ใน **Phase 1** (Gemini ต้องเป็นบัญชีที่เปิด billing)                                        | **ใช่**          |
| `CRON_SECRET`                                         | สตริงสุ่มยาว ๆ — ป้องกัน `/api/cron/notify` (งานเตือน/ส่ง LINE ทุก 10 นาที)                    | **ใช่**          |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`                 | Channel access token ของ LINE OA (Messaging API) — ต้องอยู่ใน **provider เดียวกับ LINE Login** | **ใช่**          |
| `LINE_LIFF_ID`, `LINE_OA_ADD_FRIEND_URL`              | ไม่บังคับ: LIFF id (เปิดการ์ดในแอป LINE) · ลิงก์เพิ่มเพื่อน OA ที่แสดงในหน้าตั้งค่า            | ไม่              |

ชื่อตัวแปรเหมือนใน [`.env.example`](../.env.example) ถ้า environment มีส่วน "API credentials" ให้ใช้ส่วนนั้นสำหรับค่าลับ

**3) เปิด network access ให้ container ของผม:**

ตอนนี้ container ของผมถูกบล็อกไม่ให้ต่อ Supabase (ผมทดสอบแล้ว — ต่อ Anthropic และ Google AI ได้ปกติ)
ที่เมนูเดียวกัน → **Network access** → เลือก **Custom** → ที่ **Allowed domains** เพิ่ม:

- `*.supabase.co` (API/Auth/Storage ของโปรเจกต์)
- `api.supabase.com` (Management API สำหรับ migration)
- เก็บรายการ package managers เริ่มต้นไว้ (ติ๊ก "include default list" ถ้ามี)
- ภายหลัง (Phase 1): `api.line.me`, `access.line.me`

ขั้นตอนทางการ: https://code.claude.com/docs/en/cloud-environments#network-access

**4)** การเปลี่ยน environment มีผลกับ **session ใหม่** — เริ่ม session ใหม่ใน repo นี้แล้วพิมพ์ว่า "ต่อ Phase 0" ผมจะอ่านแผนจาก repo แล้วทำต่อได้ทันที

**ถ้าเผลอวางคีย์ลับในแชท:** ให้สร้างคีย์ใหม่ (Roll/Regenerate) ที่ Supabase แล้วเพิกถอนอันเก่าทันที

### A7. หลังใส่ค่าเสร็จ — ใครทำอะไร (Phase 0)

**ผมทำ (ใน session ใหม่):**

1. `npm run db:status` → `npm run db:migrate` สร้างตารางทั้งหมด (profiles, admins, consent_records, platform_settings, line_links, privacy_audit_log) พร้อม RLS
2. ตรวจว่าเรียก API ของโปรเจกต์ได้จริง และทดสอบสมัคร/ล็อกอินด้วย Email

**คุณทำ:**

1. ทดสอบ **Google login** และ **LINE login** ด้วยบัญชีจริง (ผมทำแทนไม่ได้ เพราะต้องล็อกอินด้วยบัญชีของคน) — ถ้าไม่ผ่านให้ส่งข้อความ error ที่เห็นมา
2. ตั้งตัวเองเป็นผู้ดูแล: สมัครสมาชิกในแอปก่อน แล้วบอกอีเมลที่ใช้สมัคร ผมจะรัน `node scripts/grant-admin.mjs <อีเมล>` ให้
   (หรือรันเองก็ได้ ถ้าตั้ง `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` ในเครื่องของคุณ)
3. เมื่อ deploy จริง ตั้ง `NEXT_PUBLIC_SITE_URL` บน Netlify เป็นโดเมนจริง และเพิ่ม URL ต่อไปนี้ใน Supabase → Authentication → URL Configuration → Redirect URLs:
   `https://<โดเมน>/auth/callback` (หรือ `https://<โดเมน>/**` ตามที่ตั้งไว้ใน A4)

---

## B. Netlify — ปิด auto-deploy ของ branch `claude/*`

เป้าหมาย: ให้ Netlify build **เฉพาะ `main`** ไม่ build branch ของผม (`claude/*`) และไม่ build Deploy Preview ของ PR
เพื่อประหยัด credits

### B1. ปิด Branch deploys และ Deploy Previews

1. เข้า Netlify → เลือก site RooSuk → **Site configuration**
2. **Build & deploy → Continuous deployment → Branches and deploy contexts → Configure / Edit settings**
3. ตั้งค่า:
   - **Production branch:** `main`
   - **Deploy Previews:** เลือก **Don't deploy** / ปิด "Automatically build deploy previews" (ชื่อตัวเลือกอาจต่างเล็กน้อย)
   - **Branch deploys:** เลือก **None** (หรือ "Deploy only the production branch")
4. **Save**

### B2. (ตัวเลือก — เข้มที่สุด) หยุด build ทั้งหมดจนกว่าจะพร้อมเปิดใช้จริง

เนื่องจากแอปยังไม่พร้อมใช้งาน คุณจะไม่ต้องการให้ `main` build ด้วยก็ได้:

- **Site configuration → Build & deploy → Continuous deployment → Build status → Stop builds**
- เมื่อพร้อม deploy ครั้งแรก กด **Activate builds** (หรือสั่ง deploy เองจาก Deploys → Trigger deploy)

### B3. ด่านสำรองใน repo (ผมทำให้แล้ว)

ไฟล์ [`netlify.toml`](../netlify.toml) มี `ignore` command ที่ข้ามการ build ถ้า branch ไม่ใช่ `main`
— ต่อให้ลืมตั้ง B1 ก็ยังไม่ build (build ที่ถูกข้ามด้วย ignore command ไม่คิด build minutes ตามที่ Netlify ระบุ แต่คุณควรตั้ง B1 ไว้ด้วย)

### B4. ตรวจว่าตั้งสำเร็จ

1. **Deploys** → ดูรายการว่ามี deploy ที่มาจาก branch `claude/…` หรือ PR หรือไม่ — ผม push ไปแล้ว 3 ครั้ง ถ้ามีรายการเหล่านี้แปลว่า
   เคยถูก build ไปแล้ว (ตรวจจำนวน credits ที่ใช้ได้ที่ Team → Billing/Usage)
2. หลังตั้งค่า ผม push ครั้งถัดไป คุณควรเห็น **ไม่มี deploy ใหม่** (หรือเห็นสถานะ "Skipped/Canceled by ignore command")
   ถ้ายังมี build ใหม่ แจ้งผมได้เลย

### B4.1 ถ้าเว็บขึ้น "Page not found" ของ Netlify ทุกหน้า

เปิด Deploys → deploy ล่าสุด → ดูสรุปท้าย log ถ้าเขียนว่า **"No functions deployed"** แปลว่า Next.js runtime ไม่ทำงาน (เว็บถูกเผยแพร่เป็นไฟล์สถิต)
`netlify.toml` ระบุ `@netlify/plugin-nextjs` และ `publish = ".next"` ไว้แล้วเพื่อกันกรณีนี้ — ที่หน้า Build settings ไม่ต้องตั้ง Publish directory เอง (ปล่อยว่างหรือ `.next`)

### B5. Environment variables บน Netlify (จำเป็นก่อน deploy production)

**Site configuration → Environment variables** — `NEXT_PUBLIC_*` ถูกฝังตอน build จึงต้องมีก่อน build ตัวแปรลับให้ติ๊ก **Contains secret values**

| ตัวแปร                                                                | จำเป็น                | ลับ              |
| --------------------------------------------------------------------- | --------------------- | ---------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                            | ✅                    | ไม่              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)                     | ✅                    | ไม่              |
| `SUPABASE_SERVICE_ROLE_KEY` (secret key)                              | ✅                    | **ใช่**          |
| `NEXT_PUBLIC_SITE_URL` = `https://roosuk.netlify.app` (หรือโดเมนจริง) | แนะนำ                 | ไม่              |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`                  | ถ้าต้องการ LINE login | secret = **ใช่** |
| `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`                              | Phase 1               | **ใช่**          |

ไม่ต้องตั้ง `SUPABASE_ACCESS_TOKEN` และ `SUPABASE_PROJECT_REF` บน Netlify (ใช้เฉพาะสคริปต์ migration)

- build production จะ **ล้มทันทีพร้อมบอกชื่อตัวแปรที่ขาด** ถ้า 3 ตัวแรกไม่ครบ (`scripts/check-deploy-env.mjs`) — deploy เดิมยังออนไลน์ ตั้งค่าแล้ว Trigger deploy ใหม่
- `main` ผูก auto-deploy: ทุกครั้งที่ Claude sync งานเข้า `main` ที่แตะโค้ดแอป Netlify จะ build production (เอกสาร/ชุดทดสอบ/SQL ไม่ build)
- Claude ไม่มีช่องทางสั่ง deploy โดยตรง ตัวที่ทำให้ Netlify build คือการ push เข้า `main` เท่านั้น

---

## C. Checklist ก่อนเปิดใช้จริง (เพราะใช้ Supabase โปรเจกต์เดียวกับ dev/test)

ทำตามลำดับ — ผมจะเตรียมสคริปต์ `supabase/scripts/pre-launch-reset.sql` (ล้างข้อมูลผู้ใช้ แต่เก็บ settings/catalog) ไว้ให้ก่อนถึงขั้นนี้

- [ ] **1. ประกาศหยุดสมัคร** — ไม่มีผู้ใช้จริงในระบบก่อนขั้น 2–3 เสร็จ
- [ ] **2. ล้างข้อมูลทดสอบ**
  - Authentication → Users: ลบผู้ใช้ทดสอบทั้งหมด
  - รันสคริปต์ล้างตารางข้อมูลผู้ใช้ (ผมเตรียมให้) · ล้างไฟล์ใน Storage buckets
  - ล้างรายการชำระเงินทดสอบ (**หลังเปิดจริงห้ามลบ ledger**)
- [ ] **3. หมุน/เพิกถอนคีย์** (เพราะเคยอยู่ใน environment ของ Claude)
  - เพิกถอน **Access token** `roosuk-claude` (ถ้าจำเป็นต้องใช้ต่อ สร้างใหม่ให้ Netlify เท่านั้น)
  - สร้าง **Secret / service_role key** ใหม่ แล้วใส่เฉพาะที่ Netlify
  - เปลี่ยน **Database password**
  - ลบตัวแปรเหล่านี้ออกจาก environment ของ Claude (หรือเปลี่ยนเป็นค่าของ dev ที่แยกต่างหากถ้าต้องการให้ผมพัฒนาต่อหลังเปิดจริง — แนะนำให้สร้าง **โปรเจกต์ Supabase แยกสำหรับ dev** ตั้งแต่วันที่มีผู้ใช้จริง)
- [ ] **4. อัปเกรด Supabase เป็น Pro** (ไม่ถูกพักโปรเจกต์ + มี backup) · ตั้ง spend cap ตามต้องการ
- [ ] **5. Auth สำหรับ production**
  - ตั้ง **SMTP** ของตัวเอง แล้วเปิด **Confirm email**
  - **Site URL** / **Redirect URLs** เป็นโดเมนจริง (เอา `localhost` ออก)
  - Publish OAuth app ของ Google · Publish LINE Login channel
- [ ] **6. ตรวจ RLS** — ผมจะรันตรวจทุกตารางข้อมูลผู้ใช้ และรายงานผลให้คุณ
- [ ] **7. AI:** เปิด billing ของ Google AI (Gemini) · ตั้ง spend limit ของ Anthropic และ Google · ยืนยันว่าไม่ใช้ free tier กับข้อมูลสุขภาพจริง
- [ ] **8. ตั้งค่าจริงใน `platform_settings`:** ราคา, `trial_days`, PromptPay ID, ลิงก์คู่มือ/LINE OA
- [ ] **9. แพทย์ที่ปรึกษา** ตรวจ prompt, ช่วงค่าอ้างอิง และถ้อยคำสำคัญ
- [ ] **10. Smoke test บน production** — ผมจะ **ขออนุญาตคุณก่อน** (หรือส่งขั้นตอนให้คุณทดสอบเอง) ตามกฎข้อ 5
