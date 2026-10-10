---
name: ekyc-iapp-firebase
description: Blueprint สำหรับสร้างระบบยืนยันตัวตน (eKYC) บน Firebase + Vanilla JS โดยใช้ iApp Technology API (liveness → OCR บัตรประชาชน/พาสปอร์ต → face match) ครอบคลุมฝั่งผู้ใช้ (ถ่ายรูปบนมือถือ/เดสก์ท็อป) และฝั่ง Admin (ตั้งค่า + คิวรีวิวเคส) พร้อมโครงข้อมูล PDPA, ความปลอดภัย, การแก้ปัญหาที่เจอจริง และ checklist นำไปใช้กับโครงการใหม่
---

# eKYC Skill — SkillConnect Blueprint

เอกสารนี้สรุปจากระบบที่ใช้งานจริงใน SkillConnect (Firebase Auth/Firestore/Functions v2 + Vanilla JS ES Modules, ไม่มี build step)
ใช้เป็นต้นแบบให้โครงการอื่นได้ทั้งชุด: ฝั่งผู้ใช้ (Customer) และฝั่งผู้ดูแลระบบ (Admin)

> สิ่งที่ทดสอบจริงแล้ว: Thai ID, Passport, มือถือ (Android/iOS กล้องหน้า-หลัง), เดสก์ท็อป (เลือกไฟล์)
> สิ่งที่ยัง **ไม่ได้ทำ** ใน SkillConnect (ดูหัวข้อ 11): live camera ด้วย getUserMedia, rate limit, rules ล็อกฟิลด์ verified

---

## 1. ภาพรวมสถาปัตยกรรม

```
[Browser]  ถ่าย/เลือกรูป → ย่อ+แปลงเป็น JPEG dataURL ทันที
    │  httpsCallable('ekycVerify', {docType, idImage, selfieImage})
    ▼
[Cloud Function ekycVerify]  (secret IAPP_API_KEY อยู่ฝั่ง server เท่านั้น)
    1) อ่านค่า config จาก  settings/ekyc  (Admin ตั้ง)
    2) Liveness  ← รูป selfie
    3) OCR       ← รูปเอกสาร (thai_id | passport)
    4) Face match← selfie เทียบรูปบนเอกสาร
    5) ตัดสิน pass/fail → เขียนผลแบบ "masked audit" ลง users/{uid}
    ▼
[Admin UI]  หน้า eKYC: เปิด/ปิด + ตั้งเกณฑ์ + คิวเคสที่ไม่ผ่าน (Approve/Reject)
```

หลักการออกแบบ (ห้ามเปลี่ยนถ้าไม่จำเป็น):
1. **API key ไม่อยู่ฝั่ง client** — ใช้ Cloud Function callable + `defineSecret`
2. **ไม่เก็บรูปจริง** (PDPA data minimization) — เก็บเฉพาะคะแนน, ชื่อ, เลขเอกสารแบบ mask, วันที่
3. **ฝั่ง server เป็นผู้ตัดสิน** pass/fail และเขียนสถานะเอง — client ส่งได้แค่รูป
4. **Admin ควบคุมได้ทั้งหมดโดยไม่ต้อง deploy**: เปิด/ปิด, ชนิดเอกสาร, เปิด/ปิดแต่ละขั้น, เกณฑ์คะแนน
5. **ผ่านอัตโนมัติ ไม่ผ่านเข้าคิวให้คนตัดสิน** (human-in-the-loop) ไม่ปฏิเสธแบบถาวรโดยอัตโนมัติ

---

## 2. ผู้ให้บริการ: iApp Technology eKYC API

- Base URL: `https://api.iapp.co.th`
- Auth: header `apikey: <KEY>`
- Request: `multipart/form-data` (Node 20 มี `FormData`/`Blob`/`fetch` ในตัว ไม่ต้องลง lib)
- ค่าใช้จ่าย: คิดเครดิตต่อการเรียก 1 ครั้ง (liveness + OCR + face = 3 เครดิตต่อการยืนยัน 1 ครั้ง) → ดูหัวข้อ 11 เรื่อง rate limit

| ขั้นตอน | Endpoint | field |
|---|---|---|
| Liveness (passive) | `/v3/store/ekyc/face-passive-liveness` | `file` |
| OCR บัตรประชาชนไทย (หน้า) | `/v3/store/ekyc/thai-national-id-card/front` | `file` |
| OCR พาสปอร์ต | ลองตามลำดับ: `/v3/store/ekyc/passport/v2` → `/v3/store/ekyc/passport` → `/v3/store/ekyc/passport/v1` | `file` |
| Face verification | `/v3/store/ekyc/face-verification` | `file1` (selfie), `file2` (รูปเอกสาร) |

**ข้อควรระวังที่เจอจริง**
- Face verification ต้องใช้ชื่อ field `file1`/`file2` — ใช้ `image1/image2` จะได้ HTTP **420**
- เอกสารของ iApp ระบุ path passport ไม่สอดคล้องกัน → ใช้ `iappPostFirst` ไล่ทีละ path ข้าม 404
- ถ้ารูปบัตรไม่ชัด/ไม่เต็มเฟรม จะได้ 420 `NO_ID_CARD_FOUND` (`detection_score` ต่ำ ~0.3-0.4) — เป็นปัญหาคุณภาพรูป ไม่ใช่บั๊ก
- ผล liveness: `predict` = `REAL|SPOOF`, ความน่าจะเป็นอยู่ใน `normalized.REAL` (หรือ `score`) — โค้ดรองรับหลายรูปแบบ response
- ผล face: `matched` (boolean) หรือเทียบ `score >= threshold`

---

## 3. โครงข้อมูล Firestore

(SkillConnect เป็น multi-tenant จึงอยู่ใต้ `tenants/{tid}/...` — โครงการ single-tenant ตัด prefix นี้ออก)

### 3.1 Config — `settings/ekyc` (Admin เขียน, สมาชิกอ่าน)
```js
{
  enabled: false,          // master switch
  thaiId: true,            // อนุญาตบัตรประชาชน
  passport: true,          // อนุญาตพาสปอร์ต
  liveness: true,          // ตรวจ selfie จริง/ปลอม
  faceMatch: true,         // selfie เทียบรูปเอกสาร
  livenessThreshold: 0.8,  // 0–1
  faceThreshold: 0,        // 0 = ใช้ค่า default ของ provider
  // ปรับได้โดยไม่ต้อง deploy (optional):
  faceFields: ['file1','file2'],
  passportPaths: ['/v3/store/ekyc/passport/v2', ...],
  updatedAt: <serverTimestamp>
}
```

### 3.2 ผลลัพธ์ — เขียนลง `users/{uid}` (โดย Cloud Function เท่านั้น)
```js
ekyc: {
  method: 'iapp', docType: 'thai_id'|'passport', pass: true|false,
  scores: { liveness: 0.97, ocr: 0.93, faceMatch: 87.2, faceThreshold: 70 },
  steps:  { liveness: true, ocr: true, faceMatch: true },   // false = ขั้นที่ไม่ผ่าน
  name: 'JOHN DOE', docNumberMasked: '•••••••1234', nationality: 'THA',
  at: <serverTimestamp>
},
verified: true|false,          // true เมื่อ pass
verifyStatus: 'approved' | 'ekyc_failed' | 'rejected' | 'submitted' | 'none'
```

`verifyStatus` ใช้ร่วมกับ flow ตรวจเอกสารบริษัทแบบมือเดิม:

| ค่า | ความหมาย | ใครตั้ง |
|---|---|---|
| `none` | ยังไม่ยืนยัน | default / admin revoke |
| `submitted` | ส่งเอกสารมือรอ admin | ผู้ใช้ |
| `ekyc_failed` | eKYC อัตโนมัติไม่ผ่าน → เข้าคิว | ฟังก์ชัน |
| `approved` | ผ่าน (อัตโนมัติ หรือ admin อนุมัติ) | ฟังก์ชัน / admin |
| `rejected` | admin ปฏิเสธ | admin |

**ไม่เก็บ**: รูป selfie, รูปเอกสาร, เลขเอกสารเต็ม, ที่อยู่, วันเกิด (ถ้าต้องใช้ ให้ตัดสินใจเรื่อง PDPA/retention ก่อน)

---

## 4. ฝั่ง Server — Cloud Function (Node 20, v2)

`functions/package.json` ไม่ต้องมี dependency เพิ่มสำหรับ eKYC (ใช้ `fetch/FormData/Blob` ของ Node 20)

ตั้ง secret ครั้งเดียว:
```bash
firebase functions:secrets:set IAPP_API_KEY
```

โค้ดต้นแบบ (ย่อจากของจริง; ตัด multi-tenant ออกให้เห็นแกน — ถ้าต้องการ tenant ให้ครอบด้วย `callerTenantActive(uid)` และใช้ path `tenants/${tid}/...`):

```js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const IAPP_API_KEY = defineSecret('IAPP_API_KEY');

const IAPP_BASE = 'https://api.iapp.co.th';
const EP = {
  thai_id:    '/v3/store/ekyc/thai-national-id-card/front',
  liveness:   '/v3/store/ekyc/face-passive-liveness',
  faceVerify: '/v3/store/ekyc/face-verification'
};
const PASSPORT_PATHS = ['/v3/store/ekyc/passport/v2', '/v3/store/ekyc/passport', '/v3/store/ekyc/passport/v1'];
const FACE_FIELDS_DEFAULT = ['file1', 'file2'];

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function b64ToBuffer(s) {                         // รับทั้ง dataURL และ base64 ล้วน
  if (!s) return null;
  const raw = String(s).includes(',') ? String(s).split(',').pop() : String(s);
  try { return Buffer.from(raw, 'base64'); } catch { return null; }
}
async function iappRaw(path, files) {
  const key = IAPP_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'eKYC provider not configured');
  const fd = new FormData();
  for (const f of files) fd.append(f.name, new Blob([f.buffer], { type: 'image/jpeg' }), f.name + '.jpg');
  const res = await fetch(IAPP_BASE + path, { method: 'POST', headers: { apikey: key }, body: fd });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { res, json, text };
}
function iappThrow(label, path, res, json, text) {
  // ส่งรายละเอียดจริงของ provider กลับไปแสดง (เช่น NO_ID_CARD_FOUND) — debug ง่ายมาก
  const detail = json && (json.message || json.error_message || json.detail || json.error);
  console.error('iApp error', label, path, res.status, String(text).slice(0, 300));
  throw new HttpsError('internal', `eKYC ${label} error (${res.status})${detail ? ': ' + detail : ''}`);
}
async function iappPost(path, files, label) {
  const r = await iappRaw(path, files);
  if (!r.res.ok) iappThrow(label, path, r.res, r.json, r.text);
  return r.json;
}
async function iappPostFirst(paths, files, label) {        // ข้าม 404 ลอง path ถัดไป
  let last = null;
  for (const p of paths) {
    const r = await iappRaw(p, files);
    if (r.res.status === 404) { last = { p, ...r }; continue; }
    if (!r.res.ok) iappThrow(label, p, r.res, r.json, r.text);
    return r.json;
  }
  if (last) iappThrow(label, last.p, last.res, last.json, last.text);
  throw new HttpsError('internal', `eKYC ${label} error (no endpoint)`);
}

exports.ekycVerify = onCall({ secrets: [IAPP_API_KEY], timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

  // ---- config (admin) ----
  const cfgSnap = await db.doc('settings/ekyc').get();
  const cfg = Object.assign(
    { enabled:false, thaiId:true, passport:true, liveness:true, faceMatch:true,
      livenessThreshold:0.8, faceThreshold:0, faceFields:FACE_FIELDS_DEFAULT },
    cfgSnap.exists ? cfgSnap.data() : {});
  if (!cfg.enabled) throw new HttpsError('failed-precondition', 'eKYC is disabled');

  // ---- validate input ----
  const { docType, idImage, selfieImage } = request.data || {};
  if (docType !== 'thai_id' && docType !== 'passport') throw new HttpsError('invalid-argument', 'Invalid docType');
  if (docType === 'thai_id' && !cfg.thaiId)   throw new HttpsError('failed-precondition', 'Thai ID disabled');
  if (docType === 'passport' && !cfg.passport) throw new HttpsError('failed-precondition', 'Passport disabled');
  const idBuf = b64ToBuffer(idImage), selfieBuf = b64ToBuffer(selfieImage);
  if (!idBuf) throw new HttpsError('invalid-argument', 'Document image required');
  if ((cfg.liveness || cfg.faceMatch) && !selfieBuf) throw new HttpsError('invalid-argument', 'Selfie image required');

  const reasons = [], scores = {}, steps = {};
  try {
    // 1) LIVENESS (selfie)
    if (cfg.liveness) {
      const r = await iappPost(EP.liveness, [{ name:'file', buffer:selfieBuf }], 'liveness');
      const realProb = num(r?.normalized?.REAL) ?? num(r?.data?.REAL) ??
        (String(r?.predict).toUpperCase() === 'REAL' ? num(r?.score) : (num(r?.score) != null ? 1 - num(r.score) : null));
      const live = String(r?.predict).toUpperCase() === 'REAL' && (realProb == null || realProb >= cfg.livenessThreshold);
      scores.liveness = realProb; steps.liveness = live;
      if (!live) reasons.push('liveness');
    }

    // 2) OCR (document)
    const ocr = docType === 'thai_id'
      ? await iappPost(EP.thai_id, [{ name:'file', buffer:idBuf }], 'ocr')
      : await iappPostFirst((cfg.passportPaths?.length ? cfg.passportPaths : PASSPORT_PATHS),
                            [{ name:'file', buffer:idBuf }], 'ocr');
    scores.ocr = num(ocr?.detection_score); steps.ocr = true;
    const rawNo = String(ocr?.id_number || ocr?.number || '');
    const ocrSafe = {
      name: ocr?.en_name || ocr?.th_name || ocr?.names || '',
      docNumberMasked: rawNo ? rawNo.replace(/.(?=.{4})/g, '•') : '',     // เก็บแค่ 4 ตัวท้าย
      nationality: ocr?.nationality || (docType === 'thai_id' ? 'THA' : '')
    };

    // 3) FACE MATCH (selfie vs document)
    if (cfg.faceMatch) {
      const ff = (Array.isArray(cfg.faceFields) && cfg.faceFields.length === 2) ? cfg.faceFields : FACE_FIELDS_DEFAULT;
      const r = await iappPost(EP.faceVerify, [{ name:ff[0], buffer:selfieBuf }, { name:ff[1], buffer:idBuf }], 'face match');
      const matched = r?.matched === true || (num(r?.score) != null && num(r?.threshold) != null && num(r.score) >= num(r.threshold));
      const thOk = !cfg.faceThreshold || (num(r?.score) != null && num(r.score) >= cfg.faceThreshold);
      const ok = matched && thOk;
      scores.faceMatch = num(r?.score); scores.faceThreshold = num(r?.threshold); steps.faceMatch = ok;
      if (!ok) reasons.push('face_match');
    }

    // 4) ตัดสิน + บันทึก (ไม่เก็บรูป)
    const pass = reasons.length === 0;
    const update = { ekyc: { method:'iapp', docType, pass, scores, steps, ...ocrSafe,
                             at: admin.firestore.FieldValue.serverTimestamp() } };
    if (pass) { update.verified = true; update.verifyStatus = 'approved'; }
    else      { update.verifyStatus = 'ekyc_failed'; }
    await db.doc(`users/${uid}`).set(update, { merge: true });

    return { ok:true, pass, reasons, scores, ocr: ocrSafe };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('ekycVerify', e);
    throw new HttpsError('internal', 'eKYC verification failed');
  }
});
```

จุดที่ตั้งใจ:
- **เข้า pass ต้อง `reasons.length === 0`** — ขั้นไหนปิดอยู่ก็ข้ามได้ ไม่ทำให้ fail
- **OCR สำเร็จ = ผ่าน** (ตรวจแค่ว่าอ่านเอกสารได้) — ถ้าอยากเข้มขึ้น ให้เพิ่มเงื่อนไขเช็ค `detection_score`, วันหมดอายุ (`en_expiry`), หรือเทียบชื่อกับโปรไฟล์
- ข้อความ error ของ provider ถูกส่งถึงผู้ใช้ตรงๆ (ผ่าน `HttpsError.message`) — ตั้งใจเพื่อ debug; ถ้าจะ production เข้มให้ map เป็นรหัสแล้วแปลเป็นข้อความที่เป็นมิตรฝั่ง client
- Region ของ Functions ต้องรองรับ (SkillConnect ใช้ `asia-southeast1` เพราะ Firestore อยู่ asia-southeast3 ที่ Functions ไม่รองรับ → ใช้ callable แทน Firestore trigger)

---

## 5. ฝั่ง Customer — Client (Vanilla JS)

### 5.1 Config จาก state (สดเสมอ)
```js
// core.js
export const DEFAULT_EKYC = { enabled:false, thaiId:true, passport:true, liveness:true, faceMatch:true,
                              livenessThreshold:0.8, faceThreshold:0 };
export function ekycConfig() { return { ...DEFAULT_EKYC, ...(state.ekyc || {}) }; }

// app.js — โหลดตอน login + onSnapshot ให้ Admin เปลี่ยนแล้วมีผลทันทีโดยไม่ refresh
async function loadEkyc() {
  try { const s = await getDoc(doc(db,'settings','ekyc')); if (s.exists()) state.ekyc = s.data(); } catch {}
}
onSnapshot(doc(db,'settings','ekyc'), s => { if (s.exists()) state.ekyc = s.data(); rerender(); });
```

### 5.2 Pipeline รูปภาพที่ "ไม่ทำให้มือถือพัง" (สำคัญที่สุดของฝั่ง client)

ปัญหาจริงที่เจอ: ถ่ายรูปจากกล้องมือถือ (รูปใหญ่ 10–50MB decode) แล้ว Android **เด้งแท็บ/รีเฟรชกลับ Dashboard โดยไม่มี error** หรือขึ้น "หน่วยความจำเหลือน้อย"
แก้ด้วยกติกา 4 ข้อ:
1. ย่อรูป **ทันทีที่เลือก** (ใน `change` event) ด้วย `createImageBitmap(file, {resizeWidth, resizeHeight})` — decoder ย่อระหว่าง decode, peak memory ≈ ขนาดเป้าหมาย
2. แปลงเป็น JPEG dataURL เล็กๆ (selfie 720px q0.7, เอกสาร 1280px q0.75) แล้ว **ทิ้ง `File`** (`input.value = ''`)
3. ปล่อย canvas ทันที (`canvas.width = canvas.height = 0`) และ `bitmap.close()`
4. **เรียงลำดับ: selfie ก่อน แล้วค่อยเอกสาร** (selfie เบากว่า, กล้องหลังหนักกว่า → ไม่ให้ภาพหนักสองใบค้างในหน่วยความจำพร้อมกัน)

```js
async function fileToScaledDataUrl(file, maxDim = 1100, quality = 0.72) {
  const encode = (bmp) => {
    let { width, height } = bmp;
    if (width > maxDim || height > maxDim) {
      const r = Math.min(maxDim / width, maxDim / height);
      width = Math.max(1, Math.round(width * r)); height = Math.max(1, Math.round(height * r));
    }
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d', { alpha:false }).drawImage(bmp, 0, 0, width, height);
    const url = c.toDataURL('image/jpeg', quality);
    c.width = c.height = 0;                       // คืนหน่วยความจำทันที
    return url;
  };
  if (typeof createImageBitmap === 'function') {
    try {
      let bmp;
      try { bmp = await createImageBitmap(file, { imageOrientation:'from-image', resizeWidth:maxDim, resizeHeight:maxDim, resizeQuality:'medium' }); }
      catch { bmp = await createImageBitmap(file, { imageOrientation:'from-image' }); }
      const out = encode(bmp); if (bmp.close) bmp.close(); return out;
    } catch {}
  }
  return new Promise((resolve, reject) => {       // fallback เบราว์เซอร์เก่า
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload  = () => { try { const o = encode(img); URL.revokeObjectURL(url); resolve(o); } catch (e) { reject(e); } };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}
```
> หมายเหตุ: `resizeWidth+resizeHeight` พร้อมกันอาจบีบอัตราส่วน (โค้ดเดิมยอมรับไว้เพราะ API ของ provider ทนได้ถ้ายังเห็นหน้า/บัตรชัด) — ถ้าต้องการเป๊ะ ให้อ่านขนาดจริงก่อนด้วย `createImageBitmap(file)` ตัวเล็ก หรือใช้ `Image` decode แล้วค่อยย่อ

### 5.3 UX ของ modal (ตัดสินใจจากข้อเสนอแนะผู้ใช้จริง)
- ปุ่มกำหนดเอง + `<input type="file" hidden>` — **อย่าใช้ native file input แสดงตรงๆ** เพราะหลังเลือกรูปจะขึ้น "ไม่ได้เลือกไฟล์ใด" ทั้งที่เรา clear ค่าไปแล้ว ผู้ใช้สับสน ให้แสดงสถานะของเราเอง ("กำลังเตรียมรูป…" / "รูปพร้อมแล้ว ✓" / "อ่านรูปไม่ได้ ถ่ายใหม่")
- `capture="user"` (selfie) และ `capture="environment"` (เอกสาร) → บนมือถือเปิดกล้อง, บนเดสก์ท็อปเปิดตัวเลือกไฟล์
- **Document type default = Passport** (ตามที่ผู้ใช้ SkillConnect ร้องขอ เพราะผู้ใช้ส่วนใหญ่เป็นแรงงานต่างชาติ) — ปรับตามตลาดของโครงการ
- ต้องติ๊ก **ความยินยอม (consent)** ก่อนกด Verify (PDPA)
- ผลลัพธ์: ผ่าน → banner สีเขียว + ปิด modal + callback; ไม่ผ่าน → แสดงเหตุผล (liveness / face match) แล้วแจ้งว่าจะส่งแอดมินรีวิว; error → แสดง message จาก server ตรงๆ

```js
export function ekycEnabled() { const c = ekycConfig(); return !!c.enabled && (c.thaiId || c.passport); }

export function ekycButton() {                       // คืน '' เมื่อ eKYC ปิด → ซ่อนทุกจุดเข้า
  if (!ekycEnabled()) return '';
  const done = state.profile?.ekyc?.pass;
  return done ? `<span class="badge badge-success">${t('ek_verified_badge')}</span>`
              : `<button class="btn-primary btn-sm" id="ekyc-start">${t('ek_verify_btn')}</button>`;
}
export function bindEkycButton(onDone) {
  const b = $('#ekyc-start'); if (b) b.addEventListener('click', () => openEkycModal(onDone));
}
```

ตัวเรียก callable (ส่วนสำคัญของ `openEkycModal`):
```js
let idImage = null, selfieImage = null;
const bindPicker = (inputId, btnId, statusId, maxDim, quality, set) => {
  const inp = $('#'+inputId), btn = $('#'+btnId), st = $('#'+statusId);
  btn.addEventListener('click', () => inp.click());
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0]; if (!f) return;
    st.textContent = t('ek_preparing');
    try {
      set(await fileToScaledDataUrl(f, maxDim, quality));
      try { inp.value = ''; } catch {}                 // ทิ้ง File ทันที
      btn.textContent = t('ek_change_photo');
      st.innerHTML = `<span style="color:var(--color-success)">${t('ek_photo_ready')}</span>`;
    } catch (e) { set(null); st.innerHTML = `<span>${t('ek_photo_failed')}</span>`; }
  });
};
if (needSelfie) bindPicker('ek-selfie','ek-selfie-btn','ek-selfie-status', 720, 0.7,  v => selfieImage = v);
bindPicker('ek-doc','ek-doc-btn','ek-doc-status', 1280, 0.75, v => idImage = v);

$('#ek-go').addEventListener('click', async () => {
  if (!$('#ek-consent').checked) return showToast(t('ek_need_consent'), 'warning');
  if (!idImage) return showToast(t('ek_need_doc'), 'warning');
  if (needSelfie && !selfieImage) return showToast(t('ek_need_selfie'), 'warning');
  $('#ek-go').disabled = true;
  try {
    const res = await httpsCallable(functions, 'ekycVerify')({ docType: $('#ek-doctype').value, idImage, selfieImage });
    const data = res.data || {};
    if (data.pass) { /* อัปเดต state.profile, ปิด modal, onDone() */ idImage = selfieImage = null; }
    else           { /* แสดง data.reasons แปลเป็นข้อความ */ }
  } catch (e) { /* แสดง e.message */ }
  finally { $('#ek-go').disabled = false; }
});
```

### 5.4 ผูกเข้ากับระบบ (Policy ต่อ role)

SkillConnect ใช้นโยบายนี้ (ปรับได้ตามโครงการ):

| Role | บังคับ eKYC? | พฤติกรรม |
|---|---|---|
| Worker (ผู้ทำงาน) | **สมัครใจ** | หางาน/สมัครงานได้ตามปกติ; eKYC เพิ่มความน่าเชื่อถือ (badge) |
| Employer / Training Provider | **บังคับก่อนใช้ฟังก์ชันสำคัญ** | โพสต์งาน/สร้างคอร์ส/ออกใบรับรอง ถูกล็อกจนกว่า `verified === true` |

Gate:
```js
export function needsVerification() {
  const p = state.profile || {};
  return (p.role === 'employer' || p.role === 'training_provider') && !p.verified;
}
export function verifyGate(container) {            // หน้าล็อก + ปุ่ม eKYC ในที่เดียว
  container.innerHTML = pageHeader(t('gate_locked_title')) + `
    <div class="card"><div class="card-body" style="text-align:center">
      <div style="font-size:2.5rem">🔒</div><p>${t('gate_locked_msg')}</p>
      ${ekycButton() ? `<div class="mt-3">${ekycButton()}</div>` : ''}
    </div></div>`;
  bindEkycButton(() => location.reload());
}
// ใช้ต้นฟังก์ชัน render หน้าที่ต้องล็อก:
export async function renderPostJob(container) { if (needsVerification()) return verifyGate(container); /* ... */ }
```
จุดแสดงปุ่ม eKYC: หน้าล็อก, หน้า Verification (ควบคู่การอัปโหลดเอกสารบริษัทแบบมือ), หน้าโปรไฟล์ผู้ทำงาน
**ทั้งสองทางเลือกอยู่ร่วมกัน**: eKYC อัตโนมัติ หรือ อัปโหลดเอกสารให้ admin อนุมัติเอง (fallback เมื่อ eKYC ปิด/ไม่ผ่าน)

---

## 6. ฝั่ง Admin

### 6.1 หน้าตั้งค่า eKYC (`renderEkycAdmin`)
เมนู: `nav_ekyc_admin` สำหรับ role `company_admin` (เฉพาะผู้ดูแลของ tenant/โครงการ)

องค์ประกอบ:
- สวิตช์หลัก **Enable eKYC**
- ติ๊กชนิดเอกสาร: Thai ID / Passport
- ติ๊กขั้นตอน: Liveness / Face match
- ช่องตัวเลข: Liveness threshold (0–1, step 0.05), Face threshold (0 = ค่า default ของ provider)
- ข้อความเตือน: API key ตั้งที่ server (`firebase functions:secrets:set IAPP_API_KEY`) — **ไม่มีช่องกรอก key ใน UI**
- บันทึก: `setDoc(settings/ekyc, {...}, {merge:true})` + อัปเดต `state.ekyc` (คนอื่นที่เปิดอยู่ได้ผ่าน onSnapshot)

```js
const next = {
  enabled: $('#ek-enabled').checked,
  thaiId: $('#ek-thai').checked, passport: $('#ek-pass').checked,
  liveness: $('#ek-live').checked, faceMatch: $('#ek-face').checked,
  livenessThreshold: Math.max(0, Math.min(1, Number($('#ek-live-th').value) || 0)),
  faceThreshold: Math.max(0, Number($('#ek-face-th').value) || 0),
  updatedAt: serverTimestamp()
};
await setDoc(doc(db,'settings','ekyc'), next, { merge:true });
state.ekyc = next;
```

### 6.2 คิวรีวิวเคสที่ไม่ผ่าน (Review Queue)
อยู่ในหน้าเดียวกัน (การ์ดที่ 2) — ให้คนตัดสินเคสที่ AI ไม่ผ่าน (เช่น แสงไม่ดี หน้าไม่ตรงเพราะรูปบัตรเก่า)

Query: `where('verifyStatus','==','ekyc_failed')` บน `users` (field เดียว ไม่ต้องสร้าง index)

แต่ละแถวแสดง: ชื่อ/อีเมล, role, ชนิดเอกสาร, ชื่อจาก OCR, เลขเอกสารแบบ mask, **คะแนน** (`liveness 0.42 · face 61 · ocr 0.93`), **ขั้นที่ไม่ผ่าน** (จาก `steps` ที่เป็น `false`), เวลาที่ทำ
ปุ่ม:
- **Approve** → `{ verified:true, verifyStatus:'approved' }`
- **Reject** (มี confirm) → `{ verified:false, verifyStatus:'rejected' }`
แล้วโหลดคิวใหม่

> Admin เห็นเฉพาะคะแนน/ข้อมูล mask — ไม่มีรูปให้ดู (เพราะไม่ได้เก็บ). ถ้าโครงการต้องการให้คนดูรูปเอง ต้องออกแบบ storage ที่เข้ารหัส + retention + audit log แยกต่างหาก (ไม่ใช่ default ของ blueprint นี้)

เสริมที่ SkillConnect มีอยู่แล้ว: หน้า "ผู้ใช้" ของ admin มีปุ่ม Approve/Revoke Verified แบบมือ (ใช้กับเอกสารบริษัท) — สถานะทั้งหมดไหลมารวมที่ `verified` / `verifyStatus` เดียวกัน

---

## 7. i18n Keys (คัดลอกไปใช้ได้ทั้งชุด)

ทุก key มี `en` เป็นฐาน (fallback) และเติม `th`/ภาษาอื่นตามต้องการ

| กลุ่ม | Keys |
|---|---|
| Admin config | `nav_ekyc_admin` `ek_title` `ek_sub` `ek_master` `ek_doctypes` `ek_thai_id` `ek_passport` `ek_liveness` `ek_facematch` `ek_live_threshold` `ek_face_threshold` `ek_save` `ek_saved` `ek_key_note` |
| Admin queue | `ek_review_title` `ek_review_sub` `ek_no_failed` `ek_scores_label` `ek_did_not_pass` `ek_approve` `ek_reject` `ek_approved_ok` `ek_rejected_ok` |
| User flow | `ek_verify_btn` `ek_verified_badge` `ek_modal_title` `ek_choose_doc` `ek_doc_thai` `ek_doc_passport` `ek_capture_doc` `ek_capture_selfie` `ek_consent` `ek_submit` `ek_verifying` `ek_pass` `ek_fail` `ek_fail_liveness` `ek_fail_face_match` `ek_error` `ek_disabled` |
| ขั้นตอนรูป | `ek_add_photo` `ek_change_photo` `ek_preparing` `ek_photo_ready` `ek_photo_failed` `ek_need_doc` `ek_need_selfie` `ek_need_consent` |
| Gate | `gate_locked_title` `gate_locked_msg` |

ตัวอย่างข้อความภาษาอังกฤษหลักที่ใช้: "Identity Verification (eKYC)", "Enable eKYC for users", "Liveness check (anti-spoof selfie)", "Face match (selfie vs document)", "Take / choose photo", "Photo ready ✓", "I consent to identity verification using my document and selfie image for KYC purposes."

---

## 8. ความปลอดภัยและ PDPA

**ที่ทำแล้ว**
- API key เป็น Secret Manager (`defineSecret`) ไม่ลงโค้ด/ไม่ส่ง client
- ฟังก์ชันตรวจ `request.auth`, ตรวจ config (`enabled`), ตรวจชนิดเอกสารที่อนุญาต
- (multi-tenant) `callerTenantActive` — tenant ที่ถูกระงับ/หมดอายุเรียกไม่ได้; อ่าน config จาก tenant ของผู้เรียกเอง
- ไม่เก็บรูปและเลขเอกสารเต็ม; มี consent checkbox
- ผลตัดสินเขียนโดย server (Admin SDK)

**ช่องโหว่ที่ต้องปิดก่อน production (ตรวจจาก rules ปัจจุบันของ SkillConnect)**

1. ❗ **Firestore rules ให้ผู้ใช้แก้เอกสารของตัวเองได้ทุกฟิลด์** (`allow update: if request.auth.uid == uid || ...`) →
   ผู้ใช้เปิด DevTools แล้วเขียน `verified:true` / `ekyc.pass:true` (และแม้แต่ `role:'company_admin'`) ให้ตัวเองได้ ซึ่งทำให้ eKYC และ role gate ไร้ความหมาย
   แนวทางแก้ — จำกัดฟิลด์ที่เจ้าของแก้เองได้:
   ```
   function protectedKeys() { return ['verified','ekyc','role','disabled','status']; }
   match /users/{uid} {
     allow update: if isSignedIn() && (
       isCompanyAdmin(tid) || isPlatformAdmin() ||
       ( request.auth.uid == uid
         && !request.resource.data.diff(resource.data).affectedKeys().hasAny(protectedKeys())
         // verifyStatus: เจ้าของเปลี่ยนได้เฉพาะเป็น 'submitted' (ส่งเอกสารบริษัท)
         && ( !request.resource.data.diff(resource.data).affectedKeys().hasAny(['verifyStatus'])
              || request.resource.data.verifyStatus == 'submitted' ) )
     );
   }
   ```
   ฟังก์ชันฝั่ง server ใช้ Admin SDK จึงไม่ติด rules; ต้องทดสอบหน้า profile ที่ผู้ใช้บันทึกตัวเองว่ายังเขียนได้ (อย่าส่งฟิลด์ที่ถูกล็อกมาใน payload)
2. **ไม่มี rate limit** — ผู้ใช้ที่ล็อกอินเรียก `ekycVerify` ซ้ำได้เรื่อยๆ ทำให้เครดิต iApp หมด → เพิ่มตัวนับ `ekyc.attempts` + `lastAttemptAt` ใน transaction, จำกัด เช่น 5 ครั้ง/วัน/ผู้ใช้ และไม่ให้เรียกซ้ำถ้า `verified` แล้ว
3. **ไม่จำกัดขนาด payload** — เช็ค `idBuf.length` / `selfieBuf.length` (เช่น ≤ 2MB) ก่อนเรียก provider
4. **Gallery spoof (เดสก์ท็อป/มือถือ)**: `<input capture>` เป็นแค่ "คำแนะนำ" เบราว์เซอร์ — ผู้ใช้เลือกรูปคนอื่นจาก gallery ได้ แม้ passive liveness ช่วยกรองรูปถ่ายซ้ำ/จอ แต่ไม่ 100% → ข้อแนะนำ: ใช้ `getUserMedia` ถ่ายสดในหน้า (วาด video → canvas → JPEG) สำหรับ selfie แล้วปิดทางเลือกไฟล์ (ดูหัวข้อ 11)
5. ตัดสินใจ retention ของ `ekyc.name`/`docNumberMasked` (ยังเป็นข้อมูลส่วนบุคคล) และเปิดให้ผู้ใช้ขอลบได้

---

## 9. Deploy Checklist

```bash
# 1) ตั้ง secret (ครั้งเดียว)
firebase functions:secrets:set IAPP_API_KEY

# 2) ติดตั้ง dependency ของ functions (node_modules ไม่ได้อยู่ใน zip)
cd functions && npm install && cd ..

# 3) deploy
firebase deploy --only functions,firestore:rules

# 4) deploy เว็บ (Netlify/Hosting) แล้ว Hard refresh — Service Worker cache เก่าอาจค้าง
```
จากนั้น: Admin เข้าเมนู **Identity (eKYC)** → ติ๊ก Enable → Save → ให้ผู้ใช้ทดสอบ

ข้อควรจำ: ถ้าขึ้น "Couldn't find firebase-functions package" ตอน deploy = ยังไม่ได้ `npm install` ใน `functions/`

---

## 10. Troubleshooting (เจอจริงทั้งหมด)

| อาการ | สาเหตุ | แก้ |
|---|---|---|
| มือถือเด้งกลับ Dashboard / "หน่วยความจำเหลือน้อย" หลังถ่ายรูป | decode รูปเต็ม + ถือ File ค้าง | หัวข้อ 5.2: ย่อด้วย `createImageBitmap` ทันที, ทิ้ง File, selfie ก่อน |
| `eKYC face match error (420)` | field name ผิด (`image1/image2`) | ใช้ `file1`/`file2` (`faceFields` ตั้งจาก settings ได้) |
| `eKYC ocr error (420): NO_ID_CARD_FOUND` (`detection_score` ~0.39) | รูปบัตรไม่เต็มเฟรม/เบลอ/แสงไม่พอ | ให้ผู้ใช้ถ่ายบัตรเต็มเฟรม วางบนพื้นเรียบ แสงพอ ไม่สะท้อน; ไม่ใช่บั๊ก |
| `eKYC ocr error (404)` ตอนเลือก Passport | path พาสปอร์ตของ iApp ไม่ตรงเอกสาร | `iappPostFirst` ไล่ v2 → ไม่มี version → v1 (ตั้ง `passportPaths` ใน settings ได้) |
| เลือก "Thai ID" แต่ส่งพาสปอร์ต (หรือกลับกัน) | ผู้ใช้เลือกชนิดเอกสารผิด | ตั้ง default ให้ตรงกลุ่มผู้ใช้; เตือนใน UI |
| Face did not match บนเดสก์ท็อป | รูปบัตรเก่า/ขนาดหน้าเล็ก/แสงต่างกัน | ตั้ง `faceThreshold = 0` (ใช้ค่า provider), ถ่ายใหม่ให้ชัด, ปล่อยเข้าคิว admin |
| ช่องไฟล์ขึ้น "ไม่ได้เลือกไฟล์ใด" แต่สถานะว่า Photo Ready | เรา clear `input.value` เพื่อคืนหน่วยความจำ | ซ่อน input, ใช้ปุ่มกำหนดเอง + สถานะของเราเอง |
| เปลี่ยน config แล้วผู้ใช้ไม่เห็นผล | Service Worker cache / ไม่มี listener | `onSnapshot(settings/ekyc)` + hard refresh หลัง deploy |
| ผู้ใช้ผ่านทั้งที่ไม่ได้ทำ eKYC | rules ปล่อยให้แก้ `verified` เอง | หัวข้อ 8 ข้อ 1 |

เคล็ดลับ debug: ดู Cloud Function logs (`console.error('iApp error', label, path, status, body)`) — ข้อความ error จริงของ provider อยู่ในนั้นและถูกส่งถึง UI ด้วย

---

## 11. Roadmap / สิ่งที่แนะนำเพิ่ม (ยังไม่ได้ทำใน SkillConnect)

1. **Live selfie ด้วย `getUserMedia`** — กัน gallery spoof และคุมคุณภาพภาพ (กรอบหน้า, แจ้งเตือนแสงน้อย) ทำเป็นขั้น selfie อย่างเดียวแล้ว fallback เป็น file input ถ้าไม่ได้สิทธิ์กล้อง
2. **Rules lock ฟิลด์ verified/role** (หัวข้อ 8) — ควรทำก่อนเปิดใช้จริง
3. **Rate limit + payload cap** ในฟังก์ชัน
4. **บังคับ eKYC ของ Worker** ก่อนกดสมัครงาน (ตอนนี้สมัครใจ) — เป็นนโยบายธุรกิจ ปรับที่ `needsVerification()`
5. **ตรวจเงื่อนไขเพิ่ม**: บัตร/พาสปอร์ตหมดอายุ, เทียบชื่อ OCR กับ `displayName`, ตรวจอายุขั้นต่ำ
6. **Audit log แยก collection** (`ekycLogs`) เก็บเหตุการณ์ approve/reject ของ admin (ใครทำ เมื่อไร)
7. **แจ้งเตือนผู้ใช้** เมื่อ admin approve/reject (ใช้ระบบ notify เดิม)
8. **Pagination** ของคิวรีวิวเมื่อเคสเยอะ

---

## 12. Adoption Checklist — นำไปใช้กับโครงการใหม่

- [ ] สมัคร iApp Technology, ขอ API key, ตรวจเครดิต/ราคาต่อการเรียก
- [ ] สร้าง Firebase project (Auth + Firestore + Functions v2); เลือก region ของ Functions ให้ถูกต้อง
- [ ] `firebase functions:secrets:set IAPP_API_KEY`
- [ ] คัดลอก `ekycVerify` + helper (หัวข้อ 4); ตัด/ปรับ tenant prefix ตามโครงการ
- [ ] เพิ่ม `settings/ekyc` + rules (สมาชิกอ่าน, admin เขียน)
- [ ] **ล็อกฟิลด์ `verified`, `ekyc`, `verifyStatus`, `role` ใน rules ของ users** (หัวข้อ 8)
- [ ] ฝั่ง client: `core.js` (DEFAULT_EKYC/ekycConfig), `fileToScaledDataUrl`, `ekycButton/bindEkycButton/openEkycModal`, `needsVerification/verifyGate`
- [ ] ฝั่ง admin: `renderEkycAdmin` (config + review queue) + ใส่เมนู
- [ ] เพิ่ม i18n keys ทั้งชุด (หัวข้อ 7) + ข้อความ consent ตามกฎหมายของประเทศเป้าหมาย
- [ ] กำหนดนโยบายต่อ role (ใคร "บังคับ" ใคร "สมัครใจ") และ default document type
- [ ] เพิ่ม rate limit + payload cap
- [ ] ทดสอบจริง: มือถือ Android + iOS (กล้องหน้า/หลัง), เดสก์ท็อป, บัตรไทย, พาสปอร์ต, รูปมัว (ต้อง 420 แล้วแสดงข้อความ), เคส fail เข้าคิว, admin approve/reject
- [ ] deploy functions+rules แล้ว hard refresh เว็บ (Service Worker)
- [ ] ทบทวน PDPA: privacy notice, consent, retention, ช่องทางขอลบข้อมูล

---

## ภาคผนวก — ไฟล์ที่เกี่ยวข้องใน SkillConnect

| ไฟล์ | ส่วนที่เกี่ยวกับ eKYC |
|---|---|
| `functions/index.js` | `ekycVerify` + `iappRaw/iappPost/iappPostFirst/iappThrow/b64ToBuffer/num`, secret `IAPP_API_KEY` |
| `js/pages-shared.js` | `fileToScaledDataUrl`, `ekycEnabled`, `ekycButton`, `bindEkycButton`, `openEkycModal`, `needsVerification`, `verifyGate` |
| `js/pages-admin.js` | `renderEkycAdmin` (config + review queue), ปุ่ม verify/unverify ใน `renderUsers` |
| `js/pages-employer.js`, `pages-training.js` | เรียก `needsVerification()/verifyGate()` ในหน้าโพสต์งาน/สร้างคอร์ส/ออกใบรับรอง, ปุ่ม eKYC ในหน้า Verification |
| `js/core.js` | `DEFAULT_EKYC`, `ekycConfig()`, `state.ekyc` |
| `js/app.js` | `loadEkyc()` + `onSnapshot(settings/ekyc)` |
| `js/i18n.js` | ชุดคีย์ `ek_*`, `nav_ekyc_admin` |
| `firestore.rules` | `settings/{docId}` (admin เขียน), `users/{uid}` (ควรเข้มขึ้น — หัวข้อ 8) |
