# KNOWLEDGE — Telepharmacy (ปรึกษาเภสัชกรออนไลน์)

**ต้นแบบสำหรับโครงการอื่น · ลูกค้า / เภสัชกร / Admin · 2 โหมด: จองนัดล่วงหน้า + ขอคุยทันทีเมื่อเภสัชกรว่าง**

> อ้างอิงโค้ด PharmaLink (`pharmalink-popupfix.zip`) ที่ตรวจจริงเมื่อเขียนเอกสารนี้
> สัญลักษณ์: ✅ = **มีอยู่แล้วในโค้ด** (ตรวจแล้ว) · 🆕 = **ข้อเสนอ/ต้องสร้างเพิ่ม** (ยังไม่มีในโค้ด) · 🔒 = **ต้องให้คนตรวจ/อนุมัติ** (ยา/สุขภาพ/PDPA/rules/เงิน — ห้าม agent ตัดสินแทน)

---

## 0) สรุปสถานะ (อ่านก่อน)

| ส่วน                                    | สถานะ              | หมายเหตุ                                               |
| --------------------------------------- | ------------------ | ------------------------------------------------------ |
| โหมด A: จองวัน-เวลานัด + ลิงก์วิดีโอคอล | ✅ มีแล้ว (งาน C1) | ต่อยอดจากระบบ Booking                                  |
| โหมด B: ขอคุยทันทีเมื่อเภสัชกรว่าง      | 🆕 ยังไม่มี        | ต้องมี presence + คิวรอสาย + รับสาย                    |
| Role "เภสัชกร" (pharmacist)             | 🆕 ยังไม่มี        | ปัจจุบัน role = owner/manager/editor/marketing/support |
| หน้าทำงานของเภสัชกร                     | 🆕 ยังไม่มี        | ปัจจุบันเปิดห้องผ่านหน้า "การจอง" ของ staff            |
| บันทึกการปรึกษา (consult record)        | 🆕 ยังไม่มี        | ปัจจุบันมีแค่ `bookings` (status/videoLink)            |
| ความยินยอม PDPA / คำเตือนทางการแพทย์    | 🆕 ยังไม่มี        | 🔒 ต้องให้ฝ่ายกฎหมาย/เภสัชกรผู้รับอนุญาตเขียนข้อความ   |
| รายงานสำหรับ Admin                      | 🆕 ยังไม่มี        |                                                        |

**ข้อควรรู้ทันที (ข้อจำกัดของของเดิม ที่เจอตอนตรวจโค้ด):**

1. **ลิงก์ห้องเดาได้ง่ายกว่าที่ควร** — `booking.mjs` ใช้ `Math.random().toString(36).slice(2,8)` (6 ตัว) ต่อท้าย `PharmaLink-{bookingNo}-` และ `bookingNo` มาจาก `Date.now()` → ใครมีลิงก์ก็เข้าห้องได้ · แนะนำใช้ `crypto.randomBytes(12).toString('hex')` (ดูข้อ 7)
2. **ห้อง Jitsi สาธารณะ (`meet.jit.si`) — ต้องทดสอบจริงก่อนใช้งานจริง** · ผู้ให้บริการสาธารณะอาจเปลี่ยนเงื่อนไข (เช่น ให้ผู้เปิดห้อง/moderator ล็อกอินก่อน, จำกัดการใช้งาน) · ไม่มี SLA, ไม่มีบันทึก/ควบคุมสิทธิ์ผู้เข้าห้อง → ถ้าใช้จริงกับผู้ป่วยควรย้ายไป JaaS (8x8) / self-host Jitsi / ผู้ให้บริการอื่น (ดูข้อ 8) 🔒
3. **การจองไม่ใช่ transaction** — `booking.mjs` เช็ค `slotsForDate` แล้วค่อย `add()` → ถ้าสองคนกดพร้อมกัน อาจจองช่องเดียวกันเกิน `maxPerSlot` ได้ (ดูวิธีแก้ข้อ 5.4)
4. **เตือนนัดส่งเฉพาะ staff** — `booking-reminder.mjs` แจ้ง LINE ทีมร้านวันก่อนนัด ไม่ได้เตือน "ลูกค้า" (ระบบยังไม่เก็บ LINE userId/อีเมลลูกค้า)
5. `teleconsult` เป็น prop ระดับ **block** (ทุกบริการในบล็อกนั้นได้ห้องวิดีโอหมด) — แยกเป็นรายบริการไม่ได้

---

## 1) ภาพรวมสถาปัตยกรรม

```
                         ┌────────────────────────── Netlify Functions (firebase-admin) ───────────────────────┐
 ลูกค้า (เว็บ renderer)    │  booking-slots   booking   [🆕 consult-availability  consult-request  consult-status] │
  - บล็อก booking ────────▶│                                                                                       │
  - ปุ่ม "คุยตอนนี้"(🆕)    │  🆕 consult-claim   consult-end   consult-presence   consult-sweep(scheduled)          │
                         └───────────────▲──────────────────────────────┬───────────────────────────────────────┘
                                         │ Bearer ID token             │ lineNotify(event:'booking' | 🆕'consult')
 เภสัชกร/Admin (app.js)                  │                             ▼
  - ✅ หน้า "การจอง" (bookings.js)        │                       LINE push (_notify.mjs)
  - 🆕 หน้า "ห้องปรึกษา" (consult.js)  ───┘
                    │ onSnapshot (rules จำกัด role)
                    ▼
        Firestore  tenants/{tid}/ ── bookings ✅ · consults 🆕 · pharmacists 🆕 · settings/telepharmacy 🆕
        Video: Jitsi (✅ meet.jit.si ห้องต่อ booking)  ← ออกแบบให้สลับผู้ให้บริการได้ผ่าน provider adapter (ข้อ 8)
```

**หลักการออกแบบ (ใช้ซ้ำได้ทุกโครงการ):**

- **ฝั่ง public ห้ามอ่าน/เขียน Firestore ตรง** — ทุกอย่างผ่าน Function (ตรวจฝั่ง server) เหมือน `booking.mjs`
- **ฝั่งเจ้าหน้าที่** ยืนยันตัวตนด้วย `verifyBearer(req)` + ตรวจ `users/{uid}.role/tenantId` ฝั่ง server (แบบเดียวกับ `order-update.mjs`)
- **ข้อมูลสุขภาพเขียนโดย Function เท่านั้น** (`allow create/delete: if false` บน client) — เหมือน `bookings` ที่ `allow create: if false`
- **ห้ามใส่ลิงก์ห้อง / token / ข้อมูลลูกค้า ใน `site.draft` / `publishedSites`** (public read!) — เก็บใน `tenants/{tid}/...` เท่านั้น
- **ใช้ where-equality อย่างเดียว** บน public/role-limited query แล้ว sort ฝั่ง client (กฎ Firestore ของโปรเจกต์)
- เวลาใช้ **เวลาไทย** ผ่าน `nowTH()/todayTH()` ใน `_booking.mjs` (UTC+7) — ห้ามใช้ `new Date()` ตรง ๆ ใน server logic

---

## 2) ✅ สิ่งที่มีอยู่แล้ว — โหมด A (จองนัด + วิดีโอคอล)

### 2.1 ไฟล์ที่เกี่ยวข้อง (ตรวจแล้ว)

| ไฟล์                                                | หน้าที่                                                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/schema.js` (บล็อก `booking`)                    | prop: `services[]`, `days[]`, `start/end`, `slotMin`, `maxPerSlot`, **`teleconsult:false`**, `note`, `successMsg`                                           |
| `js/pages/editor.js` (~บรรทัด 746)                  | checkbox "💊 ปรึกษาเภสัชกรออนไลน์ (Telepharmacy)" → `data-path="…teleconsult"`                                                                              |
| `js/renderer.js` → `booking()` + runtime `<script>` | ฟอร์มจอง (บริการ/วัน/ช่วงเวลา/ชื่อ/เบอร์/หมายเหตุ) · เรียก `booking-slots` และ `booking` · แสดงกล่อง "ห้องปรึกษา + ปุ่มเข้าห้อง" หลังจองสำเร็จ              |
| `js/renderer.js` → `UI_TEXT`                        | key `bk_*` (ฟอร์มจอง) และ `tc_room / tc_note / tc_join` (ห้องปรึกษา) — th/en/zh                                                                             |
| `netlify/functions/_booking.mjs`                    | `findBookingBlock`, `nowTH/todayTH`, `genTimes`, `countTaken`, `slotsForDate`                                                                               |
| `netlify/functions/booking-slots.mjs`               | public — คืนช่วงเวลา + จำนวนที่เหลือของวันที่เลือก                                                                                                          |
| `netlify/functions/booking.mjs`                     | public — ตรวจคิวว่าง · สร้างเอกสารจอง · **สร้าง `videoLink` ถ้า `teleconsult`** · แจ้ง LINE (`event:'booking'`) · ตอบ `{bookingNo, videoLink}`              |
| `netlify/functions/booking-reminder.mjs`            | Scheduled `0 1 * * *` (08:00 ไทย) — LINE เตือน staff เรื่องนัดวันพรุ่งนี้                                                                                   |
| `js/pages/bookings.js`                              | หน้า "การจอง" (admin): แท็บ วันนี้/กำลังจะถึง/ทั้งหมด · modal รายละเอียด · **ช่อง ลิงก์ห้อง + ปุ่ม เข้าห้อง / คัดลอก / สร้างลิงก์ใหม่** · เปลี่ยนสถานะ · ลบ |
| `app.js`                                            | listener `tenants/{tid}/bookings` (orderBy createdAt, limit 300) → `state.bookings` · เมนู `bookings` อยู่หมวด `catalog`                                    |
| `firestore.rules` (`/bookings/{bid}`)               | read: owner/manager/support/marketing · update: เฉพาะ `status`,`videoLink` · create: **false** · delete: 4 role เดิม                                        |

### 2.2 โมเดลข้อมูล `tenants/{tid}/bookings/{id}` (ของเดิม)

```js
{
  bookingNo: 'BK' + Date.now().toString(36).toUpperCase(),
  slug, blockId, siteName,
  date: 'YYYY-MM-DD', time: 'HH:MM', service,
  customer: { name, phone, note },
  status: 'new' | 'confirmed' | 'done' | 'cancelled',
  teleconsult: boolean,
  videoLink: 'https://meet.jit.si/PharmaLink-{bookingNo}-{rand}' | '',
  reminded: false,
  createdAt: serverTimestamp
}
```

### 2.3 Flow โหมด A (ของเดิม)

1. Admin เปิด `teleconsult` ในบล็อก booking → **เผยแพร่เว็บใหม่** (เพราะแก้ props ที่ฝังใน renderer/JSON)
2. ลูกค้าเลือกบริการ + วัน → เว็บเรียก `booking-slots` (ตามวันเปิดรับ `days`, ตัดช่วงที่ผ่านไปแล้วของวันนี้, หักคิวที่ถูกจอง) → ลูกค้าเลือกช่วงเวลา กรอกชื่อ/เบอร์ → `booking`
3. server ตรวจซ้ำว่าช่องยังว่าง (ตอบ 409 + `refresh:true` ถ้าเต็ม) → บันทึก + สร้างห้อง + แจ้ง LINE
4. ลูกค้าเห็นเลขที่จอง + ปุ่ม "🎥 เข้าห้องปรึกษา" (ควรบันทึกลิงก์ไว้ — ระบบไม่ได้ส่งลิงก์ให้ลูกค้าทางอื่น)
5. ทีมงานเปิดหน้า "การจอง" → เปิด modal → กด "เข้าห้อง" ตามเวลานัด → เปลี่ยนสถานะเป็น "มาตามนัด (done)"

---

## 3) 🆕 โหมด B — ขอคุยทันทีเมื่อเภสัชกรว่าง (ข้อเสนอ)

### 3.1 แนวคิด

เภสัชกรกดสวิตช์ **"พร้อมรับสาย"** ในแอป → ระบบถือว่า "ว่าง" ตราบใดที่ยังส่ง heartbeat และไม่ได้อยู่ในสาย → เว็บลูกค้าแสดงปุ่ม **"ขอคุยกับเภสัชกรตอนนี้ 🟢"** · ถ้าไม่มีใครว่าง ปุ่มเปลี่ยนเป็น **"ไม่มีเภสัชกรว่าง — จองนัดแทน"** (เลื่อนไปฟอร์มจอง)

### 3.2 สถานะ "ว่าง" ต้องคำนวณฝั่ง server เท่านั้น

```
available = pharmacists ที่  online == true
                       และ  lastSeen ภายใน 120 วินาทีล่าสุด     // heartbeat ทุก 45–60 วิ
                       และ  activeConsultId == ''               // ไม่ได้อยู่ในสาย
                       และ  (ถ้าเปิด) อยู่ในช่วงเวลาให้บริการ settings/telepharmacy.instantHours
```

เหตุผล: ถ้าเภสัชกรปิดแท็บ/เน็ตหลุด `online` จะค้างเป็น true → ลูกค้ากดแล้วไม่มีคนรับ · ใช้ `lastSeen` เป็นตัวตัดสิน และ `consult-sweep` คอยเคลียร์

### 3.3 โมเดลข้อมูลใหม่

**`tenants/{tid}/pharmacists/{uid}`** (uid = Firebase Auth uid ของเภสัชกร)

```js
{
  displayName, photo: '',
  licenseNo: '',            // 🔒 เลขใบอนุญาตประกอบวิชาชีพ — เก็บเฉพาะที่ผู้ใช้ให้ · ห้ามแสดง/ตรวจสอบแทนคน
  licenseVerified: false,   // 🔒 owner ติ๊กเองหลังตรวจกับต้นทาง (สภาเภสัชกรรม) — ห้ามให้ระบบ auto-verify
  branchId: '', languages: ['th','en'],
  online: false, lastSeen: Timestamp,    // เขียนโดย consult-presence (server time)
  activeConsultId: ''                    // เขียนโดย consult-claim / consult-end
}
```

**`tenants/{tid}/consults/{id}`** (บันทึกการปรึกษา — เขียนโดย Function เท่านั้น)

```js
{
  mode: 'instant' | 'scheduled',
  bookingId: '',                 // ถ้า scheduled → id ของ bookings
  slug, blockId, siteName,
  status: 'waiting' | 'accepted' | 'done' | 'missed' | 'cancelled',
  customer: { name, phone },     // minimal เท่าที่จำเป็น
  topic: '',                     // หัวข้อสั้น ๆ (เลือกจากรายการ/พิมพ์สั้น) — ไม่เก็บอาการละเอียดใน field นี้
  consent: { accepted: true, version: 'v1', at: Timestamp },   // 🔒 ข้อความ+เวอร์ชันต้องผ่านการตรวจ
  pharmacistUid: '', pharmacistName: '',
  roomName: '', videoLink: '',   // roomName สุ่มด้วย crypto
  accessKeyHash: '',             // sha256 ของ key ที่ลูกค้าถือ (ไว้ poll สถานะ) — ห้ามเก็บ key ตรง ๆ
  createdAt, acceptedAt, endedAt, durationSec: 0,
  endReason: '',                 // 'completed' | 'customer_left' | 'timeout' | 'sweep'
  followUp: { referDoctor: false, suggestProducts: [] }   // 🔒 เนื้อหาที่เกี่ยวกับการสั่ง/แนะนำยาต้องให้เภสัชกรกรอกเอง
}
```

> บันทึกทางคลินิก (SOAP note, อาการ, ประวัติแพ้ยา, ยาที่ใช้อยู่) **ไม่อยู่ในขอบเขตเอกสารนี้** 🔒 — ถ้าจะเก็บ ต้องออกแบบแยกพร้อมนโยบาย PDPA/ระยะเก็บ/สิทธิ์เข้าถึง ให้คนอนุมัติก่อน

**`tenants/{tid}/settings/telepharmacy`** (ตั้งค่าโดย owner/manager)

```js
{
  enabled: true,
  instantEnabled: true, scheduledEnabled: true,
  instantHours: { days:[1,2,3,4,5,6], start:'09:00', end:'20:00' },   // ว่างเปล่า = ใช้ presence อย่างเดียว
  waitTimeoutSec: 180, maxWaiting: 3, maxCallMin: 30,
  provider: 'jitsi',                    // 'jitsi' | 'jaas' | 'custom'  (ข้อ 8)
  consentVersion: 'v1', consentText: { th:'', en:'', zh:'' },       // 🔒
  disclaimerText: { th:'', en:'', zh:'' },                         // 🔒 เช่น ไม่ใช่การวินิจฉัย/ฉุกเฉินโทร 1669
  notifyEvents: ['consult']             // ผูกกับ settings/notify.recipients
}
```

> ⚠️ rules เดิมของ `settings/{docId}` (ตรวจแล้ว): **read = owner/manager · write = owner เท่านั้น** (ยกเว้น `importMap`) → เอกสาร `telepharmacy` จะ "เขียนได้เฉพาะ owner" โดยอัตโนมัติ · ถ้าอยากให้ manager แก้ได้ ต้องเพิ่มข้อยกเว้น `docId == 'telepharmacy'` เหมือน `importMap` 🔒 · และ **เภสัชกรอ่าน settings ไม่ได้** → ให้ `consult-availability`/`consult-request` อ่านด้วย admin SDK แล้วส่งเฉพาะที่จำเป็น (เช่นข้อความตาม `lang`)
> ⚠️ `settings/*` ตามกฎโปรเจกต์ = server-only/credential → ถ้ามี key ของผู้ให้บริการวิดีโอ (JaaS app secret) ให้ใส่ที่นี่หรือ env เท่านั้น **ห้ามลง `site.draft`/renderer**

### 3.4 Functions ใหม่ (🆕) — สัญญา API

| Function               | ใคร                     | Input                                                     | ทำอะไร                                                                                                                                                                                                                                |
| ---------------------- | ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consult-availability` | public                  | `{slug, blockId}`                                         | คืน `{ok, enabled, available:n, waiting:n}` (ไม่คืนชื่อเภสัชกร) · cache ฝั่ง client 15–30 วิ                                                                                                                                          |
| `consult-request`      | public                  | `{slug, blockId, name, phone, topic, consent:true, lang}` | ตรวจ block เปิด `instantConsult` + มีคนว่าง + คิวรอไม่เกิน `maxWaiting` + ไม่มี `waiting` ซ้ำของเบอร์เดิม → สร้าง `consults` (`waiting`) + `roomName/videoLink` + `accessKey` → LINE `event:'consult'` → คืน `{consultId, accessKey}` |
| `consult-status`       | public (ถือ key)        | `{consultId, accessKey, slug}`                            | เทียบ hash → คืน `{status, videoLink?}` (ส่ง `videoLink` เฉพาะ `accepted`)                                                                                                                                                            |
| `consult-cancel`       | public (ถือ key)        | `{consultId, accessKey}`                                  | `waiting → cancelled`                                                                                                                                                                                                                 |
| `consult-presence`     | เภสัชกร (Bearer)        | `{online:boolean}` หรือ heartbeat `{ping:true}`           | ตรวจ role='pharmacist' (หรือ owner/manager ที่มีเอกสาร pharmacists) → เขียน `online/lastSeen` ด้วย server time                                                                                                                        |
| `consult-claim`        | เภสัชกร (Bearer)        | `{consultId}`                                             | **Firestore transaction**: ต้องเป็น `waiting` และเภสัชกรไม่ได้อยู่ในสายอื่น → `accepted` + `pharmacistUid` + `pharmacists/{uid}.activeConsultId` → คืน `videoLink`                                                                    |
| `consult-end`          | เภสัชกร (Bearer)        | `{consultId, reason, followUp?}`                          | `accepted → done`, คำนวณ `durationSec`, เคลียร์ `activeConsultId`                                                                                                                                                                     |
| `consult-sweep`        | Scheduled `*/5 * * * *` | —                                                         | `waiting` เกิน `waitTimeoutSec` → `missed` (+LINE "สายที่ไม่ได้รับ") · `accepted` เกิน `maxCallMin`+บัฟเฟอร์ → `done(endReason:'sweep')` · `lastSeen` เก่า → `online:false`                                                           |

**โครง `consult-claim` (สำคัญ — กันสองคนรับสายเดียวกัน):**

```js
import { initAdmin, adminDb, verifyBearer, json } from "./_fb.mjs";
export default async (req) => {
  if (req.method === "OPTIONS") return json({}, 204);
  if (!initAdmin()) return json({ ok: false }, 501);
  const user = await verifyBearer(req);
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);
  const { consultId } = await req.json().catch(() => ({}));
  const db = adminDb();
  const prof = (await db.doc(`users/${user.uid}`).get()).data();
  if (
    !prof?.tenantId ||
    !["pharmacist", "owner", "manager"].includes(prof.role)
  )
    return json({ ok: false, error: "ไม่มีสิทธิ์" }, 403);
  const tid = prof.tenantId;
  const cRef = db.doc(
    `tenants/${tid}/consults/${String(consultId)
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 60)}`,
  );
  const pRef = db.doc(`tenants/${tid}/pharmacists/${user.uid}`);
  try {
    const out = await db.runTransaction(async (tx) => {
      const [c, p] = await Promise.all([tx.get(cRef), tx.get(pRef)]);
      if (!c.exists || c.data().status !== "waiting") throw new Error("TAKEN"); // มีคนรับไปแล้ว/ยกเลิก
      if (!p.exists || p.data().activeConsultId) throw new Error("BUSY");
      tx.update(cRef, {
        status: "accepted",
        pharmacistUid: user.uid,
        pharmacistName: p.data().displayName || "",
        acceptedAt: new Date(),
      });
      tx.update(pRef, { activeConsultId: cRef.id });
      return c.data().videoLink;
    });
    return json({ ok: true, videoLink: out });
  } catch (e) {
    return json(
      {
        ok: false,
        error:
          e.message === "TAKEN"
            ? "มีเภสัชกรท่านอื่นรับสายนี้แล้ว"
            : e.message === "BUSY"
              ? "คุณอยู่ในสายอื่น"
              : "ผิดพลาด",
      },
      409,
    );
  }
};
export const config = { path: "/.netlify/functions/consult-claim" };
```

### 3.5 Flow โหมด B (ครบวงจร)

```
ลูกค้า                                   server                               เภสัชกร
  │ เห็นปุ่ม 🟢 (consult-availability)       │                                      │ เปิดสวิตช์ "พร้อมรับสาย" → presence + heartbeat
  │ กดปุ่ม → modal: คำเตือน + ยินยอม PDPA 🔒  │                                      │
  │ กรอกชื่อ/เบอร์/หัวข้อ → consult-request ─▶ ตรวจ available/คิว/ซ้ำ                │
  │                                         ├ สร้าง consults(waiting)+room+key      │
  │                                         ├ LINE event 'consult' (ไม่ใส่อาการ)     │
  │ ◀── {consultId, accessKey}              │                                      │
  │ หน้า "กำลังรอเภสัชกร…" (poll 3 วิ) + ปุ่มยกเลิก                                  │ onSnapshot(consults where status==waiting)
  │                                         │                                      │ → การ์ดเด้ง + เสียง + Notification
  │                                         │ ◀──────────── consult-claim ─────────┤ กด "รับสาย" (เปิดแท็บเปล่าก่อน await!)
  │ poll เห็น accepted → ปุ่มใหญ่ "เข้าห้อง"  │                                      │ เข้าห้อง Jitsi
  │ (ห้ามพึ่ง window.open อัตโนมัติ)          │                                      │ จบ → consult-end → done
  │ ถ้า missed/timeout → เสนอ "จองนัดแทน"     │ consult-sweep ทุก 5 นาที             │
```

**กับดักที่ต้องจำ (เคยเจอใน PharmaLink):**

- **Popup ถูกบล็อก**: `window.open` หลัง `await` จะถูก Chrome บล็อก → ฝั่งเภสัชกรให้ reserve แท็บก่อนเรียก `consult-claim` (แพทเทิร์นเดียวกับ `publishSite` ใน `sites.js`: `previewTab = window.open('', '_blank')` → `location.replace(url)` / `close()` ใน finally) · ฝั่งลูกค้าให้เป็น **ปุ่มใหญ่ให้กดเอง**
- **Modal เปิดแล้วปิด**: modal ยินยอม/รอสาย ใช้ `showModal` ตามแพทเทิร์นเดิม (มี popstate race + ghost-click guard) — อย่าเขียน modal ใหม่เอง
- **Polling**: ใช้ `setTimeout` ต่อเนื่องแบบ self-schedule + หยุดเมื่อ `status` เป็น terminal หรือ tab ซ่อน (`document.hidden` → ช้าลง) เพื่อประหยัด function invocations
- **เวลา**: เทียบ timeout ที่ server ด้วย server time เสมอ ไม่เชื่อ client

---

## 4) 🆕 ฝั่งลูกค้า (เว็บที่ renderer สร้าง)

### 4.1 ที่ที่ควรแก้ (reuse บล็อก `booking` ไม่สร้างบล็อกใหม่)

`consult-*` ใช้ `findBookingBlock(siteJson, blockId)` เดิมหา config ได้เลย → เพิ่ม prop ใน schema:

```js
// js/schema.js → booking
teleconsult: false,
instantConsult: false,          // 🆕 เปิดปุ่ม "คุยตอนนี้"
instantTopics: ['ทั่วไป','ยาที่ใช้อยู่','อาการเล็กน้อย','การใช้ยา/ผลข้างเคียง']   // 🆕 หัวข้อให้เลือก (ลดการพิมพ์อาการ)
```

และเพิ่ม checkbox ใน `editor.js` ใต้ช่อง teleconsult (แสดงเมื่อ `teleconsult` ติ๊กแล้ว)

### 4.2 UI ที่ต้องมี

1. **แถบบนบล็อกจอง**: จุดเขียว/เทา + ข้อความ "เภสัชกรว่าง ตอนนี้" / "ไม่มีเภสัชกรว่าง" + ปุ่ม **ขอคุยตอนนี้** (disabled เมื่อไม่ว่าง) — ข้างล่างเป็นฟอร์มจองนัดเดิม (= 2 โหมดอยู่ในกล่องเดียว)
2. **Modal ก่อนเริ่ม** (ลำดับสำคัญ):
   - คำเตือน: "บริการให้คำปรึกษาเบื้องต้น ไม่ใช่การวินิจฉัยหรือรักษา · กรณีฉุกเฉินโทร **1669**" 🔒 (ข้อความจริงต้องให้เภสัชกรผู้รับอนุญาต/กฎหมายอนุมัติ)
   - ช่องยินยอม PDPA (checkbox ต้องติ๊ก) + ลิงก์นโยบายความเป็นส่วนตัว 🔒
   - ชื่อ, เบอร์โทร, หัวข้อ (select จาก `instantTopics`)
3. **หน้ารอสาย**: spinner + "กำลังติดต่อเภสัชกร…" + นับเวลา + ปุ่ม "ยกเลิก" · เมื่อ `accepted` → การ์ด "เภสัชกร {ชื่อ} พร้อมแล้ว" + ปุ่มใหญ่ **เข้าห้องปรึกษา**
4. **Fallback**: `missed/cancelled/ไม่มีคนว่าง` → ข้อความ + ปุ่ม "จองนัดแทน" (เลื่อนไปฟอร์มจอง/prefill ชื่อ-เบอร์)
5. **หลังจองนัด (โหมด A)**: แสดงลิงก์ห้อง + แนะนำ "บันทึกลิงก์นี้" (✅ มีแล้ว) · 🆕 ควรเพิ่มปุ่ม "คัดลอกลิงก์ / เพิ่มลงปฏิทิน (.ics)"

### 4.3 i18n (ต้องทำครบ 3 ภาษา)

- ข้อความ UI ใหม่ทั้งหมด → เพิ่มใน `UI_TEXT` ของ `renderer.js` ด้วย prefix `tc_` (th/en/zh) เช่น
  `tc_now`, `tc_now_off`, `tc_avail`, `tc_busy`, `tc_consent`, `tc_warn`, `tc_topic`, `tc_waiting`, `tc_cancel`, `tc_ready`, `tc_missed`, `tc_book_instead`, `tc_emergency`
- ข้อความยินยอม/คำเตือนที่ admin กำหนดเอง: ถ้าเก็บใน `site` props ต้องดูว่า key อยู่ใน `TEXT_KEYS` ของ `translate-site.mjs` ไหม (**อย่าเพิ่ม `'name'`/`'items'` ใน TEXT/SKIP_KEYS ตามกับดักเดิม**) · ทางที่ปลอดภัยกว่า: เก็บ 3 ภาษาแยกใน `settings/telepharmacy` แล้วให้ `consult-availability` ส่งข้อความตาม `lang` กลับมา (ไม่ต้องแตะ translate-site)
- เพิ่มเคส `booking` ที่เปิด `instantConsult` ใน `tools/audits/audit_i18n.mjs` (ตอนนี้ fixture มี `teleconsult` แล้ว: บรรทัด ~65) เพื่อให้ audit ตรวจว่าไม่มีไทยหลุดในเว็บ EN/ZH
- **แก้ renderer = ต้องเผยแพร่เว็บ live ใหม่ทุกเว็บ** (renderer เป็น pure function)

---

## 5) 🆕 ฝั่งเภสัชกร

### 5.1 Role ใหม่ `pharmacist` — จุดที่ต้องแก้ (ครบทุกที่ ไม่งั้น role ใช้ไม่ได้/เมนูหาย)

| ไฟล์                              | แก้อะไร                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/core.js`                      | `ROLES.pharmacist = { label:'เภสัชกร (Pharmacist)', level:15 }` · เพิ่มใน `TENANT_ROLES`                                                                                                            |
| `firestore.rules` 🔒              | role list ในกฎ `users` (create invite บรรทัด ~46 / update role ~57 / invite create ~80) ต้องเพิ่ม `'pharmacist'` · เพิ่ม rule `consults`, `pharmacists` (ข้อ 6)                                     |
| `app.js` → `menusForRole`         | เพิ่มเมนู `consult` ("ห้องปรึกษา") ให้ `pharmacist`, `owner`, `manager` · เภสัชกรเห็นเมนูแค่ ภาพรวม + ห้องปรึกษา + การจอง(เฉพาะ teleconsult)                                                        |
| `app.js` → `CAT_OF` / `MENU_CATS` | map `consult` เข้าหมวด (เช่น เพิ่มหมวด `consult: 'ปรึกษาเภสัชกร'`) — id ที่ไม่อยู่ใน `CAT_OF` ตกหมวด `system` เอง (ไม่หาย แต่ควรจัดให้ถูก)                                                          |
| `app.js` → listener               | pharmacist: `query(collection(.../bookings), where('teleconsult','==',true))` (**ห้ามใส่ orderBy ปนกัน** → sort ฝั่ง client) · `consults` where `status in` ใช้ equality แยก query หรือ sort client |
| `js/pages/team.js`                | บล็อก "บทบาทและสิทธิ์" เพิ่มคำอธิบาย Pharmacist · modal เชิญ/เปลี่ยนบทบาทใช้ `TENANT_ROLES` อยู่แล้ว (เพิ่มแล้วขึ้นเอง)                                                                             |
| `netlify/functions/*`             | MANAGE_ROLES ของ function ใหม่ใส่ `pharmacist` เฉพาะที่เกี่ยวกับห้องปรึกษา (**อย่าเพิ่มให้ `order-update` ฯลฯ**)                                                                                    |
| ✅ ที่ไม่ต้องแก้                  | `CAN_EDIT_SITE`/`CAN_PUBLISH` (เภสัชกรไม่แก้/เผยแพร่เว็บ)                                                                                                                                           |

### 5.2 หน้า "ห้องปรึกษา" (`js/pages/consult.js` ใหม่) — ส่วนประกอบ

1. **สวิตช์ "พร้อมรับสาย"** (เรียก `consult-presence` + heartbeat `setInterval` 45–60 วิ · หยุดเมื่อออกจากหน้า/ปิดแท็บ → `pagehide` ส่ง `online:false` ด้วย `navigator.sendBeacon`/`fetch keepalive`)
2. **คิวรอสาย** (onSnapshot `consults` where `status=='waiting'`): การ์ดต่อสาย แสดงชื่อ/หัวข้อ/เวลารอ (นับสด) + ปุ่ม **รับสาย** · เสียงเตือน (ต้องมี user gesture ก่อนถึงเล่นได้ → ให้สวิตช์ "พร้อมรับสาย" เป็นตัว unlock audio) + `Notification` (ขออนุญาตตอนกดสวิตช์)
3. **สายปัจจุบัน**: ชื่อลูกค้า + ปุ่ม เปิดห้อง / ปุ่ม **จบการปรึกษา** (ฟอร์มสั้น: ส่งต่อแพทย์? — ไม่บังคับ) · จับเวลา
4. **นัดวันนี้** (โหมด A): ดึงจาก `bookings` `teleconsult==true` + `date==today` เรียงตามเวลา · ปุ่ม "เริ่มปรึกษา" (สร้าง/เชื่อม `consults` ที่ `bookingId`) — เปิดให้กดได้ตั้งแต่ ~10 นาทีก่อนนัด
5. **ประวัติของฉัน**: `consults` ที่ `pharmacistUid == uid` (สรุป วัน-เวลา ระยะเวลา สถานะ) — **ไม่แสดงบันทึกทางคลินิก** 🔒

### 5.3 กติกา "ว่าง/ไม่ว่าง"

- รับสายแล้ว → `activeConsultId` ถูกตั้ง → ไม่ถูกนับว่าง จน `consult-end`
- ปิดสวิตช์/ heartbeat ขาด >120 วิ → ไม่ว่างอัตโนมัติ
- เภสัชกรมีนัดโหมด A ใน ≤15 นาทีข้างหน้า → (ตัวเลือก) ไม่นับว่างสำหรับโหมด B เพื่อกันชนกับนัด

### 5.4 (แนะนำ) แก้การจองชนกันของของเดิม — ใช้ counter + transaction

```js
// booking.mjs: แทน countTaken + add() ด้วย transaction บน doc ตัวนับต่อช่วงเวลา
const lockRef = db.doc(
  `tenants/${tid}/slotLocks/${slug}_${blockId}_${date}_${time.replace(":", "")}`,
);
await db.runTransaction(async (tx) => {
  const s = await tx.get(lockRef);
  const used = s.exists ? s.data().count || 0 : 0;
  if (used >= maxPer) throw new Error("FULL");
  tx.set(lockRef, { count: used + 1 }, { merge: true });
  tx.set(db.collection(`tenants/${tid}/bookings`).doc(), {/* …เอกสารจอง… */});
});
// ยกเลิกคิว → ลด count ด้วย (ฝั่ง function ที่เปลี่ยน status=cancelled)
```

> rules ต้องเพิ่ม `slotLocks` เป็น `allow read, write: if false` (Function เท่านั้น) 🔒 · เป็นการแก้ logic การจอง/คิว → ให้คนตรวจก่อน deploy

---

## 6) 🆕 ฝั่ง Admin ของระบบ (owner/manager · superadmin)

### 6.1 Owner/Manager (ต่อ tenant)

| งาน                                                    | ที่ไหน                                            | รายละเอียด                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| เปิด/ปิด Telepharmacy                                  | `tsettings.js` → การ์ดใหม่ "ปรึกษาเภสัชกรออนไลน์" | `enabled / instantEnabled / scheduledEnabled` (เก็บ `settings/telepharmacy`)                                                                                                                  |
| ชั่วโมงให้บริการ + timeout + คิวสูงสุด + เวลาสายสูงสุด | เดียวกัน                                          | `instantHours`, `waitTimeoutSec`, `maxWaiting`, `maxCallMin`                                                                                                                                  |
| ข้อความคำเตือน/ยินยอม 3 ภาษา + เวอร์ชัน                | เดียวกัน 🔒                                       | แก้ข้อความ → **ต้อง bump `consentVersion`** เพื่อให้ `consults.consent.version` ตามรอยได้                                                                                                     |
| เชิญ/จัดการเภสัชกร                                     | `team.js`                                         | เชิญด้วย role `pharmacist` → เภสัชกรกรอก `licenseNo` → **owner กด "ยืนยันใบอนุญาต"** (ตั้ง `licenseVerified`) 🔒 · เภสัชกรที่ยังไม่ verified ไม่ควรถูกนับว่าง (เช็คใน `consult-availability`) |
| ผู้รับแจ้งเตือน                                        | `tsettings.js` (รายการ events ~บรรทัด 162)        | เพิ่ม `['consult','สายปรึกษาเภสัชกร']` ให้ผูกผู้รับ LINE ต่อประเภท (ใช้กลไก `settings/notify.recipients` เดิม) · เพิ่ม `'consult'` ในคอมเมนต์ event ของ `_notify.mjs` และ gate `notifyForm`   |
| ดูสายทั้งหมด + รายงาน                                  | `consult.js` (แท็บ "ภาพรวม" เฉพาะ owner/manager)  | จำนวนสาย/วัน, เวลารอเฉลี่ย, อัตราสายที่พลาด (`missed`), ระยะเวลาเฉลี่ย, แยกตามเภสัชกร/สาขา, ส่งออก CSV                                                                                        |
| ผูกสาขา                                                | `branches.js`                                     | `pharmacists.branchId` + (ตัวเลือก) LINE กลุ่มสาขาได้แจ้งเตือน (`lineNotify(..., branchId)` มีอยู่แล้ว)                                                                                       |

### 6.2 Superadmin (ระดับแพลตฟอร์ม)

- `platform/config` (public read — **ห้ามใส่ความลับ**): flag `telepharmacy.enabled` เพื่อเปิดเป็น "แพ็กเกจเสริม" ต่อ tenant · ข้อความมาตรฐานของแพลตฟอร์ม (default consent/disclaimer ให้ tenant ต่อยอด) 🔒
- `superadmin.js`: สวิตช์เปิด/ปิดให้ tenant (เช่นเก็บใน `tenants/{tid}.features.telepharmacy`) · การเก็บ/ลบข้อมูลเมื่อ tenant ถูกลบ ต้องรวม `consults`, `pharmacists`

### 6.3 Rules ที่เสนอ (🔒 ต้องให้คนตรวจก่อนเผยแพร่ `firestore.rules`)

```
// ---- ห้องปรึกษา — เขียนโดย Function เท่านั้น ----
match /consults/{cid} {
  allow read: if isSuper() || (inTenant(tid) && myRole() in ['owner','manager','pharmacist']);
  allow create, update, delete: if false;          // ไม่ให้ลบฝั่ง client — นโยบายเก็บ/ลบข้อมูลให้คนกำหนด
}
match /pharmacists/{uid} {
  allow read: if isSuper() || (inTenant(tid) && myRole() in ['owner','manager','pharmacist']);
  // เภสัชกรแก้ได้เฉพาะข้อมูลโปรไฟล์ของตัวเอง (ห้ามแตะ licenseVerified/online/activeConsultId)
  allow update: if (inTenant(tid) && request.auth.uid == uid
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName','photo','licenseNo','languages']))
                || (inTenant(tid) && myRole() in ['owner','manager']
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['licenseVerified','branchId']));
  allow create, delete: if isSuper() || (inTenant(tid) && myRole() in ['owner','manager']);
}
match /slotLocks/{lid} { allow read, write: if false; }
// bookings: เพิ่มให้ pharmacist อ่านเฉพาะที่เป็น teleconsult
//   allow read: if … || (inTenant(tid) && myRole()=='pharmacist' && resource.data.teleconsult == true);
```

> หมายเหตุสำคัญ: rule `read` ที่อาศัย `resource.data.teleconsult == true` **บังคับให้ query ฝั่ง client ต้องมี `where('teleconsult','==',true)`** ไม่งั้น Firestore ปฏิเสธทั้ง query · และห้ามให้ role `support/marketing` เห็นข้อมูลที่เพิ่มใหม่ของ `consults` โดยไม่ได้ตั้งใจ (ตอนนี้ rule เสนอจำกัดไว้ owner/manager/pharmacist)
> เพิ่ม/แก้ rules = เผยแพร่ `firestore.rules` + ให้ `tools/audits/check_rules.mjs` ผ่าน

---

## 7) ความปลอดภัย & ความเป็นส่วนตัว (ใช้ซ้ำได้ทุกโครงการ)

1. **ชื่อห้องและคีย์ต้องสุ่มด้วย crypto** — แทน `Math.random`:
   ```js
   import { randomBytes, createHash } from "node:crypto";
   const roomName = `PL-${randomBytes(12).toString("hex")}`; // ห้อง
   const accessKey = randomBytes(16).toString("hex"); // คีย์ให้ลูกค้าถือ
   const accessKeyHash = createHash("sha256").update(accessKey).digest("hex"); // เก็บเฉพาะ hash
   ```
   เทียบ key ด้วย `crypto.timingSafeEqual`
2. **ข้อมูลที่ส่ง LINE (บุคคลที่ 3)**: แจ้งแค่ "มีลูกค้ารอปรึกษา — เปิดแอปเพื่อรับสาย" + ชื่อต้น/หัวข้อ **ไม่ใส่อาการ/ประวัติ/เบอร์เต็ม** 🔒 (ของเดิม `booking.mjs` ส่งชื่อ+เบอร์+หมายเหตุเข้า LINE — ควรทบทวน)
3. **Minimal data**: เก็บเฉพาะชื่อ/เบอร์/หัวข้อสั้น · หมายเหตุอิสระ (`note`) ของลูกค้าอาจมีข้อมูลสุขภาพ → ใส่ข้อความเตือนไม่ให้ใส่ข้อมูลอ่อนไหวในช่องนี้
4. **Rate limit / กันสแปม**: จำกัด 1 สาย `waiting` ต่อเบอร์ · cooldown 60 วิหลังยกเลิก · honeypot field · (ตัวเลือก) Turnstile/reCAPTCHA · ตรวจ `Origin`/`slug` ว่าเว็บมีอยู่จริง
5. **Retention / สิทธิ์เจ้าของข้อมูล** 🔒: กำหนดระยะเก็บ `consults`, ช่องทางให้ลูกค้าขอดู/ลบข้อมูล, ใครเข้าถึงได้ — **ต้องให้คน (เจ้าของกิจการ/กฎหมาย) ตัดสิน** ก่อนใช้จริง
6. **ห้ามใส่ใน `publishedSites`/`site.draft`**: `videoLink`, `roomName`, token, ข้อมูลลูกค้า, ข้อความ consent ที่มีความลับ (consent text เป็นข้อความสาธารณะได้ แต่เก็บใน settings แล้ว serve ผ่าน function)
7. `CheckKit`: เพิ่ม audit ตรวจว่า (ก) rules ของ `consults/slotLocks` เป็น `create/update/delete: if false` (ข) ไม่มี `videoLink|roomName|accessKey` ใน `renderer.js` นอกจาก runtime ที่รับค่าจาก response (ค) function ใหม่ทุกตัวที่ใช้ Bearer เรียก `verifyBearer` และตรวจ role

---

## 8) ผู้ให้บริการวิดีโอ — ทำเป็น adapter เพื่อสลับได้

ปัจจุบัน ✅ ผูกกับ Jitsi สาธารณะ (สร้างลิงก์ใน 2 ที่: `booking.mjs` และ `bookings.js` ปุ่ม "สร้างลิงก์") → แนะนำรวมเป็นฟังก์ชันเดียวฝั่ง server:

```js
// netlify/functions/_video.mjs  (🆕)
export function makeRoom(provider, seed) {
  const room = `PL-${randomBytes(12).toString("hex")}`;
  if (provider === "jaas")
    return {
      room,
      url: `https://8x8.vc/${process.env.JAAS_APP_ID}/${room}?jwt=${signJaasJwt(room)}`,
    };
  if (provider === "custom")
    return { room, url: `${process.env.VIDEO_BASE_URL}/${room}` };
  return { room, url: `https://meet.jit.si/${room}` }; // ค่าเริ่มต้น (ดูข้อจำกัดข้อ 0.2)
}
```

| ตัวเลือก                                                                                                                                       | ข้อดี                                     | ข้อควรระวัง                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `meet.jit.si` (ปัจจุบัน)                                                                                                                       | ฟรี ไม่ต้อง key                           | สาธารณะ ไม่มี SLA/บันทึก/ควบคุมผู้เข้าห้อง · เงื่อนไข moderator อาจเปลี่ยน → **ทดสอบจริง** |
| JaaS (Jitsi as a Service)                                                                                                                      | JWT กำหนดสิทธิ์ moderator/ผู้ร่วม, มี SLA | ต้องสมัคร/มีโควตาฟรีจำกัด · ต้องเก็บ private key ใน env                                    |
| Self-host Jitsi                                                                                                                                | คุมข้อมูลเอง                              | ต้องดูแลเซิร์ฟเวอร์ + TURN                                                                 |
| Daily/Twilio/Agora/Zoom SDK                                                                                                                    | เสถียร ฟีเจอร์ครบ                         | มีค่าใช้จ่าย · ต้องผูก SDK/คีย์                                                            |
| ทางเลือกอื่นที่ใช้ได้ทันทีโดยไม่เขียนวิดีโอเอง: ให้เภสัชกรโทรกลับ/ใช้ LINE video call (เก็บ LINE userId ของลูกค้าผ่าน LINE Login — เป็นงานแยก) |

---

## 9) การแจ้งเตือน (ต่อยอด `_notify.mjs` ที่มีอยู่)

- event ใหม่ `'consult'` (ใช้กลไก recipients ต่อ event + LINE กลุ่มสาขาที่มีอยู่แล้ว)
- ข้อความตัวอย่าง: `🔔 มีลูกค้าขอปรึกษาเภสัชกร (รอ {n}) — เปิดแอป > ห้องปรึกษา เพื่อรับสาย` · `⚠️ สายไม่ได้รับ ({name}) รอเกิน {sec} วิ`
- 🆕 เตือนนัดล่วงหน้า **ถึงเภสัชกรที่ได้รับมอบหมาย** (ปัจจุบันแจ้งกลุ่มรวมวันก่อนนัด) และ 15 นาทีก่อนนัด (ต้องเพิ่ม scheduled function ถี่ขึ้น `*/5`)
- 🆕 เตือน "ลูกค้า": ต้องเก็บช่องทางติดต่อที่ลูกค้ายินยอม (LINE/อีเมล/SMS) — ปัจจุบันยังไม่มี → ทางเบื้องต้นคือ `.ics` + แสดงลิงก์ห้องบนหน้าจองสำเร็จ

---

## 10) 🔒 เส้นแบ่งที่ต้องให้ "คน" ตรวจ/อนุมัติ (สรุปรวม)

ระบบนี้แตะ **สุขภาพ/ยา/ข้อมูลส่วนบุคคลอ่อนไหว** — agent เตรียมโครง/โค้ดได้ แต่ต้องให้คนตัดสิน:

1. ข้อความ **คำเตือนทางการแพทย์** และ **หนังสือยินยอม PDPA** (ทุกภาษา) + ระบบเวอร์ชันความยินยอม
2. **ข้อกำหนดทางกฎหมายของการให้บริการเภสัชกรรมทางไกลในประเทศ/พื้นที่ที่ให้บริการ** (เช่น แนวปฏิบัติของสภาเภสัชกรรม/หน่วยงานกำกับ, ใครให้คำปรึกษาได้, ต้องมีใบอนุญาตอะไร, ข้อห้ามจ่ายยาควบคุม) — เอกสารนี้ **ไม่ได้ยืนยันข้อกฎหมายใด ๆ**
3. การ **ยืนยันใบอนุญาตเภสัชกร** (`licenseVerified`) — ต้องเป็นคนกดหลังตรวจกับต้นทาง
4. **Firestore rules** ทั้งหมดในข้อ 6.3 (สิทธิ์อ่านข้อมูลผู้ป่วย) และการเพิ่ม role ใหม่
5. **ระยะเก็บข้อมูล / การลบ / การส่งออก** ของ `consults` และสิทธิ์ของเจ้าของข้อมูล
6. ตรรกะ **แนะนำ/สั่งยา** ที่เชื่อมจากห้องปรึกษาเข้าตะกร้า (`followUp.suggestProducts`) — ห้ามให้ระบบแนะนำยาอัตโนมัติ · การคำนวณ **ปริมาณ/ขนาดยา** ไม่ควรอยู่ในระบบนี้เลย
7. **การชำระเงิน** ค่าปรึกษา (ถ้าเก็บ) ผ่าน PromptPay/ยอดเงิน → ใช้แพทเทิร์น `KNOWLEDGE_promptpay_dynamic_qr.md` แต่ **ยอดและเงื่อนไขคืนเงินต้องให้คนอนุมัติ**
8. ผู้ให้บริการวิดีโอที่ใช้กับผู้ป่วยจริง (ที่เก็บข้อมูล/การบันทึก/ข้ามประเทศ)

---

## 11) ลำดับการสร้าง (Phases) + Deploy

| Phase | งาน                                                                                              | ไฟล์หลัก                                          |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| T0    | แก้ของเดิม: crypto room/key, `_video.mjs` adapter, transaction จอง (5.4), ทบทวนข้อมูลที่ส่ง LINE | `booking.mjs`, `bookings.js`, `_booking.mjs`      |
| T1    | role `pharmacist` + rules + เมนู + listener + `team.js`                                          | `core.js`, `firestore.rules`, `app.js`, `team.js` |
| T2    | `settings/telepharmacy` + หน้าตั้งค่าใน tsettings + `consent`                                    | `tsettings.js`                                    |
| T3    | โหมด B ฝั่ง server: availability/request/status/cancel/presence/claim/end/sweep                  | `netlify/functions/consult-*.mjs`                 |
| T4    | หน้า "ห้องปรึกษา" ของเภสัชกร + นัดวันนี้ + ประวัติ                                               | `js/pages/consult.js`, `app.js`                   |
| T5    | UI ลูกค้า: แถบสถานะ + modal ยินยอม + หน้ารอสาย + fallback + i18n 3 ภาษา                          | `renderer.js`, `schema.js`, `editor.js`           |
| T6    | รายงาน Admin + ส่งออก CSV + audits ใหม่ (CheckKit)                                               | `consult.js`, `tools/audits/*`                    |

**Deploy checklist (ตามแพทเทิร์นโปรเจกต์):**

1. ลาก zip ขึ้น Netlify (functions ใหม่ auto-deploy · scheduled `consult-sweep` ต้องเปิด Scheduled Functions)
2. เผยแพร่ `firestore.rules` 🔒 (หลังคนตรวจ)
3. **แก้ `renderer.js`/`schema.js` → เผยแพร่เว็บ live ใหม่ทุกเว็บ**
4. ไม่แก้ `translate-site.mjs` → ไม่ต้องแปลเว็บใหม่ (ถ้าเพิ่ม key ที่ต้องแปลผ่าน AI → ต้อง "แปลทับ" EN/中文)
5. ตั้ง env ใหม่ (ถ้าใช้ JaaS/custom): `JAAS_APP_ID`, private key ฯลฯ ใน Netlify (ห้ามลง repo)
6. เพิ่มเภสัชกรผ่านหน้า "ทีมงาน" → เภสัชกรล็อกอิน → owner ยืนยันใบอนุญาต → ทดสอบสายจริง 2 อุปกรณ์

---

## 12) Checklist ทดสอบ

**โหมด A (จองนัด)**

- [ ] เปิด `teleconsult` → เผยแพร่ → จองสำเร็จได้ลิงก์ห้อง · ปิด → ไม่มีลิงก์
- [ ] จอง 2 คนพร้อมกันช่องเดียว (`maxPerSlot=1`) → คนที่สองได้ 409 (หลังทำ 5.4)
- [ ] ยกเลิกคิว → ช่องกลับมาว่าง
- [ ] ลิงก์ห้อง **เปิดได้จริง** บน `meet.jit.si` ทั้งฝั่งเภสัชกร/ลูกค้า และเภสัชกรเข้าก่อนได้ (ทดสอบเงื่อนไข moderator)

**โหมด B (ขอคุยทันที)**

- [ ] ไม่มีเภสัชกรออนไลน์ → ปุ่มเป็น "จองนัดแทน" · เปิดสวิตช์ → ปุ่มเขียวภายใน ~30 วิ
- [ ] ปิดแท็บเภสัชกรโดยไม่ปิดสวิตช์ → ภายใน ~2 นาทีเป็น "ไม่ว่าง"
- [ ] ลูกค้าไม่ติ๊กยินยอม → ส่งไม่ได้ (ทั้ง client และ server)
- [ ] เภสัชกร 2 คนกด "รับสาย" พร้อมกัน → ได้คนเดียว อีกคนเห็น "มีท่านอื่นรับแล้ว"
- [ ] ลูกค้ารอเกิน `waitTimeoutSec` → `missed` + เสนอจองนัด + แจ้ง LINE
- [ ] ลูกค้ายกเลิกระหว่างรอ → การ์ดเภสัชกรหายทันที
- [ ] Chrome: รับสายแล้วแท็บเปิดได้ (ไม่โดน popup block)
- [ ] เภสัชกรอยู่ในสาย → ไม่ถูกนับว่าง · จบสาย → กลับมาว่าง

**สิทธิ์/ความปลอดภัย**

- [ ] role `support/marketing/editor` เปิดหน้า consult ไม่ได้ และอ่าน `consults` ไม่ได้ (ทดสอบด้วยบัญชีจริง)
- [ ] เภสัชกรอ่าน `bookings` ได้เฉพาะ `teleconsult==true` · แก้ `licenseVerified` ตัวเองไม่ได้
- [ ] `grep` ไม่พบ `videoLink` ใน `publishedSites` JSON
- [ ] public function ไม่รั่วรายชื่อเภสัชกร/คิวของคนอื่น

**i18n**

- [ ] เว็บ EN/ZH: ปุ่ม/โมดัล/หน้ารอสาย/คำเตือน ไม่มีไทยหลุด · `audit_i18n.mjs` ผ่าน

**ก่อนส่งงานทุกครั้ง**

- [ ] `bash tools/run_checks.sh` ผ่านหมด (syntax + audits) · zip ต้องรวม `tools/` และไม่รวม `*.pdf node_modules package-lock.json`
- esbuild client: `esbuild <f> --outfile=/dev/null --format=esm` · functions: `esbuild <f> --bundle --platform=node --external:firebase-admin --external:firebase-admin/* --external:fflate --outfile=/dev/null`
- `renderer.js` มี inline `<script>` → ดึงออกมา esbuild เป็น iife แยกอีกชั้น

---

## 13) Porting — นำไปใช้ในโครงการอื่น

**ส่วนที่ใช้ซ้ำได้ตรง ๆ (generic):** `_booking.mjs` (slot engine) · แพทเทิร์น `findBookingBlock` · `verifyBearer`+ตรวจ role ฝั่ง server · `lineNotify` ต่อ event/สาขา · consult state machine (`waiting→accepted→done|missed|cancelled`) · presence+heartbeat+sweep · accessKey hash สำหรับ poll แบบไม่ล็อกอิน · rules "function เท่านั้นเขียน" · popup/modal guards

**ส่วนที่ต้องปรับตามโครงการ:**

| หัวข้อ              | PharmaLink                                      | โครงการอื่น                                                   |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| โครง tenant         | `tenants/{tid}/…` + `users/{uid}.tenantId/role` | ถ้าไม่ multi-tenant ตัด `tid` ออกจาก path                     |
| role                | `pharmacist`                                    | เปลี่ยนเป็น role ผู้ให้คำปรึกษา (ทนาย/ที่ปรึกษา/ผู้เชี่ยวชาญ) |
| ที่มา config        | บล็อก `booking` ใน site builder                 | ใส่ใน settings ตรง ๆ หรือหน้าเว็บของโครงการ                   |
| ข้อความเตือน/ยินยอม | เภสัชกรรม/PDPA                                  | ปรับตามกฎหมายของวงการนั้น 🔒                                  |
| การแจ้งเตือน        | LINE                                            | เปลี่ยนเป็น push/email/Slack ผ่าน adapter เดียว               |
| วิดีโอ              | Jitsi                                           | `_video.mjs` adapter                                          |
| เมนู/หมวด           | `menusForRole` + `CAT_OF`                       | เพิ่ม 1 บรรทัดใน `CAT_OF`                                     |

**ข้อควรระวังเมื่อ port:** ห้ามคัดลอกข้อความคำเตือน/ยินยอมของที่นี่ไปใช้ตรง ๆ · ตรวจ role list ใน rules ให้ครบทุกจุด (เคยมีหลายจุดที่ต้องแก้พร้อมกัน) · ยืนยันก่อนว่า Scheduled Functions เปิดอยู่ในแพลตฟอร์มปลายทาง

---

## 14) สรุปสั้น (TL;DR)

- ✅ **มีแล้ว**: จองนัด + ห้อง Jitsi อัตโนมัติ + แจ้ง LINE + หน้า "การจอง" ให้ staff เข้าห้อง
- 🆕 **ต้องสร้าง**: role เภสัชกร · presence/พร้อมรับสาย · คิวรอสาย+รับสายแบบ transaction · เก็บ `consults` · หน้า "ห้องปรึกษา" · UI ลูกค้า (ปุ่มคุยตอนนี้ + ยินยอม + รอสาย + fallback จองนัด) · ตั้งค่า/รายงาน Admin
- ⚠️ **ควรแก้ของเดิมก่อน**: สุ่มห้องด้วย crypto · ทดสอบ/ย้ายผู้ให้บริการวิดีโอ · จองแบบ transaction · ทบทวนข้อมูลที่ส่งเข้า LINE
- 🔒 **ต้องให้คนอนุมัติ**: ข้อความเตือน/PDPA · ข้อกฎหมายเภสัชกรรมทางไกล · ยืนยันใบอนุญาต · Firestore rules · ระยะเก็บข้อมูล · ตรรกะยา/การเงิน
