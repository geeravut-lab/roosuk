# RooSuk — Requirements Summary

> **แผนหลักและข้อกำหนดล่าสุดอยู่ที่ [`ROOSUK-MASTER-PLAN.md`](ROOSUK-MASTER-PLAN.md)** — ไฟล์นี้เป็นสรุปย่อของเอกสารต้นทางเท่านั้น
> หากข้อมูลไม่ตรงกัน ให้ยึด Master Plan

สรุปจากเอกสารต้นฉบับใน `docs/` (ใช้เป็น baseline ก่อนเริ่มพัฒนา — เอกสารต้นฉบับยังเป็น source of truth):

- `Precision Health Idea ChatGPT & Gemini.txt` — แนวคิดและ positioning
- `Precision Health Recommended Features Final.pdf` — Feature set รวม + Priority + Roadmap (v2.0)
- `Precision Health Subscription Tiers Business Model.pdf` — Gold/Premium, AI cost, unit economics (v1.1)

## Positioning

เปลี่ยนจาก "ระบบจองตรวจสุขภาพ + รับผลตรวจ" → **"AI Personal Health OS — AI ที่รู้จักสุขภาพของคุณ"**

Core loop: เปิด App → AI บอกว่าวันนี้ควรใส่ใจอะไร → ผู้ใช้ทำตาม → ระบบเรียนรู้ → Health Profile ดีขึ้น → Insight เฉพาะตัวมากขึ้น

หลักการจาก Cal AI: Zero friction · Daily habit loop · Viral onboarding + subscription paywall

## Guardrails (บังคับทุกฟีเจอร์ AI)

- **AI ไม่วินิจฉัยโรค** — ช่วยสรุป/อธิบาย/เตรียมคุยกับแพทย์ แพทย์เป็นผู้ตัดสินใจ
- Disclaimer ทุกครั้ง, confidence threshold + human handoff
- PDPA: consent แยกสำหรับ daily data / photo / wearable / family sharing, data retention, right to be forgotten
- AI conversation log ต้อง audit ได้
- Gamification เน้น consistency ไม่ใช่รูปร่าง/น้ำหนัก

## MVP Product Loop

1. AI Health Onboarding / Quiz (5–10 คำถาม) → Biological Age / Health Score
2. My Health Profile
3. Scan / Upload — Food snap, Lab OCR, Connect wearable
4. AI Health Summary (first insight / magic moment)
5. Daily Health Action (Today's 3 Actions)
6. Health Timeline พื้นฐาน
7. AI Health Chat
8. Book Check-up / Upsell Lab package
9. Subscription paywall (Free → Gold)

## Feature Groups

| กลุ่ม        | ฟีเจอร์                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Funnel       | Longevity/Health Quiz, Biological Age, 7-day plan, Dynamic upsell gate                                                              |
| Killer input | Snap-to-log meal/supplement, Snap-to-import lab (OCR), daily check-in 3–5 ข้อ, barcode/voice fallback                               |
| Engagement   | Personal Health Score (Sleep/Activity/Nutrition/Recovery/Check-up/Lifestyle), Today's 3 Actions, Bio-streaks, Monthly Health Report |
| Data moat    | Health Timeline, Health Vault, Health Passport (QR/PDF/secure link), Pre-Doctor Brief                                               |
| AI Agent     | My Health Agent (tool calling), Ask My Health Data, Thai voice concierge                                                            |
| Integration  | Apple Health, Health Connect, Garmin, Whoop, CGM                                                                                    |
| Monetization | Subscription, Lab/Home Service booking, Supplement auto-ship, Marketplace, Family/Corporate plan                                    |
| Viral        | Shareable health cards, referral credits, health challenges, creator toolkit                                                        |

## Subscription Tiers (implemented in `src/config/plans.ts`)

| Feature                            | Gold 49 ฿/เดือน  | Premium 89 ฿/เดือน    |
| ---------------------------------- | ---------------- | --------------------- |
| Health Quiz / Biological Age       | 1/เดือน          | ไม่จำกัด              |
| AI Chat                            | 30 ข้อความ/เดือน | ไม่จำกัด              |
| Food Snap                          | 15/เดือน         | ไม่จำกัด              |
| Lab OCR / Import                   | 3/เดือน          | ไม่จำกัด              |
| Health Timeline                    | ย้อนหลัง 3 เดือน | ไม่จำกัด + predictive |
| Health Vault                       | 20 ไฟล์          | ไม่จำกัด              |
| Health Passport / Pre-Doctor Brief | —                | ✓                     |
| AI Health Agent                    | —                | ✓                     |
| Family sharing                     | —                | +1 คน                 |

Free tier: ยังไม่ได้กำหนดตัวเลขในเอกสาร (Health Profile, Basic Timeline, AI chat จำกัด, manual tracking)

Launch: เริ่ม Free + Gold ก่อน → เปิด Premium หลังมี usage data · A/B test paywall ตั้งแต่แรก · แสดง progress bar ของ AI usage

## AI Cost Targets

- Average user 10–20 ฿/เดือน; ติดตาม AI cost ต่อ user รายสัปดาห์ — ถ้าเฉลี่ยเกิน 20 ฿ ให้ปรับ limit หรือโมเดลทันที
- ใช้โมเดลกลางสำหรับ insight/chat, โมเดลเล็กสำหรับ FAQ/สรุปสั้น, cache คำตอบซ้ำ, rate limit ตาม tier
- Break-even ~150–250 paying users (contribution margin เฉลี่ย ~41 ฿/user)

## Tech Stack (ตามเอกสาร)

- Frontend: PWA mobile-first (camera + push), Netlify/Vercel
- Backend/Data: Supabase (Auth, Postgres, Storage), time-series health log, vault + permission model
- AI: Multimodal vision gateway (food + document OCR), Health Score / Biological Age engine, Health Agent (tool calling)
- Billing: Omise / Stripe recurring
- Channels: Web, LINE

## Roadmap

| Phase                | ระยะเวลา    | ขอบเขต                                                                                                                          |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1 MVP+               | 6–8 สัปดาห์ | จอง + ชำระ + ติดตาม + รับผล PDF + LINE, AI Quiz/Score + upsell, AI Chat, shareable cards, paywall, Health Profile               |
| 2 Habit + Ops        | 4–6 สัปดาห์ | Barcode, lab sync, doctor sign-off, AI snap food/lab OCR, daily score/actions/streak, timeline + vault, wearable basic          |
| 3 Intelligence + ARR | 4–6 สัปดาห์ | Business copilot, unit economics, Health Agent, Passport, Pre-Doctor Brief, supplement auto-ship, marketplace, family/corporate |
| 4 Scale              | ต่อเนื่อง   | Multi-branch/franchise, advanced personalization, genomic insights, predictive longevity                                        |
