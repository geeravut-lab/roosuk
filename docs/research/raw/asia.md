# RooSuk competitor research: Asia (excluding Thailand)

Accessed: 2026-10 (search date 2026-10-05). Researcher: Claude (WebSearch only).

**Method and caveats.** `WebFetch` was blocked by the sandbox egress proxy for every domain tried (businesswire, techrepublic, tmtpost, asken, antgroup, synapxe). All facts below therefore come from WebSearch result summaries of the cited pages, not from reading the pages in full. Anything I could not confirm is marked **unverified**. Third-party review blogs (nutrola, nutriscan, fittrackai, aggregator sites) are lower quality than company/regulator/press sources, and I flag them where used. No numbers were invented. Prices are in local currency as quoted, with no conversion.

RooSuk reference: AI daily check-in + Health Score + streaks; food photo and barcode; lab scan with ranges, trend and AI explanation; Ask-AI over own data with guardrails; document vault; Health Passport and pre-doctor brief; monthly report; wearable import; family sharing; challenges, referral and credit; supplement marketplace; B2B corporate plan; granular PDPA consent; Thai/English UI; 14-day Premium trial, then Free-lite / Gold ~49 THB / Premium ~89 THB per month.

---

## 1. Headline takeaways

1. **The closest functional analogue in Asia is Ant Group's Ant Afu (AQ)** in China. It combines AI health Q&A (text, voice, photo), photo/PDF report interpretation, personal and family health records, and wearable sync from nine device brands, with a stated ad-free Q&A policy. It is China-only (Chinese UI, Alipay-linked) and has no marketplace, passport or scoring layer that I could verify. Scale: 150M users reported Sep 2026.
2. **Ultrahuman Vision Cloud (India)** is the nearest _lab-scan-to-AI-explanation_ product. It is free, accepts historic blood work from any provider, supports multi-report trends, and is available globally via the Ultrahuman app. It is a wearable-maker funnel into its paid Blood Vision tests, not a standalone health OS.
3. **Photo food logging plus AI coach** is mature in Asia: Asken (JP, 14M members), HealthifyMe (IN, 40M+ users claimed), Boohee (CN, 180M+ served claimed), PASTA (KR, CGM-based), chocoZAP (JP). Most paywall photo logging.
4. **Streak/habit/points loops** exist mainly as government programs (Singapore Healthy 365) or inside fitness subscriptions. None of the products I found pairs a daily-check-in Health Score with a doctor-ready passport the way RooSuk plans to.
5. **Government PHR rails are the structural competitor in some countries.** Singapore's HealthHub (NEHR lab reports, immunisation, family records, an AI layer planned) and India's ABDM/ABHA (about 94 crore ABHA numbers per press) mean users can already pull official records. This matters if RooSuk ever wants to cross borders. Thailand is out of scope here.
6. **Thailand usability.** Of the Asian products reviewed, those usable in Thailand with some features are Samsung Health, Huawei Health, Xiaomi/Zepp, HealthifyMe (reported available), Kantesti-type global tools and Doctor Anywhere (owns Doctor Raksa, Thailand's largest telemedicine platform per MobiHealthNews). Almost all others are local-language, local-market products (Asken is Japanese-only; Afu is Chinese-only).

---

## 2. Comparison table

Legend: Y = confirmed; N = not found / not offered; ? = unverified. "Lab" = lab/report scan with AI explanation. "Photo" = AI food photo logging.

| Product                   | Country  | Scale (as sourced)                                    | Photo food                              | Lab/report AI                                           | Ask-AI chat                               | Wearables         | Family                | Records vault         | Pricing / model                                                                      | Usable in TH?                             |
| ------------------------- | -------- | ----------------------------------------------------- | --------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | ----------------- | --------------------- | --------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| Ant Afu (AQ)              | CN       | 150M users (Sep 2026)                                 | ? (photo Q&A; skin and medicine-box ID) | Y (photo/PDF)                                           | Y                                         | Y (9 brands)      | Y                     | Y                     | Free; "no ads" stated; monetisation unclear                                          | N (Chinese)                               |
| Ping An Good Doctor       | CN       | 400M+ registered                                      | ?                                       | ?                                                       | Y (AI Doctor ~12M annual users)           | ?                 | ?                     | ?                     | B2B corporate (RMB 1.3bn, +40.6%) and consults                                       | N                                         |
| Alibaba Health (Yilu)     | CN       | Tmall Health 300M annual active                       | ?                                       | ?                                                       | ? (Hydrion LLM for doctors)               | ?                 | ?                     | ?                     | E-commerce pharmacy, services                                                        | N                                         |
| JD Health                 | CN       | 217.7M annual active (2025)                           | ?                                       | ?                                                       | Y (AI Jingyi, 50M+ served by 30 Jun 2025) | ?                 | ?                     | ?                     | E-commerce plus services                                                             | N                                         |
| Tencent Health / WeChat   | CN       | n/a                                                   | ?                                       | Y (health-management agent: checkup/lab report reading) | Y (AI Wenwen)                             | ?                 | ?                     | Y (in mini program)   | Platform/partner                                                                     | N                                         |
| Boohee 薄荷健康           | CN       | 180M+ served (claimed)                                | Y (paid)                                | N                                                       | Y (LLM weight model)                      | ?                 | ?                     | N                     | Subscription: RMB 15-18/mo; RMB 128/12 mo (aggregator-sourced)                       | N                                         |
| Keep                      | CN       | MAU 21.8M, 2.74M avg paying members (2025)            | ?                                       | N                                                       | Y (AI coach)                              | ?                 | N                     | N                     | RMB 19/mo standard; RMB 68/mo "Super AI"                                             | N                                         |
| Huawei Health             | CN       | 400M global, 97M MAU (2022 figures)                   | Y via Celia (reported)                  | ?                                                       | ? (Xiaoyi)                                | Y (own devices)   | ?                     | Partial               | Free app, hardware-led                                                               | Y (app)                                   |
| Xiaomi Mi Fitness / Zepp  | CN       | Zepp 42M+ active (claimed); Mi Fitness 50M+ downloads | N                                       | N                                                       | ? (Zepp LLM tools)                        | Y                 | N                     | N                     | Hardware-led                                                                         | Y (app)                                   |
| Samsung Health            | KR       | 77M MAU (Apr 2026)                                    | Y (food logging)                        | N                                                       | Y (Health Assistant, US beta only)        | Y                 | ?                     | Partial               | Free; hardware-led                                                                   | Y (80 languages; assistant not available) |
| Kakao PASTA               | KR       | ~1M downloads, ~300K MAU                              | Y (Vision AI)                           | N (glucose reports)                                     | ? (Gemini)                                | Y (CGM, BP)       | N                     | N                     | App free; pay for sensor lease                                                       | N                                         |
| Naver Healthcare          | KR       | ?                                                     | N                                       | ?                                                       | Symptom to department                     | Partner (InBody)  | ?                     | Y (health data view)  | Platform                                                                             | N                                         |
| LifeSemantics             | KR       | ?                                                     | ?                                       | ?                                                       | ?                                         | ?                 | ?                     | Y (PHR "Life Record") | B2B/DTx                                                                              | N                                         |
| Asken あすけん            | JP       | 14M cumulative members (May 2026)                     | Y (premium)                             | N (checkup-linked advice only)                          | Y (AI dietitian)                          | ?                 | Y (share meals)       | N                     | Free + Premium (~JPY 480/mo pre-revision)                                            | N (Japanese)                              |
| chocoZAP (RIZAP)          | JP       | 1,500+ gyms                                           | Y                                       | N                                                       | Y (AI feedback)                           | ?                 | N                     | N                     | Gym membership                                                                       | N                                         |
| Welby マイカルテ          | JP       | ?                                                     | Y (meal log)                            | Y (lab values via PHR, from providers)                  | N                                         | Y (IoT)           | ?                     | Y                     | Free app; B2B/medical                                                                | N                                         |
| MySOS (DeNA) / 康記       | JP       | ?                                                     | ?                                       | Y (康記: AI explains checkup results)                   | ?                                         | ?                 | ?                     | Y                     | ?                                                                                    | N                                         |
| HPB Healthy 365           | SG       | ~885K monthly users (~25% of adults)                  | Meal logging (earns points)             | N                                                       | N                                         | Y (steps tracker) | N                     | N                     | Government free; points redeemable for vouchers                                      | N                                         |
| HealthHub                 | SG       | ?                                                     | N                                       | Y (NEHR lab reports, not AI yet)                        | AI planned (4 languages)                  | N                 | Y                     | Y                     | Government free                                                                      | N (Singpass)                              |
| Homage                    | SG       | Raised ~US$45M; breakeven Mar 2025                    | N                                       | N                                                       | N                                         | N                 | Y (caregiving)        | N                     | Care services                                                                        | N                                         |
| Doctor Anywhere           | SG       | 2.8M+ users                                           | N                                       | ?                                                       | ?                                         | N                 | ?                     | ?                     | Teleconsult/clinics, corporate                                                       | Y (via Doctor Raksa)                      |
| HealthifyMe / Healthify   | IN       | 40M+ users (claimed)                                  | Y (Snap, paid)                          | N                                                       | Y (Ria)                                   | Y                 | N                     | N                     | INR 999/mo and up; Smart INR ~2,499/yr; coach plans INR 1,250-4,000/mo (third-party) | Y (reported)                              |
| Practo                    | IN       | ?                                                     | N                                       | Records upload                                          | Y (AI guidance)                           | N                 | Y                     | Y                     | Marketplace, consults                                                                | N                                         |
| Tata 1mg                  | IN       | App 43M downloads                                     | N                                       | Y (own lab reports, plain-English, AI assistant)        | Y                                         | N                 | Y                     | Y                     | E-pharmacy, lab tests                                                                | N                                         |
| Cult.fit                  | IN       | Revenue INR 1,215 cr FY25                             | N                                       | N                                                       | ?                                         | ?                 | N                     | N                     | Cultpass subscription                                                                | N                                         |
| Ultrahuman                | IN       | Women ~68% of users; total unverified                 | N                                       | **Y (Vision Cloud, free)**                              | Y (Jade AI)                               | Y (ring, CGM)     | N                     | N                     | Ring + Blood Vision (INR 999-1,999 panels in India; US$99 Essentials)                | ? (not mentioned)                         |
| Eka Care                  | IN       | 15M+ (claimed)                                        | N                                       | ? (records/PHR)                                         | ?                                         | ?                 | Y                     | Y (ABDM PHR)          | Doctor SaaS + consumer PHR                                                           | N                                         |
| Halodoc                   | ID       | 20M+ MAU (claimed)                                    | N                                       | N                                                       | Y (HILDA, 2M+ sessions)                   | N                 | N                     | N                     | Consults, pharmacy, B2B                                                              | N                                         |
| Alodokter                 | ID       | 40M+ monthly (company claim)                          | N                                       | N                                                       | Doctor-side AI (Alni)                     | N                 | N                     | N                     | Consults, pharmacy, insurance                                                        | N                                         |
| KlikDokter                | ID       | 1M+ users                                             | N                                       | N                                                       | N                                         | N                 | Y (pregnancy tracker) | N                     | Consult, content                                                                     | N                                         |
| Hello Sehat / Hello Bacsi | ID / VN  | 700K+ community each                                  | N                                       | N                                                       | Y (AI Health Assistant, cites sources)    | N                 | N                     | N                     | Ads/content, premium newsletters                                                     | ? (group has Thai presence)               |
| DoctorOnCall              | MY       | ?                                                     | N                                       | N                                                       | ? (AI symptom check planned)              | N                 | N                     | N                     | Teleconsult, pharmacy                                                                | N                                         |
| KonsultaMD                | PH       | "largest telehealth in PH"                            | N                                       | N                                                       | N                                         | N                 | Y (plans)             | N                     | Konsulta Plus PHP 150/mo                                                             | N                                         |
| MyDoc                     | MY/HK/SG | ?                                                     | N                                       | N                                                       | ?                                         | N                 | N                     | N                     | Insurer/corporate B2B2C                                                              | N                                         |

---

## 3. Per-product notes by country

### CHINA

#### Ant Afu (蚂蚁阿福, formerly AQ), Ant Group

- **Status/scale:** AQ launched June 2025; rebranded and relaunched as Ant Afu (阿福) on 15 Dec 2025. Reported 15M MAU at the relaunch (about 55% from tier-3 and lower cities), 30M+ MAU in Jan 2026 (Chinese press), 100M users in Feb 2026 and **150M users in Sep 2026**, with close to 20M health inquiries a day (Ant press release via Business Wire, 10 Sep 2026). A separate "AQ for Doctor" workstation (formerly Haodf for Doctor, 300,000 verified doctors) was announced Aug 2026.
- **Features:** Health Q&A by text, voice, image, including dialect recognition (Chinese press). Report interpretation: photo or PDF of checkup reports, medical records, prescriptions, drug boxes, claimed 99% coverage of common report types and multi-report comparison (Chinese press, vendor claims). Personal and family health records with trend tracking and abnormality alerts. Sync from nine device brands (Apple Watch, Huawei, vivo, others; Xiaomi scales added). AI Clinic with proactive questioning. Hospital booking and consults via Ant's ecosystem. In 2026 Ant expanded into weight, exercise, nutrition, sleep and mental wellbeing (Business Wire).
- **AI:** LLM chat with multimodal input. Ant states there are no ads or commercial ranking in answers.
- **Inputs:** photo, PDF, voice, device sync. Whether it has a barcode scan or a food-photo calorie log: **unverified** (one aggregator snippet conflated food and skin-condition photo ID; I did not rely on it).
- **Business model:** early stage, not monetising directly; value expected via ecosystem (insurance, referral, B2B) per Chinese commentary. Opaque.
- **Language/Thailand:** Chinese only; not usable in Thailand.
- **Regulation/privacy:** China's PIPL treats health data as sensitive (separate consent). Chinese commentary criticises vague third-party-sharing wording and reports a user complaint (Aug 2026) that the AI addressed them by real name. Both are press/forum claims, unverified.
- **Strengths:** distribution via Alipay, scale, family records, report interpretation, wearables. **Weaknesses:** China-only, trust and privacy criticism, no passport or marketplace of RooSuk's kind found.
- **Sources:** S1, S2, S3, S4, S5.

#### Ping An Good Doctor (平安好医生), Ping An

- 2025 results: 400M+ registered users; AI Doctor used by nearly 12M annual users; "AI + human doctor" model; AI about 4.5% of gross profit; revenue RMB 5.468bn (+13.7%); net profit RMB 380M; **corporate health management revenue RMB 1.3bn (+40.6%), 6,700+ paying corporate clients**.
- Relevant to RooSuk's B2B plan: Ping An monetises through corporate and insurer channels and the human-doctor layer, not consumer subscriptions. Consumer feature detail (lab scan, wearables, family) **unverified**.
- Chinese only. China bars AI from replacing doctors in diagnosis and prescribing (see Regional facts).
- **Sources:** S6.

#### Alibaba Health (阿里健康 / 医鹿 app)

- FY ended 31 Mar 2026: revenue RMB 34.26bn (+12%), net profit RMB 1.94bn; Tmall Health annual active users 300M; launched "Hydrion" LLM aimed at doctors and researchers. Consumer app renamed 医鹿 (Yilu); Quark search partnered with Yilu for AI consult features (Chinese press).
- E-commerce pharmacy and services, not a personal-data-driven health OS. Consumer lab/photo/family features **unverified**.
- **Sources:** S7.

#### JD Health (京东健康)

- 2025: revenue RMB 73.4bn (+26.3%); annual active users 217.7M. "AI Jingyi" agents had served 50M+ users by 30 Jun 2025, built on "Jingyi Qianxun" medical LLM; "JOY DOC" for hospitals.
- E-commerce plus consults. Personal-record and wearable features **unverified**.
- **Sources:** S8.

#### Tencent Health / WeChat

- Tencent Health launched two consumer agents inside its mini program: "AI Wenwen" (instant consult, drug contraindications, nutrition) and a "health management assistant" centred on interpreting checkup and lab reports (Chinese press, Sep 2025). Yuanbao (Tencent's assistant) is integrated in WeChat; I found no dedicated Yuanbao health product.
- Strength: WeChat distribution, mini-program delivery, hospital integrations. Weakness: embedded, no standalone consumer brand found. User numbers **unverified**.
- **Sources:** S9.

#### Boohee 薄荷健康

- "Camera" food recognition (built on Baidu's open platform per one source, 1,000+ dishes) is member-only; claims 180M+ users served and 1.6M+ foods in its science database; 2025 launched an LLM-driven integrated weight-loss model and an overseas AI weight app "Maxbud" for GLP-1 users (aggregator/press). Membership about RMB 15-18/month, RMB 128/12 months (app-store aggregator, may be outdated).
- Strength: long food-database history, GLP-1 niche. Weakness: weight-loss framing is the opposite of RooSuk's non-weight-goal stance; no lab features found.
- **Sources:** S10.

#### Keep

- 2025 annual results: average MAU 21.77M (down from 29.92M in 2024); average monthly subscribing members 2.74M (down from 3.16M); first adjusted net profit; pivot to "AI-driven fitness and health ecosystem". Pricing: RMB 19/month standard, RMB 68/month Super AI membership (Tmtpost).
- Useful price datapoint: an AI tier costs about 3.5x standard. No lab/records features found.
- **Sources:** S11.

#### Huawei Health

- 400M global users and 97M MAU (as of HDC 2022; old). Reports of Celia (international Xiaoyi) estimating calories from camera via Huawei Health. HarmonyOS 7 (HDC 2026) makes Xiaoyi a system agent. Hardware-led, free app, available in Thailand (app).
- **Sources:** S12.

#### Xiaomi Mi Fitness / Zepp (Amazfit)

- Mi Fitness supports Xiaomi/Redmi bands and watches (heart rate, sleep, stress); 50M+ Play downloads. Zepp Health claims 42M+ active users in 90+ countries and LLM-based natural-language tools. Hardware funnels; no food, lab or family features found.
- **Sources:** S13.

### SOUTH KOREA

#### Samsung Health

- 77M MAU (Apr 2026), 80 languages. **Health Assistant** (AI, built on sleep/activity/nutrition/mindfulness/vitals data) announced 21 Jul 2026, opt-in beta for eligible **US** users only; coaching planned later. In Thailand some wearable features (SpO2, BP) are unavailable per forum/support pages.
- Strength: giant installed base and data. Weakness: Samsung-device-centric, no lab scan, no regional (Thai) assistant yet.
- **Sources:** S14.

#### Kakao Healthcare PASTA

- Launched 1 Feb 2024; CGM-based (Dexcom G7, i-SENS CareSens Air), AI food recognition with Vision AI, daily reports, Gemini integration, later sleep and BP (Sky Labs) functions. App is free; users pay for sensor lease (KRW 100,000 per 10 days Dexcom; KRW 150,000 per 15 days CareSens; up to 90% insurance reimbursement for eligible diabetics). Reported 1M downloads and ~300K MAU; Japan launch planned by end 2026.
- Regulation: Korea's Digital Medical Products Act applies to digital medical products since 24 Jan 2026 (MFDS).
- Strength: closed loop of sensor, food photo and AI. Weakness: disease (glucose) focus, hardware-dependent, Korean.
- **Sources:** S15.

#### Naver Healthcare

- "Naver Healthcare" consolidates symptom search, department recommendation, appointments, health video and a personal health-data space; SNUH+Naver KMed.ai medical LLM; Naver–InBody partnership (Oct 2025). Users and AI chat features **unverified**.
- **Sources:** S16.

#### LifeSemantics

- Founded 2012; PHR platform "Life Record"; also Dr. Call, H.AI, Redpill Breath (COPD DTx) and a health-functional-food subsidiary (NutraSemantics). My prompt's "Mediplus" name could not be verified as a LifeSemantics product. Consumer user count **unverified**.
- **Sources:** S17.

### JAPAN

#### Asken (あすけん)

- 14M cumulative members (27 May 2026), about 10 billion meal records (earlier claim, 13M members). AI dietitian character "Miki-san" (未来さん), AI photo analysis (accuracy raised 25% with generative AI), "talk to record" voice logging, meal sharing with others (May 2025), corporate health-management service. Photo analysis free for 7 days after sign-up then Premium only. Premium was JPY 480 per month, JPY 4,800 per year (older figure, third-party), and a **price revision took effect 18 Aug 2026** (company notice dated 17 Jun 2026; new figures unverified).
- Japan No.1 in health/fitness app downloads and revenue 4 years running (company claim).
- Strength: warm AI-dietitian character, local food data, B2B. Weakness: nutrition only, Japanese only; no labs or passport.
- **Sources:** S18.

#### chocoZAP / RIZAP

- Gym-chain app with photo meal logging, calories and PFC balance, and generative-AI feedback built with RIZAP know-how; 1,500+ locations. "Carada" could not be verified as a distinct product (**unverified**).
- **Sources:** S19.

#### Welby マイカルテ

- Free PHR for chronic-disease self-management: BP, glucose, weight, meals, IoT devices, lab values shared with providers, HL7 FHIR, 2FA and granular consent (full renewal May 2025), preinstalled on SoftBank senior phones. Model: B2B/medical institutions and insurers.
- **Sources:** S20.

#### MySOS (DeNA), 康記 (Koki) and others

- MySOS retrieves medication and checkup data via マイナポータル. 康記 (App Store) uses AI to explain health-checkup results in plain language, with voice input and vitals tracking. Kantesti (global, Germany-based) is also sold in Japan. User numbers **unverified**.
- **Sources:** S21.

### SINGAPORE

#### HPB Healthy 365

- Government app: steps via tracker, meal logging and purchases of Healthier Choice products earn Healthpoints, redeemable for vouchers; National Steps Challenge; about 885K monthly users (~25% of adults). A direct habit/points analogue to RooSuk challenges, but government-funded and not AI-led. App unification with HealthHub planned by Nov 2026.
- **Sources:** S22.

#### HealthHub (Synapxe / MOH)

- Singpass login; lab reports (past 3 years), immunisation records, medical alerts, appointments, bills, family records via NEHR and NIR. Public-cluster apps (NHG, NUHS, SingHealth Health Buddy) to unify under an enhanced HealthHub by **Nov 2026**, decommissioned by Feb 2027; "HealthHub AI" to give personalised health information in four languages by text and speech.
- Strength: authoritative data. Weakness: public-sector only, Singapore residents. A structural benchmark for the Passport and vault.
- **Sources:** S23.

#### Homage

- Caregiving marketplace in Singapore, Malaysia and Australia; ~US$45M raised; reached breakeven in March 2025. Not an AI personal-health app. Family caregiving relevance only.
- **Sources:** S24.

#### Doctor Anywhere

- 2.8M+ users across SEA; acquired Doctor Raksa (Thailand's largest telemedicine platform per MobiHealthNews), so Thailand is its second-largest market; partners with insurers (e.g. Sun Life Grepa, PH). Teleconsult, clinics, preventive care, corporate. No consumer AI records feature verified.
- **Sources:** S25.

#### Ada Health (note: Berlin-based, not Asian)

- Included only because it was on the brief. EU-regulated symptom assessor, 11M+ registered users, languages EN/DE/FR/ES/PT/RO/SW (no Thai found).
- **Sources:** S26.

### INDIA

#### HealthifyMe / Healthify

- AI nutritionist **Ria** (pilot 2017), **Snap** photo logging, 100,000+ Indian foods, CGM and coach plans; reported 40M+ users; operates in India, SEA, US, Middle East; available in Thailand per one listing. India pricing (third-party blogs, verify with the official store): photo logging, Ria and food database need a paid plan from about INR 999/month; Smart plan ~INR 2,499/year; coach plans INR 1,250-4,000/month. About 25% of revenue from outside India (third-party).
- Strength: closest consumer comparable on food photo plus AI coach, with Thai market reach. Weakness: no labs or passport; weight-centric framing.
- **Sources:** S27.

#### Practo

- Doctor discovery, consults, records upload (prescriptions, lab reports), family profiles and "AI-assisted health guidance". ABHA integration detail unverified.
- **Sources:** S28.

#### Tata 1mg

- App 43M downloads; at-home lab tests in 70+ cities; digital reports with plain-English explanations, "Health Insights Hub", 24/7 AI health assistant with trend tracking, family records; partnered with Ultrahuman for Blood Vision. Closest Indian analogue to lab-explain plus marketplace (e-pharmacy plus diagnostics).
- **Sources:** S29.

#### Cult.fit

- FY25 revenue INR 1,215.5 cr (+31.2%), loss INR 480.8 cr; Cultpass all-in-one subscription (fitness subscription revenue INR 889 cr); AI used for recommendations and computer-vision "Energy Meter". IPO-bound. Not a records or labs product.
- **Sources:** S30.

#### Ultrahuman

- Ring PRO with "Jade" AI (Mar 2026), M1 CGM, Home device (INR 54,999), **Blood Vision** (100+ biomarkers; India panels from INR 999, base INR 1,999; US$99 Essentials; US$499 annual plan) and **Vision Cloud**: free, global, upload blood work from any provider, AI summary, multi-report trends, "Blood Age", supplement recommendations. User total unverified; Thailand availability unverified.
- This is the clearest example of a hardware company bundling lab scan, wearables and supplements, which is RooSuk's thesis with different primary inputs.
- **Sources:** S31.

#### Eka Care

- ABDM-approved PHR: store reports and vitals, ABHA creation, share with doctors, appointments; "15M+ Indians" (company); doctor-side EkaScribe built on its own LLM Parrotlet. Consumer AI explanation of lab values **unverified**.
- **Sources:** S32.

### SOUTHEAST ASIA (excluding Thailand)

#### Halodoc (Indonesia)

- 20M+ MAU (claimed), 20,000+ doctors, 4,900+ partner pharmacies, Home Lab. **HILDA** (2025; LLM assistant; 2M+ sessions; now on WhatsApp) and AIDA (doctor assistant). States compliance with Indonesia's PDP Law. "Halodoc for Business" corporate product.
- **Sources:** S33.

#### Alodokter (Indonesia)

- 40M+ monthly users (company claim) and 45,000+ doctors; Alni AI (Mar 2023) assists doctors with pre-screening; over 80% of its GPs are AI-aided. E-pharmacy and insurance.
- **Sources:** S34.

#### KlikDokter (Indonesia)

- Launched 2015, 1M+ users, doctor chat, pregnancy tracker (HalloBumil), risk calculators.
- **Sources:** S34.

#### Hello Sehat / Hello Bacsi (Hello Health Group)

- Doctor-reviewed content (20,000+ articles); generative AI community bot launched June 2023 for Vietnam and Indonesia (700K+ community members each) citing source articles. Group has a Thai presence.
- **Sources:** S35.

#### DoctorOnCall (Malaysia), MyDoc (Malaysia/HK/SG)

- DoctorOnCall: teleconsult, pharmacy, specialist booking; AI symptom checker planned. MyDoc: insurer and corporate telemedicine (AIA, Aetna, Cigna). No consumer lab or photo features found.
- **Sources:** S36.

#### KonsultaMD (Philippines, Globe)

- Telehealth super-app with consults, pharmacy, at-home labs, wellness. Konsulta Plus PHP 150/month; plans PHP 499 (12 months, 1 member), 799 (2), 999 (5, family) with video-consult bundles. Family plan structure is a pricing analogue.
- **Sources:** S37.
- Medix (PH): the name resolved to a clinic EMR vendor, not a consumer app; not relevant (**unverified** otherwise).

---

## 4. Regional market facts

1. **Market size.** Estimates vary widely: Asia-Pacific digital health about US$72.5bn in 2025 growing at 28.3% CAGR to US$323bn by 2030 (Ken Research); US$252.6bn by 2030 at 23.1% (Grand View Research); US$326.7bn by 2030 at 26.5% (Research and Markets). Treat as directional. (S38)
2. **Korea.** Digital health revenue about US$3.3bn in 2024, projected above US$11bn by 2030 (CAGR above 23%) per a Healthcare IT News summary. (S17)
3. **China AI health regulation.** NHC rules for internet diagnosis (2022) bar AI from replacing physicians in diagnosis and prescribing; GB/T 45654-2025 sets security requirements for generative AI services; AI content labelling measures took effect 1 Sep 2025; NHC announced a national "AI+ healthcare" plan on 4 Nov 2025 (pilots in 50 hospitals and 500 township clinics Apr-Dec 2026; databases integrated by end-2027). (S39)
4. **China privacy.** PIPL classes medical health data as sensitive personal information requiring separate consent, necessity and impact assessment (Art. 29 and related). (S40)
5. **Korea.** AI Basic Act in force 22 Jan 2026 (first comprehensive binding AI law in Asia-Pacific); healthcare is a "high-impact" sector with explanation, human-oversight and user-protection duties; fines up to KRW 30M with at least a one-year guidance period. Health data is sensitive under PIPA Art. 23, consent-based. Digital Medical Products Act covers software medical products from 24 Jan 2026; a Digital Healthcare Act and tele-medicine law remain stalled. (S41)
6. **Japan.** AI Promotion Act in force 1 Sep 2025, soft-law with no penalties. APPI amendment approved by cabinet 7 Apr 2026 and reported as enacted 14 Apr (secondary sources): allows use of sensitive data (including health) for AI/statistical purposes without opt-in consent under low-risk conditions, and adds protections for under-16s. Direction is looser than PDPA-style consent. (S42)
7. **Singapore.** MOH/HSA/Synapxe AI in Healthcare Guidelines v2.0 published 10 Mar 2026; software that detects, diagnoses, monitors or manages a medical condition is a regulated medical device (HSA); PDPA applies to personal data. HealthHub unification by Nov 2026. (S23, S43)
8. **India.** DPDP Rules 2025 notified 14 Nov 2025 with 18-month phased compliance; consent-manager provisions effective about 13 Nov 2026; verifiable parental consent for children with exemptions for essential services such as healthcare. ABDM has issued about 94 crore ABHA numbers and linked over 105 crore records (press, Jul 2026). (S44)
9. **Indonesia.** PDP Law cited by Halodoc as compliance basis (company statement; statute details not verified here). (S33)

---

## 5. What this means for RooSuk (observations, not recommendations)

- Whitespace: no product found in Asia combines **daily check-in/Health Score + lab scan + doctor-ready passport + family + marketplace + granular consent in Thai**. Ant Afu is closest, but only in China.
- Price anchors: Asken ~JPY 480/mo (older figure); Keep RMB 19 vs RMB 68 AI tier; Boohee RMB 15-18/mo; HealthifyMe INR 999/mo; KonsultaMD PHP 150/mo unlimited consults; Ultrahuman Vision Cloud is **free**. Free lab-interpretation is a real price ceiling for RooSuk's lab feature.
- Consent: China (separate consent), India (consent managers, phased DPDP) and Korea (AI Basic Act explanation and human oversight for health) point the same direction as RooSuk's granular consent; Japan is moving the other way for AI training use.
- Safety: China forbids AI replacing doctors in diagnosis/prescribing and Korea/Singapore regulate diagnostic software, consistent with RooSuk's "AI never diagnoses" rule.

---

## 6. Sources (accessed 2026-10)

All via WebSearch result pages; "(search)" means I only saw the search summary. Not fetched in full because WebFetch was egress-blocked.

- S1 Ant Group, AQ 150M users (Business Wire, 10 Sep 2026): https://www.businesswire.com/news/home/20260910921103/en/Ant-Groups-AI-Health-App-AQ-Reaches-150-Million-Users-as-It-Expands-AI-powered-Day-to-day-Health-Use-Cases (search)
- S2 SMB Tech: https://smbtech.au/news/ant-groups-ai-health-app-aq-hits-150-million-users-amid-push-into-wellness-management/ (search)
- S3 Ant Group press release, AQ 15M MAU upgrade / Afu (Dec 2025): https://www.antgroup.com/en/news-media/press-releases/1765779300000 (search)
- S4 Tmtpost English, Ant Afu: https://en.tmtpost.com/post/7810518 ; Yicai: https://www.yicaiglobal.com/news/ant-afu-has-become-chinas-top-ai-health-management-app (search)
- S5 Chinese commentary: https://www.tmtpost.com/8137230.html ; https://news.qq.com/rain/a/20260205A03WYS00 ; https://m.mp.oeeee.com/a/BAAFRD0000202603231543932.html ; https://finance.sina.com.cn/wm/2026-03-23/doc-inhrysxn1058662.shtml ; https://www.aibase.com/news/24080 (search)
- S6 Ping An Good Doctor 2025 results: https://www.prnewswire.com/news-releases/ping-an-good-doctor-reports-2025-annual-results-corporate-health-management-business-posts-strong-growth-ai-healthcare-deployment-accelerates-302723380.html
- S7 Alibaba Health FY2026: https://www.tipranks.com/news/company-announcements/alibaba-health-delivers-strong-fy2026-profit-growth-and-advances-smart-healthcare-push ; https://www.pingwest.com/w/217593
- S8 JD Health: https://ir.jd.com/news-releases/news-release-details/jdcom-announces-fourth-quarter-and-full-year-2025-results-and ; https://jdcorporateblog.com/jd-health-introduces-groundbreaking-llm-powered-suite-for-comprehensive-online-and-in-hospital-healthcare-scenarios/
- S9 Tencent Health: https://www.xhby.net/content/s68d26275e4b063ea58bd2b8c.html ; https://m.mp.oeeee.com/a/BAAFRD0000202509291128330.html ; https://www.cnbc.com/2026/06/22/tencent-ai-assistant-wechat-china.html
- S10 Boohee: https://36kr.com/p/3787445432720393 ; https://ai.boohee.com/ ; https://apps.apple.com/cn/app/%E8%96%84%E8%8D%B7%E5%81%A5%E5%BA%B7-ai%E5%87%8F%E8%82%A5%E5%81%A5%E8%BA%AB%E8%BD%BB%E6%96%AD%E9%A3%9F%E4%BD%93%E9%87%8D%E7%AE%A1%E7%90%86%E5%B9%B3%E5%8F%B0/id457856023
- S11 Keep: https://www.hkexnews.hk/listedco/listconews/sehk/2026/0325/2026032500119.pdf ; https://www.tmtpost.com/8129155.html
- S12 Huawei Health: https://www.huaweicentral.com/huawei-health-app-reaches-400-million-global-users/ ; https://pandaily.com/huawei-harmonyos-7-launch-hdc-2026-ai-agent-jun2026
- S13 Xiaomi/Zepp: https://www.zepp.com/ ; https://apps.apple.com/us/app/mi-fitness-xiaomi-wear-lite/id1493500777
- S14 Samsung Health Assistant: https://www.samsungmobilepress.com/articles/health-assistant-beta-ai-powered-wellness ; https://www.droid-life.com/2026/07/21/samsung-health-gets-fully-ai-powered-health-assistant/ ; https://en.wikipedia.org/wiki/Samsung_Health ; https://www.thaiappcenter.com/samsung-health/
- S15 Kakao PASTA: https://www.koreabiomed.com/news/articleView.html?idxno=23269 ; https://www.koreajoongangdaily.com/business/kakao-healthcare-rolls-out-glucose-monitoring-service-pasta/11635589 ; https://www.koreaherald.com/article/3317511 ; https://www.koreabiomed.com/news/articleView.html?idxno=26863 ; https://www.koreabiomed.com/news/articleView.html?idxno=30120 ; https://cloud.google.com/customers/kakao-healthcare-ai
- S16 Naver: https://www.koreabiomed.com/news/articleView.html?idxno=21344 ; https://www.koreatimes.co.kr/amp/business/companies/20251031/naver-partners-with-inbody-to-enter-global-digital-health-care-market ; https://www.mobihealthnews.com/news/asia/snuh-naver-launch-korean-style-medical-llm-kmedai
- S17 LifeSemantics and Korea market: https://koreatechdesk.com/life-semantics-korean-startup-making-personalized-health-management-a-digital-possibility ; https://www.healthcareitnews.com/news/asia/the-digital-health-sector-in-south-korea-promising-investment-target-global-companies ; https://www.kedglobal.com/food-beverage/newsView/ked202303170020
- S18 Asken: https://www.asken.inc/news/20260527 ; https://www.asken.inc/news/20260617 ; https://www.asken.inc/news/20250529-asken-update ; https://www.asken.inc/news/20241220-aianalysis ; https://play.google.com/store/apps/details?id=jp.co.greenhouse.asken
- S19 chocoZAP/RIZAP: https://prtimes.jp/main/html/rd/p/000000004.000121693.html ; https://www.nikkei.com/article/DGXZQOUC29AIY0Z20C23A5000000/ ; https://chocozap.jp/service/application
- S20 Welby: https://karte.welby.jp/patient/faq.html ; https://welby.jp/category/news/250514101000.html ; https://welby.jp/post-9261/
- S21 MySOS/Koki/others: https://dena.com/jp/news/4989/ ; https://apps.apple.com/jp/app/%E5%BA%B7%E8%A8%98-%E5%81%A5%E8%A8%BA%E7%B5%90%E6%9E%9C%E3%82%92ai%E3%81%8C%E3%82%84%E3%81%95%E3%81%97%E3%81%8F%E8%A7%A3%E8%AA%AC/id6773383872 ; https://apps.apple.com/jp/app/kantesti-ai%E8%A1%80%E6%B6%B2%E6%A4%9C%E6%9F%BB/id6751127324
- S22 Healthy 365: https://www.healthhub.sg/programmes/healthyliving ; https://www.tech.gov.sg/products-and-services/for-citizens/health/healthy-365/ ; https://www.asiaone.com/singapore/step-challenge-you-can-now-collect-hpbs-free-fitness-tracker-vending-machines-island-wide
- S23 HealthHub and unification: https://support.healthhub.sg/hc/en-us/articles/30950994311705-What-is-HealthHub-What-are-some-of-the-key-features-of-HealthHub-Where-does-HealthHub-retrieves-information-from ; https://www.synapxe.sg/media-releases/collaboration/healthcare-apps-unified-healthhub-2026 ; https://www.moh.gov.sg/newsroom/streamlining-digital-apps-of-public-healthcare-providers-for-better-user-experience/ ; https://www.asiaone.com/singapore/healthhub-app-nhg-nuhs-singhealth-health-buddy-moh-public-healthcare
- S24 Homage: https://www.homage.sg/resources/homage-series-c-singapore/ ; https://tracxn.com/d/companies/homage/__wCw3S0bfWvbFwmnDgMEQ8-_qLIcp0vtifU23aS-Kv0A
- S25 Doctor Anywhere: https://www.mobihealthnews.com/news/asia/doctor-anywhere-buys-thailands-biggest-telemedicine-platform ; https://doctoranywhere.com/
- S26 Ada: https://apps.apple.com/in/app/ada-your-health-portal/id1099986434 ; https://about.ada.com/press/200401-global-covid-19-assessment-and-screener/
- S27 HealthifyMe: https://en.wikipedia.org/wiki/HealthifyMe ; https://store.healthifyme.com/products/smart ; https://play.google.com/store/apps/details?id=com.healthifyme.basic&hl=en_US ; https://yourstory.com/2017/10/healthifyme-ria ; https://www.fittrackai.in/blog/healthifyme-pricing-2026-is-it-worth-it-honest-review (third-party) ; https://nutriscan.app/blog/posts/healthifyme-pricing-2026-india-plans-63a87b21d0 (third-party) ; https://techcrunch.com/2021/07/20/fitness-app-healthifyme-to-expand-worldwide-after-raising-75m-series-c-from-leapfrog-and-khosla-ventures/
- S28 Practo: https://www.practo.com/health-app ; https://play.google.com/store/apps/details?id=com.practo.fabric&hl=en_US
- S29 Tata 1mg: https://apps.apple.com/us/app/tata-1mg-healthcare-app/id554578419 ; https://www.1mg.com/downloadApp ; https://www.outlookbusiness.com/deeptech/tech/ultrahuman-partners-with-tata-1mg-to-further-expand-its-blood-vision-service-to-over-60-cities-across-the-country
- S30 Cult.fit: https://entrackr.com/fintrackr/cultfit-posts-rs-1216-cr-revenue-and-rs-481-cr-loss-in-fy25-10911945 ; https://www.bwdisrupt.com/article/cult-fit-narrows-fy25-losses-as-subscription-led-growth-strengthens-ahead-of-ipo-583734
- S31 Ultrahuman: https://cyborg.ultrahuman.com/press-releases/ultrahuman-launches-vision-cloud ; https://hitconsultant.net/2025/10/02/ultrahuman-launches-vision-cloud-and-99-blood-test-to-redefine-health-accessibility/ ; https://www.businessworld.in/article/ultrahuman-blood-vision-vision-cloud-india-launch-preventive-health-578952 ; https://futurefive.com.au/story/ultrahuman-unveils-ring-pro-jade-ai-health-coach ; https://techcrunch.com/2026/02/27/ultrahuman-unveils-new-smart-ring-as-it-awaits-u-s-clearance-after-oura-dispute/
- S32 Eka Care: https://www.eka.care/s/for-patients ; https://yourstory.com/2025/11/healthtech-startup-eka-care-ai-standardise-medical-records-doctor-patient ; https://www.digitalhealthnews.com/eka-care-launches-india-s-first-ai-medical-scribe-powered-by-its-own-purpose-built-llm-parrotlet-
- S33 Halodoc: https://www.idntimes.com/tech/trend/halodoc-luncurkan-hilda-asisten-ai-untuk-layanan-kesehatan-digital-00-6kn2w-jkg352 ; https://www.halodoc.com/artikel/hilda-sistem-ai-halodoc-yang-bikin-akses-kesehatan-jadi-lebih-simpel ; https://www.dealstreetasia.com/partner-content/innovation-powering-health-tech-platform-halodocs-award-winning-streak ; https://blog.google/company-news/inside-google/around-the-globe/google-asia/halodoc-uses-ai-improve-how-doctors-receive-feedback/
- S34 Alodokter / KlikDokter: https://mdi.vc/news/alodokter-launches-ai-powered-virtual-assistant-for-doctors ; https://katadata.co.id/digital/startup/640916119e1ba/alodokter-luncurkan-chatgpt-alni-khusus-untuk-dokter ; https://play.google.com/store/apps/details?id=id.codigo.klikdokter&hl=en&gl=US
- S35 Hello Health Group: https://hellohealthgroup.com/articles/announcement/hello-health-group-introduces-groundbreaking-generative-ai-community-bot/ ; https://play.google.com/store/apps/details?id=com.hellobacsi.app&hl=en
- S36 DoctorOnCall / MyDoc: https://www.doctoroncall.com.my/ ; https://www.mobihealthnews.com/news/asia-pacific/prudential-and-mydoc-launch-online-doctor-consultations-and-telemedicine-services
- S37 KonsultaMD: https://www.globe.com.ph/about-us/newsroom/consumer/konsulta-plus-unli-consult ; https://konsulta.md/content/frequently-asked-questions ; https://www.businesswire.com/news/home/20230529005203/en/Globe-Group-Revolutionizes-Healthcare-Access-in-the-Philippines-With-Launch-of-Groundbreaking-KonsultaMD-SuperApp
- S38 Market size: https://www.kenresearch.com/industry-reports/asia-pacific-digital-health-market ; https://www.grandviewresearch.com/industry-analysis/asia-pacific-digital-health-market-report ; https://www.researchandmarkets.com/reports/5561861/asia-pacific-digital-health-market-size-share-and
- S39 China AI health regulation: https://triviumchina.com/2025/11/05/nhc-releases-ai-for-the-medical-field/ ; https://practiceguides.chambers.com/practice-guides/healthcare-ai-2026/china ; https://pmc.ncbi.nlm.nih.gov/articles/PMC12412760/ ; https://cms.law/en/chn/legal-updates/china-releases-ai-content-labeling-rules ; https://www.silicon.co.uk/e-innovation/artificial-intelligence/ai-beijing-healthcare-526123
- S40 PIPL: https://www.cooley.com/news/insight/2021/2021-11-30-china-new-national-privacy-law ; https://www.chinalawvision.com/2025/03/data-protection-privacy/sensitive-personal-information-in-china/
- S41 Korea: https://www.cooley.com/news/insight/2026/2026-01-27-south-koreas-ai-basic-act-overview-and-key-takeaways ; https://www.lexology.com/library/detail.aspx?g=a312160d-f55c-411b-9967-372b28d314f1 ; https://www.koreabiomed.com/news/articleView.html?idxno=30655 ; https://practiceguides.chambers.com/practice-guides/digital-healthcare-2025/south-korea
- S42 Japan: https://www.morihamada.com/en/insights/newsletters/138006 ; https://www.bakermckenzie.com/en/insight/publications/2026/05/japan-appi-reform-key-changes ; https://www.ibanet.org/japan-health-data-reforms-ai ; https://zelojapan.com/en/lawsquare/56899
- S43 Singapore AI guidelines: https://www.dataguidance.com/news/singapore-moh-and-hsa-publish-updated-ai-healthcare ; https://isomer-user-content.by.gov.sg/3/23fb5b36-56b4-4abb-9370-75c9ddcaf3ed/AIHGle%202.0.pdf
- S44 India: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190655&reg=48&lang=2 ; https://www.pib.gov.in/PressReleasePage.aspx?PRID=2266979&reg=3&lang=1 ; https://organiser.org/2026/07/13/369540/bharat/from-abha-to-ai-how-ayushman-bharat-digital-mission-is-building-one-of-the-worlds-largest-digital-health-ecosystems/

## 7. Gaps and unverified items

- Could not read any page in full (WebFetch blocked); product feature detail relies on search summaries.
- Unverified: Ant Afu barcode/food-calorie logging and monetisation; Tencent, Alibaba, JD consumer record/wearable features and user counts; Naver Healthcare user counts and AI chat; LifeSemantics consumer user counts and the "Mediplus" name; "Carada" (Japan); Asken post-Aug-2026 prices; Ultrahuman total users and Thailand availability; Eka Care consumer AI lab explanation; Practo ABHA depth; Medix (PH) consumer app.
- Not covered: Hong Kong, Taiwan, Vietnam (beyond Hello Bacsi), Malaysia beyond DoctorOnCall/MyDoc, Bangladesh, Pakistan, Middle East. Hospital-system PHR apps (e.g. NHG/SingHealth) only via the HealthHub unification story.
