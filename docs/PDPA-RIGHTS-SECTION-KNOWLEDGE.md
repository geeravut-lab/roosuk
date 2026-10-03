# Knowledge: ส่วน "สิทธิของคุณตามกฎหมาย" — ต้นแบบสำหรับโปรเจกต์ใหม่

เอกสารนี้สรุปการสร้างสามการ์ดในหน้าตั้งค่าของ youngwai ที่ทำให้ผู้ใช้ใช้สิทธิตาม
พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 ได้ด้วยตัวเอง ไม่ต้องอีเมลขอ ไม่ต้องรอแอดมิน
เขียนไว้ให้ใช้เป็น context ตั้งต้นเวลาสร้างฟีเจอร์เดียวกันนี้ในโปรเจกต์อื่น

**โปรเจกต์ต้นทาง:** youngwai (Vanilla JS + ES Modules, Firebase, Netlify)
**ขอบเขต:** การ์ด "สิทธิของคุณตามกฎหมาย" + "ที่เก็บข้อมูลของคุณ" + "พื้นที่อันตราย"
ในหน้า `js/pages/settings.js`

---

## 1. หลักคิดเบื้องหลัง (อ่านก่อนเอาไปใช้)

> สิทธิที่ต้องส่งอีเมลขอแล้วรอตอบ คือสิทธิที่ใช้จริงไม่ได้

ทุกปุ่มในสามการ์ดนี้ต้อง**ทำงานทันทีที่กด** ไม่มีขั้นตอน "ส่งคำขอแล้วรอแอดมินอนุมัติ"
เพราะกฎหมายให้สิทธิเจ้าของข้อมูลเข้าถึง/ลบข้อมูลของตัวเอง การตั้งขั้นตอนอนุมัติขวางไว้
ทำให้สิทธินั้นมีแต่ในทางทฤษฎี

หลักที่ต้องยึดตลอดทั้งสามการ์ด:
- **ดาวน์โหลดข้อมูล** — client ดึงข้อมูล สร้างไฟล์ และกดดาวน์โหลดได้เองทั้งหมด ไม่ผ่านเซิร์ฟเวอร์
- **อ่านนโยบาย** — ต้องมี "เวอร์ชัน" กำกับเสมอ และบอกผู้ใช้ว่าตัวเองยินยอมฉบับไหนไว้
- **ลบบัญชี** — ยืนยัน 2 ขั้น บอกชัดว่าอะไรจะหายก่อนลบจริง และถ้ามีข้อมูลการเงินที่กฎหมาย
  บังคับให้เก็บ (ใบเสร็จ/ประวัติธุรกรรม) ต้องทำให้ **ไม่ระบุตัวตน** แทนการลบทิ้ง

---

## 2. การ์ดที่ 1 — สิทธิของคุณตามกฎหมาย

### โครงหน้าจอ

```html
<div class="card">
  <div class="card-body">
    <h2 class="card-title">สิทธิของคุณตามกฎหมาย</h2>
    <p class="small muted">
      ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 — ทุกปุ่มด้านล่างทำงานทันที ไม่ต้องยื่นคำขอ
    </p>

    <button class="btn-secondary btn-block mt-4" id="btn-export">
      ${icon('download', 20)} ดาวน์โหลดข้อมูลของฉัน (มาตรา 30, 31)
    </button>
    <p class="xs muted mt-2">ได้ไฟล์ JSON ที่มีข้อมูลทั้งหมดที่ระบบเก็บเกี่ยวกับคุณ</p>

    <button class="btn-secondary btn-block mt-4" id="btn-policy">
      ${icon('info', 20)} อ่านนโยบายความเป็นส่วนตัว (มาตรา 23)
    </button>
    <p class="xs muted mt-2">
      คุณยินยอมกับฉบับวันที่ <strong>${escapeHtml(profile.consent?.version || '—')}</strong>
      ${consentAt ? ` เมื่อ ${formatThaiDate(consentAt, true)}` : ''}
      ${profile.consent?.version !== POLICY_VERSION ? ' · มีฉบับใหม่แล้ว' : ''}
    </p>

    <div class="divider"></div>
    <button class="btn-secondary btn-block" id="btn-consent-detail">
      ดูรายละเอียดความยินยอมที่ให้ไว้
    </button>
  </div>
</div>
```

`consentAt` คำนวณจาก `profile.consent?.acceptedAt?.toMillis?.()` — ต้องกัน error ด้วย
optional chaining เพราะ `acceptedAt` เป็น Firestore `Timestamp`, ถ้า profile ยังโหลดไม่เสร็จ
หรือเป็นผู้ใช้เก่าที่ยังไม่มีฟิลด์นี้จะพังทันทีถ้าเรียกตรง ๆ

### ปุ่มที่ 1 — ดาวน์โหลดข้อมูล (มาตรา 30, 31)

```js
if (e.target.closest('#btn-export')) {
  const btn = e.target.closest('#btn-export');
  btn.disabled = true;
  try {
    await exportMyData(state.user, state.profile);
    showToast('ดาวน์โหลดไฟล์ข้อมูลของคุณแล้ว', 'success');
  } catch (err) {
    console.error(err);
    showToast('ดาวน์โหลดไม่สำเร็จ', 'error');
  }
  btn.disabled = false;
  return;
}
```

`exportMyData()` (ใน `store.js`) ทำสามอย่าง:
1. รวมข้อมูลบัญชี + อ่าน subcollection ทุกตัว (`assessments`, `profiles` ฯลฯ) มาเป็น object เดียว
2. ใส่ `notIncluded` อธิบายว่าอะไรไม่รวมในไฟล์และทำไม (รหัสผ่าน, ข้อมูลคนอื่น, log การเข้าสู่ระบบ)
3. สร้างไฟล์ `.json` แล้วกดดาวน์โหลดให้ทันทีผ่าน `Blob` + `<a download>` — **ไม่ส่งขึ้นเซิร์ฟเวอร์เลย**

```js
export async function exportMyData(user, profile) {
  const bundle = {
    exportedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    note: 'ไฟล์นี้คือข้อมูลส่วนบุคคลทั้งหมดที่ระบบเก็บเกี่ยวกับคุณ (มาตรา 30-31)',
    account: {
      uid: user.uid,
      email: user.email || '',
      displayName: profile?.displayName || '',
      createdAt: tsToIso(profile?.createdAt),
      consent: {
        version: profile?.consent?.version ?? null,
        acceptedAt: tsToIso(profile?.consent?.acceptedAt),
        items: profile?.consent?.items ?? null,
      },
    },
    notIncluded: [
      'ข้อมูลของบุคคลอื่น — คุณไม่มีสิทธิเข้าถึง',
      'รหัสผ่าน — ระบบนี้ไม่ได้เก็บรหัสผ่านเลย',
      'บันทึกการเข้าสู่ระบบและที่อยู่ IP — จัดการโดย Firebase Authentication',
    ],
  };

  // ⚠️ ปรับรายชื่อ subcollection ให้ตรงกับสคีมาของโปรเจกต์ใหม่
  for (const sub of SUBCOLLECTIONS_TO_EXPORT) {
    const snap = await getDocs(collection(db, 'users', user.uid, sub));
    bundle[sub] = snap.docs.map(d => {
      const out = { id: d.id };
      for (const [k, v] of Object.entries(d.data())) {
        out[k] = v?.toDate ? v.toDate().toISOString() : v;   // แปลง Timestamp เป็นข้อความอ่านได้
      }
      return out;
    });
  }

  downloadJson(bundle, `my-data-${new Date().toISOString().slice(0, 10)}.json`);
  return bundle;
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### ปุ่มที่ 2 — อ่านนโยบายความเป็นส่วนตัว (มาตรา 23)

```js
if (e.target.closest('#btn-policy')) {
  openModalWithClose('นโยบายความเป็นส่วนตัว', privacyPolicyHtml(), true);
  return;
}

function openModalWithClose(title, body, large = false) {
  const m = showModal({
    title, body, large,
    footer: '<button class="btn-primary" data-act="close">ปิด</button>',
  });
  m.root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) m.close();
  });
}
```

`privacyPolicyHtml()` เป็นฟังก์ชันใน `legal.js` ที่คืนเนื้อหานโยบายทั้งฉบับเป็น HTML string
**หัวใจคือมันต้องมี `POLICY_VERSION` กำกับอยู่บรรทัดแรกเสมอ** เพื่อให้ผู้ใช้เทียบได้ว่าอ่าน
ฉบับเดียวกับที่ตัวเองเคยยินยอมไว้หรือไม่ — ดูหัวข้อ 5 ว่าทำไมต้องมีเลขเวอร์ชัน

### ปุ่มที่ 3 — ดูรายละเอียดความยินยอมที่ให้ไว้

```js
if (e.target.closest('#btn-consent-detail')) {
  const items = state.profile.consent?.items || {};
  const hist = state.profile.consentHistory || [];
  openModalWithClose('ความยินยอมที่คุณให้ไว้', `
    <div class="prose">
      <p class="small">ฉบับ <strong>${escapeHtml(state.profile.consent?.version || '—')}</strong></p>
      ${Object.entries(items).map(([k, v]) =>
        `<div class="kv"><span>${escapeHtml(k)}</span><span>${v ? '✓ ยินยอม' : '✗ ไม่ยินยอม'}</span></div>`
      ).join('')}
      ${hist.length ? `
        <h4>ประวัติฉบับก่อนหน้า</h4>
        ${hist.map(h => `<div class="kv"><span>${escapeHtml(h.version)}</span>
          <span>${h.acceptedAtMs ? formatThaiDate(h.acceptedAtMs) : '—'}</span></div>`).join('')}` : ''}
    </div>`);
  return;
}
```

**จุดสำคัญ:** แสดง**รายข้อ** ว่าแต่ละข้อติ๊กไว้ว่าอย่างไร ไม่ใช่แค่บอกว่า "ยินยอมแล้ว" รวม ๆ
เพราะถ้าระบบขอความยินยอมแยกเป็นหลายข้อ (เช่น ข้อมูลสุขภาพ, การโอนข้อมูลข้ามประเทศ,
ไม่ใช่บริการการแพทย์ ฯลฯ) ผู้ใช้ควรเห็นได้ว่าตัวเองติ๊กอะไรไว้บ้างจริง ๆ ไม่ใช่เดาเอา

---

## 3. การ์ดที่ 2 — ที่เก็บข้อมูลของคุณ

```html
<div class="card">
  <div class="card-body">
    <h2 class="card-title">ที่เก็บข้อมูลของคุณ</h2>
    <div class="kv"><span>ผู้ให้บริการ</span><span>Google Firebase</span></div>
    <div class="kv"><span>ภูมิภาค</span><span>${escapeHtml(DATA_REGION.id)}</span></div>
    <div class="kv"><span>ประเทศ</span><span>${escapeHtml(DATA_REGION.country)}</span></div>
    <p class="xs muted mt-3 mb-0">
      ข้อมูลของคุณอยู่นอกราชอาณาจักรไทย ซึ่งคุณได้ให้ความยินยอมไว้ตอนสมัคร (มาตรา 28)
    </p>
  </div>
</div>
```

```js
// config.js — ค่าเดียวที่ใช้แสดงผลทุกจุดในระบบ ต้องตรงกับ region จริงของ Firestore
export const DATA_REGION = {
  id: 'asia-southeast1',
  country: 'สิงคโปร์',
  label: 'เอเชียตะวันออกเฉียงใต้ (asia-southeast1 ประเทศสิงคโปร์)',
};
```

**⚠️ ข้อผิดพลาดที่พบบ่อยที่สุดของการ์ดนี้:** เขียนชื่อประเทศ/ภูมิภาคลงไปตรง ๆ ในหลายที่
(หน้าการ์ดนี้, หน้า consent, เนื้อหานโยบาย) แล้ววันหนึ่งย้าย Firestore region จริง
แต่ลืมแก้ครบทุกจุด ทำให้นโยบายโกหกผู้ใช้โดยไม่ตั้งใจ — **เก็บเป็นค่าคงที่ที่เดียว (`DATA_REGION`)
แล้วทุกที่ import มาใช้** ไม่ hardcode ซ้ำ

Firestore **กำหนด region ตอนสร้าง database ครั้งแรกเท่านั้น เปลี่ยนภายหลังไม่ได้**
ถ้าโปรเจกต์ใหม่ยังไม่ได้สร้าง database ให้ตรวจ region ที่ตั้งใจเลือกให้ถูกต้องก่อน
deploy จริงรอบแรก ไม่งั้นต้องสร้างโปรเจกต์ Firebase ใหม่ทั้งโปรเจกต์

---

## 4. การ์ดที่ 3 — พื้นที่อันตราย (ลบบัญชี)

```html
<div class="card">
  <div class="card-body">
    <h2 class="card-title" style="color:var(--bad)">พื้นที่อันตราย</h2>
    ${notice('danger', `
      <strong>การถอนความยินยอมมีผลเท่ากับการลบบัญชี</strong><br>
      เนื่องจากบริการทั้งหมดอาศัยความยินยอมเรื่องข้อมูลสุขภาพ
      หากคุณถอนความยินยอม เราจะไม่มีฐานทางกฎหมายให้เก็บข้อมูลของคุณต่อ
      จึงต้องลบทั้งหมด (มาตรา 19 และ 33)`)}
    <button class="btn-danger btn-block mt-4" id="btn-delete">
      ${icon('trash', 20)} ลบบัญชีและข้อมูลทั้งหมด
    </button>
  </div>
</div>
```

> ข้อความเตือนด้านบนเฉพาะกับระบบที่ข้อมูลทั้งหมดผูกกับความยินยอมเดียว (เช่นข้อมูลสุขภาพ)
> ถ้าโปรเจกต์ใหม่ไม่ได้มีเงื่อนไขแบบนี้ ให้ปรับข้อความอธิบายผลของการลบให้ตรงกับความจริง
> ของระบบนั้น — **อย่าใช้ถ้อยคำสำเร็จรูปโดยไม่ตรวจว่าเหตุผลทางกฎหมายตรงกับระบบจริงหรือไม่**

### Flow ยืนยัน 2 ขั้น

```js
async function runDeleteFlow() {
  const n = state.assessments?.length ?? 0;   // ปรับให้นับของจริงตามสคีมาของโปรเจกต์

  const step1 = await confirmDialog(
    `<p>คุณกำลังจะถอนความยินยอมและลบบัญชี</p>
     <p class="small muted mb-0">ขั้นต่อไปจะแสดงรายการสิ่งที่จะถูกลบ</p>`,
    { confirmText: 'ดำเนินการต่อ', danger: true, title: 'ลบบัญชี' });
  if (!step1) return;

  const step2 = await confirmDialog(`
    <p><strong>สิ่งที่จะถูกลบถาวรและกู้คืนไม่ได้</strong></p>
    <ul style="padding-left:1.2rem;line-height:1.9">
      <li>ผลการประเมินทั้งหมด${n ? ` (${n} รายการ)` : ''}</li>
      <li>ข้อมูลโปรไฟล์และบันทึกความยินยอม</li>
      <li>บัญชีเข้าสู่ระบบของคุณ (${escapeHtml(state.user.email || '')})</li>
    </ul>
    <p class="small muted mb-0">แนะนำให้กด "ดาวน์โหลดข้อมูลของฉัน" ก่อน หากยังต้องการเก็บผลไว้</p>`,
    { confirmText: 'ลบถาวร', cancelText: 'ยกเลิก', danger: true, title: 'ยืนยันครั้งสุดท้าย' });
  if (!step2) return;

  showToast('กำลังลบข้อมูล…', 'info');

  try {
    const res = await deleteAccount(state.user);

    const parts = [];
    if (res.deleted?.assessments) parts.push(`ผลประเมิน ${res.deleted.assessments} รายการ`);
    if (res.deleted?.financialAnonymised)
      parts.push(`บันทึกธุรกรรม ${res.deleted.financialAnonymised} รายการถูกตัดข้อมูลระบุตัวตนออก`);

    showModal({
      title: 'ลบเรียบร้อยแล้ว',
      body: `<p>ข้อมูลทั้งหมดของคุณถูกลบออกจากระบบแล้ว</p>
             ${parts.length ? `<p class="small muted">${escapeHtml(parts.join(' · '))}</p>` : ''}`,
      footer: '<button class="btn-primary" data-act="close">ปิด</button>',
      onClose: () => { location.hash = '#/'; location.reload(); },
    }).root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) { location.hash = '#/'; location.reload(); }
    });

  } catch (err) {
    console.error(err);
    showToast('ลบไม่สำเร็จ: ' + (err?.message || ''), 'error', 7000);
  }
}
```

**เหตุผลที่ยืนยัน 2 ขั้นแทน 1 ขั้น:** ขั้นแรกให้ผู้ใช้ "ตั้งใจจริง" ว่าจะลบ
ขั้นที่สองถึง**บอกรายการจริงที่จะหาย**พร้อมจำนวน — การยุบเหลือขั้นเดียวทำให้คนกดผิด
โดยไม่เห็นผลที่ตามมาชัดเจนพอ

### ทำไมการลบต้องทำฝั่งเซิร์ฟเวอร์ (ไม่ใช่ลบตรงจาก client)

> **นี่คือจุดตัดสินใจสำคัญที่สุดของทั้งฟีเจอร์ — อ่านก่อนลอกไปใช้**

**ถ้าโปรเจกต์ใหม่ไม่มีข้อมูลที่กฎหมายอื่นบังคับให้เก็บ** (เช่น ไม่มีระบบรับเงิน/ใบเสร็จ)
ลบข้อมูลตรงจาก client ได้เลย ไม่ต้องทำ Netlify Function แยก — เดินลบทุก subcollection
แบบ batch แล้วลบเอกสารโปรไฟล์ แล้วเรียก `deleteUser(auth.currentUser)` จบในไฟล์เดียว

**แต่ youngwai มีระบบรับบริจาค** และกฎหมายบัญชีกำหนดให้เก็บหลักฐานการรับเงินไว้
ลบทิ้งไม่ได้ตามใจ จึงต้อง**ทำให้ไม่ระบุตัวตนแทนการลบ** — operation นี้ข้าม Security Rules ปกติ
(ผู้ใช้ไม่มีสิทธิ์แก้ `payment_requests` ของตัวเองอยู่แล้วตาม rules เพื่อกันแก้ยอดเงินเอง)
จึงต้องใช้ Firebase Admin SDK ซึ่งรันได้เฉพาะฝั่งเซิร์ฟเวอร์เท่านั้น

```js
// netlify/functions/delete-account.mjs
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const SUBCOLLECTIONS = ['assessments', 'program', 'profiles', 'summaries'];  // ← ปรับตามสคีมาจริง
const BATCH = 400;   // batch ของ Firestore จำกัด 500 ops เว้นระยะไว้

function admin() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('ยังไม่ได้ตั้ง FIREBASE_SERVICE_ACCOUNT');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'ต้องใช้ POST' });

  let auth, db;
  try { ({ auth, db } = admin()); }
  catch (err) { return json(500, { error: err.message }); }

  let idToken, confirmUid;
  try { ({ idToken, confirmUid } = await req.json()); }
  catch { return json(400, { error: 'รูปแบบคำขอไม่ถูกต้อง' }); }

  if (!idToken) return json(401, { error: 'ไม่มีโทเคนยืนยันตัวตน' });

  // ── ยืนยันตัวตนจริงจาก idToken ไม่เชื่อ uid ที่ client ส่งมาตรง ๆ ──
  let uid;
  try {
    const decoded = await auth.verifyIdToken(idToken, /* checkRevoked */ true);
    uid = decoded.uid;
  } catch {
    return json(401, { error: 'โทเคนไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  // confirmUid กันไม่ให้ UI ที่ต่อสายผิดลบผิดบัญชีโดยไม่ตั้งใจ
  if (confirmUid !== uid) return json(400, { error: 'การยืนยันไม่ถูกต้อง' });

  const stats = { assessments: 0, program: 0, profiles: 0, summaries: 0, financialAnonymised: 0 };
  const userRef = db.collection('users').doc(uid);

  try {
    // ── 1. เดิน subcollection ทุกตัว ──
    // ⚠️ Firestore ไม่ลบ subcollection ตามเอกสารแม่อัตโนมัติ ต้องเดินลบเอง
    for (const sub of SUBCOLLECTIONS) {
      let deleted;
      do {
        const snap = await userRef.collection(sub).limit(BATCH).get();
        deleted = snap.size;
        if (deleted) {
          const batch = db.batch();
          snap.forEach(d => batch.delete(d.ref));
          await batch.commit();
          stats[sub] += deleted;
        }
      } while (deleted === BATCH);
    }

    // ── 2. เอกสารการเงิน: ทำให้ไม่ระบุตัวตน ไม่ลบ ──
    const financial = await db.collection('payment_requests').where('uid', '==', uid).get();
    if (!financial.empty) {
      const batch = db.batch();
      financial.forEach(d => batch.update(d.ref, {
        uid: 'deleted',
        email: '',
        displayName: 'ผู้ใช้ที่ลบบัญชีแล้ว',
        anonymisedAt: FieldValue.serverTimestamp(),
      }));
      await batch.commit();
      stats.financialAnonymised = financial.size;
    }

    // ── 3. โปรไฟล์ ──
    await userRef.delete();

    // ── 4. บัญชี Auth — ทำเป็นขั้นสุดท้ายเสมอ ──
    // ถ้าพังตรงนี้ ข้อมูลอ่อนไหวถูกลบไปแล้วอย่างน้อย ไม่ใช่ลบบัญชีสำเร็จแต่ข้อมูลยังอยู่
    await auth.deleteUser(uid);

    return json(200, { ok: true, deleted: stats });

  } catch (err) {
    console.error('delete-account failed', { uid, stats, message: err.message });
    return json(500, { error: 'ลบไม่สำเร็จบางส่วน กรุณาติดต่อทีมงาน', partial: stats });
  }
}
```

**ลำดับการลบมีเหตุผล ห้ามสลับ:**
1. subcollection ก่อน (ข้อมูลอ่อนไหวที่สุด ลบให้เร็วที่สุด)
2. ทำข้อมูลการเงินให้ไม่ระบุตัวตน (ต้องทำก่อนลบโปรไฟล์ เพราะใช้ `uid` อ้างอิงอยู่)
3. เอกสารโปรไฟล์หลัก
4. **บัญชี Auth ทำทีหลังสุดเสมอ** — ถ้าทำก่อนแล้ว Firestore operation ถัดไปพัง
   จะเหลือบัญชี Auth ที่ login ไม่ได้แต่ข้อมูลยังอยู่ครบ (งงกว่าแบบย้อนกลับ)

**Client ฝั่ง `store.js` เรียกง่าย ๆ แค่นี้:**

```js
export async function deleteAccount(user) {
  const idToken = await user.getIdToken(/* forceRefresh */ true);

  const res = await fetch('/.netlify/functions/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, confirmUid: user.uid }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `ลบไม่สำเร็จ (${res.status})`);
  return data;
}
```

### Environment variable ที่ต้องตั้ง

| ชื่อ | ที่มา | ความลับ |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project settings → Service accounts → Generate new private key (เนื้อหา JSON ทั้งก้อน) | **ใช่ ความลับสูงสุด ห้าม commit ลง git** |

ถ้าลืมตั้งค่านี้ที่ Netlify ปุ่มลบบัญชีจะพังด้วย error 500 ทันที — ควรทดสอบเส้นทางนี้
ก่อนประกาศว่าฟีเจอร์พร้อมใช้งานจริงเสมอ

---

## 5. ของที่ต้องมีอยู่ก่อนถึงจะต่อฟีเจอร์นี้ได้

สามการ์ดนี้ไม่ใช่ฟีเจอร์โดด ๆ — มันพึ่งโครงสร้างสามอย่างที่ต้องมีอยู่ก่อนในโปรเจกต์:

### 5.1 `POLICY_VERSION` ที่เดียวทั้งระบบ

```js
// legal.js
export const POLICY_VERSION = '2026-08-18c';
// ประวัติการเปลี่ยนแปลง
//   2026-08-18  ฉบับแรก
//   2026-08-18b เพิ่มข้อมูล 2 ประเภท: บันทึกการบริจาค และโทเคนอุปกรณ์สำหรับแจ้งเตือน
//   2026-08-18c เพิ่มโปรไฟล์ในความดูแล, การใช้กล้อง, สรุปรายเดือนด้วย AI
//               → ทั้งหมดเป็นการเปลี่ยนสาระสำคัญ ผู้ใช้เดิมต้องยินยอมใหม่
```

**เลื่อนเลขนี้ทุกครั้งที่นโยบายเปลี่ยนในสาระสำคัญ** (ไม่ใช่แก้คำผิด) — ระบบจะใช้ค่านี้เทียบกับ
`profile.consent.version` เพื่อรู้ว่าต้องขอความยินยอมใหม่ไหม การ์ด "อ่านนโยบาย" ในข้อ 2
ก็ใช้ตัวเดียวกันนี้แสดงว่าผู้ใช้ยินยอมฉบับไหนไว้

### 5.2 บันทึกความยินยอมแบบรายข้อ ไม่ใช่ true/false รวม

```js
// ตอนบันทึกความยินยอม (เช่นใน recordConsent())
const consent = {
  version: POLICY_VERSION,
  acceptedAt: serverTimestamp(),   // เวลาจากเซิร์ฟเวอร์เสมอ ไม่ใช้เวลาเครื่องผู้ใช้
  items: { ...checkedItems },      // { age: true, policy: true, sensitiveData: true, ... }
};
```

ถ้าเก็บแค่ `consented: true` ก้อนเดียว การ์ด "ดูรายละเอียดความยินยอม" ในข้อ 2 จะทำไม่ได้เลย
เพราะไม่มีรายละเอียดให้แสดง — การแยกเป็น object รายข้อตั้งแต่ตอนบันทึกจึงเป็นเงื่อนไขล่วงหน้า

### 5.3 `DATA_REGION` เป็นค่าคงที่ที่เดียว

ดูหัวข้อ 3 — ต้อง import มาใช้ ไม่ hardcode ซ้ำในหลายที่

---

## 6. Checklist ตอนเอาไปใช้กับโปรเจกต์ใหม่

**ต้องปรับให้ตรงกับโปรเจกต์ใหม่เสมอ (ห้ามลอกตรง ๆ):**
- [ ] `SUBCOLLECTIONS` ในทั้ง `exportMyData()` (client) และ Netlify Function ให้ตรงกับสคีมาจริง
- [ ] `DATA_REGION` ให้ตรงกับ region จริงของฐานข้อมูลที่สร้างไว้ (เปลี่ยนทีหลังไม่ได้)
- [ ] ข้อความเตือนใน "พื้นที่อันตราย" ให้ตรงกับเหตุผลทางกฎหมายจริงของระบบนั้น
  (อย่าก๊อปข้อความเรื่อง "ถอนความยินยอม = ลบบัญชี" ถ้าระบบใหม่ไม่ได้มีเงื่อนไขแบบนั้น)
- [ ] ตรวจว่าระบบใหม่มีข้อมูลที่กฎหมายอื่นบังคับให้เก็บไหม (เช่น ใบเสร็จ/ธุรกรรมการเงิน)
  ถ้า**ไม่มี** → ลบตรงจาก client พอ ไม่ต้องทำ Netlify Function แยก (ง่ายกว่าเยอะ)
  ถ้า**มี** → ทำตามแบบ youngwai เต็มรูปแบบ (anonymise แทนลบ + ทำฝั่งเซิร์ฟเวอร์)

**ต้องมีอยู่ก่อนถึงจะต่อได้ (ดูหัวข้อ 5):**
- [ ] `POLICY_VERSION` ที่เดียวทั้งระบบ มีประวัติการเปลี่ยนแปลงกำกับ
- [ ] บันทึกความยินยอมแบบรายข้อ (object) ไม่ใช่ boolean เดียว
- [ ] `recordConsent()` หรือเทียบเท่า ต้องใช้ `serverTimestamp()` ไม่ใช่เวลาเครื่องผู้ใช้

**ทดสอบก่อนบอกว่าเสร็จ:**
- [ ] กดดาวน์โหลดข้อมูล → เปิดไฟล์ JSON ดูว่าครบตามสคีมาจริง ไม่ใช่ placeholder
- [ ] กดอ่านนโยบาย → เลขเวอร์ชันในโมดัลตรงกับที่แสดงในการ์ด
- [ ] กดดูรายละเอียดความยินยอม → เห็นรายข้อจริงที่เคยติ๊กไว้ ไม่ใช่ว่าง
- [ ] ลบบัญชี (ทดสอบด้วยบัญชีทดลอง) → ตรวจ Firestore Console ว่า subcollection หายหมดจริง
- [ ] ถ้ามีข้อมูลการเงิน → ตรวจว่าเอกสารนั้นยังอยู่แต่ `uid` กลายเป็น `'deleted'` ไม่ใช่หายไปทั้งเอกสาร
- [ ] ตรวจ Firebase Authentication Console ว่าบัญชีหายจากรายชื่อจริง
- [ ] ลืมตั้ง `FIREBASE_SERVICE_ACCOUNT` ที่ Netlify แล้วลองกดลบ → ต้องเห็น error ที่อ่านรู้เรื่อง
      ไม่ใช่หน้าขาวหรือค้าง

---

## 7. สรุปสั้นสำหรับ prompt ไป Claude (โปรเจกต์ใหม่)

> สร้างสามการ์ดในหน้าตั้งค่า: "สิทธิของคุณตามกฎหมาย" (ดาวน์โหลดข้อมูล มาตรา 30/31 +
> อ่านนโยบาย มาตรา 23 + ดูรายละเอียดความยินยอม), "ที่เก็บข้อมูลของคุณ" (แสดง region/ประเทศ
> จากค่าคงที่ `DATA_REGION` ที่เดียว), "พื้นที่อันตราย" (ลบบัญชี มาตรา 33 ยืนยัน 2 ขั้น)
>
> หลักที่ต้องทำตาม: ทุกปุ่มทำงานทันทีไม่มีขั้นตอนอนุมัติ, ดาวน์โหลดทำฝั่ง client ล้วน,
> บันทึกความยินยอมเป็น object รายข้อไม่ใช่ boolean เดียว, ถ้าระบบมีข้อมูลการเงินที่กฎหมาย
> บังคับเก็บ ต้องทำให้ไม่ระบุตัวตนแทนการลบและทำผ่าน Netlify Function ด้วย Firebase Admin SDK
> (verify idToken ก่อนเสมอ ไม่เชื่อ uid จาก client ตรง ๆ), ถ้าไม่มีข้อมูลการเงินให้ลบตรงจาก
> client พอ
>
> ไฟล์หลัก: `js/pages/settings.js`, `js/store.js`, `js/legal.js`, `js/config.js`,
> `netlify/functions/delete-account.mjs` (เฉพาะกรณีมีข้อมูลการเงิน)
