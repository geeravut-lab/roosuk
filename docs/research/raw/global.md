# Global competitor research for RooSuk (รู้สุข) — outside Asia

Access date: 2026-10 (research run 2026-10-05). Researcher: Claude (market-research subagent).

## 0. Method and reliability notes (read first)

- WebFetch was blocked by the sandbox egress proxy for nearly every vendor and press domain (openai.com, apple.com, blog.google, functionhealth.com, superpower.com, apps.apple.com, macrumors, prnewswire, eurekalert, sciencedaily and others). Only anthropic.com could be fetched directly. **All other facts below come from WebSearch result summaries** (which quote or paraphrase the vendor pages, press and third-party review sites). Therefore:
  - Prices marked "(3rd-party)" come from review or aggregator sites, not the vendor's own page. Several apps A/B-test or promote prices, so the numbers are indicative, not authoritative.
  - Anything not seen in a result is written **"unverified"**. I did not fill gaps from memory.
- Thai/Thailand availability is unverified for almost every product unless stated. For app-store languages I only list what a result showed.
- Currency: USD unless noted. RooSuk reference: Gold ~49 THB/mo (~$1.4), Premium ~89 THB/mo (~$2.5), 14-day Premium trial, Free-lite.

---

## 1. Executive takeaways for RooSuk

1. **Nobody in the global set covers RooSuk's whole bundle** (daily check-in + Health Score + AI food photo + lab scan with trend + Ask-AI + vault + shareable passport + family + marketplace + B2B + Thai UI). Closest "all-in-one" are Bevel (iOS only, records + nutrition + AI), Oura / Whoop (wearable-gated), and the big-tech assistants (ChatGPT Health, Copilot Health, Claude, Google Health Coach) — but those are US/limited-region, wearable- or chatbot-centric, and none are Thai.
2. **Price gap is huge in RooSuk's favour.** Cal AI ~$2.49/mo annual (3rd-party); Oura $5.99/mo; Bevel Pro $14.99/mo; Google Health Premium $9.99/mo; Function $365/yr; Superpower $349/yr. RooSuk at ~$1.4 to ~$2.5/mo is at the very bottom, comparable only to promo-priced food trackers (Yazio ~$24–48/yr promo/list).
3. **Big tech is converging on the same pattern** — connect Apple Health / wearables / medical records, explain labs in plain language, "not a diagnosis", no model training on health data — in 2026: ChatGPT Health (Jul 2026, US rollout), Microsoft Copilot Health (Mar 2026, US), Claude health connectors (Jan 2026, US Pro/Max), Google Health Coach (May 2026, 37 countries), Samsung Health Assistant (Jul 2026 US beta), Apple redesigned Health app (iOS 27.2 beta, US English first). **None launch in Thai**; Google Health Coach is explicitly not in Thailand. This is RooSuk's window: Thai-language, Thai-law (PDPA) consent, Thai price points.
4. **Regulatory pattern:** everyone avoids diagnosis (Samsung, Microsoft, OpenAI, Anthropic wording). Privacy experts criticise ChatGPT Health / Copilot Health for being outside HIPAA. RooSuk's granular, separate PDPA consent per data type is a genuine differentiator vs the US norm of one blanket terms-of-service.
5. **Food-photo AI accuracy is a documented weakness** (NIH-affiliated NUTRITION 2026 study: four apps undercounted by 250–345 kcal per meal). RooSuk should present AI estimates as editable ranges, never as precise, and keep a user-confirm step.
6. **Gaps in the market that RooSuk already targets:** doctor-ready shareable passport / pre-doctor brief (only Withings Cardio Check-Up and Apple/ChatGPT "prepare for appointment" cover parts), family sharing with granular consent, B2B corporate plan in an emerging market, supplement marketplace with claim guardrails (Superpower has a member supplement marketplace but with US prescriptions).

---

## 2. Comparison table

Legend: Y = has; P = partial; N = not seen in sources; ? = unverified. Features map to RooSuk list: **Food** = AI food photo scan/barcode; **Lab** = lab upload/extract/trend/explain; **Chat** = AI chat on own data; **Wear** = wearable/Apple Health import; **Score** = daily score/streak; **Doc** = records vault / doctor sharing; **Fam** = family sharing; **Mkt** = supplement/product marketplace.

| #   | Product                                 | Company / country                                                                  | Status (2026)                                                                     | Food                             | Lab                                                         | Chat                             | Wear                                       | Score                     | Doc/Share                   | Fam                             | Mkt                                           | Pricing (USD)                                                                                     | Thai / Thailand                                                               |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- | -------------------------------- | ------------------------------------------ | ------------------------- | --------------------------- | ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Cal AI                                  | Cal AI Inc. (US); acquired by MyFitnessPal (closed Dec 2025, announced 2 Mar 2026) | Live; Apple briefly pulled it Apr 2026 over billing                               | Y (photo)                        | N                                                           | N                                | ?                                          | N                         | N                           | Family plan                     | N                                             | Free; $9.99/mo; $29.99/yr; Family $59.99/yr (3rd-party; paywall A/B-tested)                       | Unverified                                                                    |
| 2   | MyFitnessPal (Meal Scan, Voice Log)     | MyFitnessPal (US, Francisco Partners)                                              | Live                                                                              | Y (Meal Scan, Premium)           | N                                                           | P (assistant, unverified detail) | Y (integrations, unverified list)          | streaks                   | N                           | N                               | N                                             | Premium $79.99/yr or $19.99/mo; Premium+ $99.99/yr or $24.99/mo (3rd-party)                       | Meal Scan/Voice Log shown only for English setting; Thailand unverified       |
| 3   | Lose It! (Snap It)                      | FitNow (US)                                                                        | Live                                                                              | Y (Snap It, Premium)             | N                                                           | N                                | Y                                          | gamified                  | N                           | N                               | N                                             | Premium $39.99/yr or $9.99/mo; another source $79.99/yr (3rd-party, conflicting)                  | Unverified                                                                    |
| 4   | Noom                                    | Noom Inc. (US)                                                                     | Live; pivoted to GLP-1 telehealth                                                 | Y (AI food logging)              | N                                                           | P (AI coach check-ins)           | Y (steps)                                  | P                         | N                           | N                               | N                                             | Med/GLP-1 tiers ~$179–$299/mo incl. medication; telehealth-only $99/mo after $39 (3rd-party)      | App languages listed: no Thai seen                                            |
| 5   | YAZIO                                   | YAZIO (Germany)                                                                    | Live                                                                              | Y (PRO)                          | N                                                           | N                                | Y                                          | P                         | N                           | N                               | N                                             | PRO ~$23.90/yr promo, ~$43.99–47.90/yr list (3rd-party)                                           | 20 languages, Thai not listed                                                 |
| 6   | Lifesum                                 | Lifesum (Sweden)                                                                   | Live                                                                              | Y (Premium)                      | N                                                           | N                                | Y                                          | P                         | N                           | N                               | N                                             | Premium $44.99–$119.99/yr depending on promo (3rd-party)                                          | Thai listed on Android (one source); unverified for iOS                       |
| 7   | SnapCalorie                             | SnapCalorie (US; ex-Google founders)                                               | Live; low visibility 2026                                                         | Y (photo + LiDAR on Pro iPhones) | N                                                           | N                                | N                                          | N                         | N                           | N                               | N                                             | Free 3 AI logs/day; premium ~EUR 89.99/yr (3rd-party, Aug 2026)                                   | Unverified                                                                    |
| 8   | Bevel                                   | Finerpoint, Inc. (US)                                                              | Live; app free since Dec 2025, AI paid                                            | Y (barcode/photo/text)           | Y (Health Records, Pro)                                     | Y (Bevel Intelligence)           | Y (Apple Health)                           | Y (recovery/sleep/strain) | P                           | N                               | N                                             | Free core; Pro $14.99/mo or $99.99/yr; AI credit packs up to $49.99                               | Unverified; iOS only                                                          |
| 9   | Function Health                         | Function Health (US); acquired Ezra                                                | Live, US only                                                                     | N                                | Y (160+ tests, explanations)                                | Y (Private AI Chat)              | P                                          | N                         | Y (clinician summary)       | N                               | N                                             | $365/yr (3rd-party; was $499)                                                                     | US only; Thailand not offered (unverified outside US)                         |
| 10  | Superpower                              | Superpower (US, Los Angeles)                                                       | Live, 37+ US states                                                               | N                                | Y (150+ biomarkers, 2 draws)                                | Y (AI + care team)               | P                                          | N                         | N                           | N                               | Y (member-priced supplement marketplace + Rx) | $349/yr from 1 Sep 2026 (was $199); HSA/FSA eligible                                              | US only                                                                       |
| 11  | InsideTracker                           | InsideTracker/Segterra (US)                                                        | Live                                                                              | N                                | Y (upload own labs; tests)                                  | P (recommendations)              | Y                                          | InnerAge                  | N                           | N                               | N                                             | Membership $149/yr; Ultimate test ~$589 (~$340 for members); InnerAge $99 (3rd-party)             | Unverified                                                                    |
| 12  | Whoop Advanced Labs + Whoop Coach       | Whoop (US)                                                                         | Live; labs open to non-members since 18 Aug 2026                                  | N                                | Y (75 biomarkers; uploads for all members)                  | Y (Coach, OpenAI)                | Y (native)                                 | Y                         | P                           | N                               | N                                             | Labs $199/yr (1 test), $349 (2), $599 (4), $899 (6); membership One $199/yr, Peak $239, Life $359 | Labs: US, UAE (Unilabs); UK/EU/Canada/Australia "coming"; Thailand unverified |
| 13  | Oura Health Panels + Advisor            | Oura (Finland/US)                                                                  | Live                                                                              | N                                | Y (50 biomarkers via Quest; Lab Uploads from 30 Jun 2026)   | Y (Oura Advisor)                 | Y (native)                                 | Y                         | N                           | N                               | N                                             | Membership $5.99/mo or $69.99/yr; panel $99 ($74.25 promo)                                        | Panels US only (Quest); Thailand unverified                                   |
| 14  | Ultrahuman Blood Vision / Vision Cloud  | Ultrahuman (India)                                                                 | Live                                                                              | N                                | Y (60+ / 120+ biomarkers; free analysis tool for uploads)   | P                                | Y (ring, CGM)                              | Y                         | N                           | N                               | N                                             | Essentials $99; Annual from $499; India Rs 999–1,999+                                             | US, India, UAE, KSA; UK/Australia planned; Thailand unverified                |
| 15  | Levels                                  | Levels Health (US)                                                                 | Live                                                                              | Y (AI food logging)              | P (lab panels in Core/Complete)                             | P                                | Y (CGM)                                    | Y (metabolic score)       | P                           | N                               | N                                             | App-first ~$15/mo or $80/yr (sensors extra); Core $499/yr; Complete $1,999/yr (3rd-party)         | Unverified                                                                    |
| 16  | ZOE                                     | ZOE (UK)                                                                           | Live                                                                              | P (Daily30/food scores)          | N (gut microbiome test)                                     | P                                | N                                          | Y (food scores)           | N                           | N                               | Y (Daily30 supplement)                        | US: Core $9.99/mo (12 mo); UK GBP 9.99/mo + GBP 149 test; Daily30 from $33 trial pack             | Unverified                                                                    |
| 17  | Sano AI                                 | Sano (unverified HQ)                                                               | Live (App Store listing)                                                          | N                                | Y (photo/PDF of reports, plain-language)                    | Y                                | N                                          | N                         | P                           | N                               | N                                             | Unverified                                                                                        | Languages listed: EN/TR/ES/AR/DE/FR+; Thai unverified                         |
| 18  | MyLabcorp (AI)                          | Labcorp (US)                                                                       | Launched 20 May 2026                                                              | N                                | Y (Labcorp results, trends, AI explanation; OpenAI models)  | Y                                | N                                          | N                         | P                           | N                               | N                                             | Unverified (free consumer app implied; not confirmed)                                             | US                                                                            |
| 19  | Apple Health + Health Records           | Apple (US)                                                                         | Health Records in US/UK/Canada; redesigned Health app in iOS 27.2 beta (Sep 2026) | N                                | Y (add labs; Quest $119 50-biomarker panel, US, later 2026) | P (Apple Intelligence insights)  | Y                                          | Y (readiness, Health Age) | P                           | Y (Share)                       | N                                             | Free in OS; "Health+" AI coach not launched                                                       | US English first; Thailand unverified                                         |
| 20  | Fasten Health                           | Fasten (US, open source)                                                           | Repo archived 18 Jul 2026 per search; community-maintained                        | N                                | P (FHIR records)                                            | N (planned)                      | N                                          | N                         | Y (self-hosted PHR)         | Y (multi-user)                  | N                                             | Free, self-hosted                                                                                 | Unverified (needs US/FHIR providers)                                          |
| 21  | Google Health app + Gemini Health Coach | Google (US)                                                                        | Live from 19 May 2026, 37 countries, 32 languages                                 | N                                | P (unverified)                                              | Y                                | Y (Fitbit/Pixel)                           | Y                         | P                           | N                               | N                                             | Google Health Premium $9.99/mo or $99.99/yr; included in Google AI Pro/Ultra                      | **Thailand NOT in list**; Thai not in listed languages                        |
| 22  | Samsung Health Assistant                | Samsung (South Korea)                                                              | Beta from 21 Jul 2026, eligible US users                                          | N                                | N                                                           | Y                                | Y (Galaxy devices)                         | P                         | N                           | N                               | N                                             | Unverified (beta)                                                                                 | US only                                                                       |
| 23  | Withings (Withings+, Cardio Check-Up)   | Withings (France)                                                                  | Live                                                                              | N                                | N                                                           | Y (Withings Intelligence)        | Y (native devices)                         | P                         | Y (cardiologist ECG review) | Y (family accounts, unverified) | N                                             | Withings+ ~$99.50/yr or $10/mo                                                                    | Unverified                                                                    |
| 24  | ChatGPT Health                          | OpenAI (US)                                                                        | Launched 23 Jul 2026 (US web/iOS); beta from Jan 2026                             | P (via MyFitnessPal connector)   | Y (medical records, labs, US)                               | Y                                | Y (Apple Health)                           | N                         | N                           | N                               | N                                             | Included in Free, Go, Plus, Pro                                                                   | Not EEA/UK/CH; US records only; Thai not confirmed                            |
| 25  | Claude health integrations              | Anthropic (US)                                                                     | Beta from Jan 2026, US Pro/Max                                                    | N                                | Y (HealthEx, Function)                                      | Y                                | Y (Apple Health, Health Connect)           | N                         | N                           | N                               | N                                             | Requires Claude Pro/Max                                                                           | US only                                                                       |
| 26  | Microsoft Copilot Health                | Microsoft (US)                                                                     | Announced 12 Mar 2026; opened to all US users                                     | N                                | Y (labs, 50k+ US providers)                                 | Y                                | Y (50+ wearables incl. Apple Health, Oura) | N                         | P (visit prep)              | N                               | N                                             | Free at first; subscription planned                                                               | US only                                                                       |
| 27  | Ada                                     | Ada Health (Germany)                                                               | Live, 11M+ users reported                                                         | N                                | N                                                           | Y (symptom assessment)           | N                                          | N                         | P                           | N                               | N                                             | Free (app)                                                                                        | Thai not listed                                                               |
| 28  | Babylon Health                          | Babylon (UK)                                                                       | **Defunct** (2023)                                                                | –                                | –                                                           | –                                | –                                          | –                         | –                           | –                               | –                                             | –                                                                                                 | –                                                                             |

---

## 3. Per-product notes

### 3.1 AI food / calorie scanners

**Cal AI** (US; owned by MyFitnessPal since Dec 2025 deal, announced 2 Mar 2026)

- Launch/status: founders Zach Yadegari and Henry Langmack bootstrapped to ~$50M ARR in 18 months; MyFitnessPal acquired it (reported $50M exit). Apple pulled it from the App Store in Apr 2026 over in-app-purchase bypass and misleading subscription pricing, then restored it after fixes (nutrogine / eesel / Calsy summaries; 3rd-party, verify before quoting).
- Target: young, speed-first calorie trackers. Features: photo/barcode/text logging, calorie and macro goals. No labs, no chat, no Health Score. Family plan exists.
- Pricing (3rd-party): free tier limited; $9.99/mo; $29.99/yr (~$2.49/mo); family $59.99/yr; aggressive paywall A/B (reported $2.99/wk, $5.99/mo, $19.99/yr, $49.99/yr variants).
- Accuracy: 3rd-party reviews say ~85–92% on simple whole foods and 25–50% variance on mixed dishes; NIH-linked NUTRITION 2026 study found undercount of 250–345 kcal/meal. MFP CEO to TechCrunch: Cal AI is for "speed over accuracy".
- Lessons for RooSuk: an aggressive-paywall app got into Apple review trouble; RooSuk's rule of showing identical plans/prices in A/B is the right call.
- Sources: eesel.ai pricing, nutrogine deep-dive, Calsy review, TechCrunch-quoted CEO statement via nutrogine.

**MyFitnessPal (Meal Scan / Voice Log)** (US)

- Meal Scan (photo, incl. upload from gallery) and Voice Log are Premium-only; Premium includes barcode scan, voice logging, macro gram-level tracking. Meal Scan documented for English setting; Voice Log US iOS/Android English.
- Pricing (3rd-party): Premium $79.99/yr or $19.99/mo; Premium+ $99.99/yr or $24.99/mo (adds meal plan builder, grocery lists with delivery).
- Lacks: lab scan, doctor passport, Thai UI (unverified). Also owns Cal AI now. Tested in the NUTRITION 2026 study (underestimated calories and fat).
- Sources: MFP blog (meal-scan), MFP support (Meal Scan FAQ, Voice Logging), fitbudd and nutriscan price pages.

**Lose It! (Snap It)** (US, FitNow)

- Snap It photo logging (Premium); recognises complete dishes; adds meal planning, nutrient timing, ad-free. Pricing per 3rd-party $39.99/yr, $9.99/mo; one source says $79.99/yr (conflict — unverified). Tested in the NUTRITION 2026 study. Thai unverified.

**Noom** (US)

- Psychology-based behaviour program, AI food logging (1M+ items), AI coach check-ins, step tracking with rewards, "body scan" health insights; since 2025 GLP-1 prescriptions via Noom Med. Pricing (3rd-party): Microdose GLP-1 $49 then $179/mo; GLP-1 $129 then $249; tirzepatide tier $149 then $299; telehealth-only $39 then $99/mo. App languages listed in the App Store result: English, German, Korean, Spanish, Arabic, Russian, Chinese, French, Portuguese, Vietnamese, Traditional Chinese — no Thai seen.
- Weakness (positioning): weight-loss focus is the opposite of RooSuk's "reward showing up, never weight" rule; shows where the revenue in this category went (telehealth + GLP-1).

**YAZIO** (Germany)

- Calorie tracker with fasting and recipes; AI photo logging gated to PRO. 3rd-party price ~$23.90/yr promo, $43.99–$47.90/yr list. Available in 150+ markets, 20 languages (Chinese, Japanese, Korean, European; Thai not listed). No labs, no chat.

**Lifesum** (Sweden)

- AI photo scanner behind Premium; annual $44.99–$119.99 depending on promo (3rd-party). iOS language list lacks Thai; Android list showed Thai in one source — unverified.

**SnapCalorie** (US)

- Founded by ex-Google AI researchers (Google Lens / Cloud Vision); uses depth/LiDAR on iPhone Pro to estimate volume; claims ~15% mean calorie error and a peer-reviewed paper with Google AI; an independent comparison reported ±19.8% MAPE (weakest in that test) — conflicting, treat as unverified. Free 3 AI logs/day; premium ~EUR 89.99/yr (Aug 2026, 3rd-party). Company activity described as quiet in 2026.

**Bevel** (US, Finerpoint, Inc.)

- iPhone + Apple Watch app; pulls Apple Health/wearables/health records; scores for recovery, sleep, strain, stress, energy bank; nutrition tracking (barcode, photo, recipe, text; 6M+ foods); strength builder; journal; cycle tracking. Made free in Dec 2025; paid tier "Bevel Pro" = Bevel Intelligence (AI chat/coach: why did recovery fall, training plans, conversational food logging, proactive check-ins), Health Records, Biological Age. App Store price per result: Pro $14.99/mo, $99.99/yr, plus AI credit packs up to $49.99.
- Closest single-app analogue to RooSuk's data model (score + nutrition + records + AI), but iOS-only, no family, no passport, no marketplace, no Thai (unverified).

### 3.2 Blood-test / longevity platforms

**Function Health** (US; acquired Ezra full-body MRI in 2025)

- 160+ lab tests/yr via 2,000+ US lab sites, no insurance; each result explained by clinicians; "Private AI Chat" on your results; Protocols; SOC 2 Type II verified and "HIPAA-aligned" (vendor wording via search). Price: $365/yr (3rd-party, 2026; reduced from $499 after Nov 2025 Series B, $298M at $2.5B valuation). 30 Jul 2026: $450M non-dilutive revenue-linked financing from General Catalyst's Customer Value Fund (valuation held at $2.5B). Launched "Medical Intelligence Lab". Integrates with Claude, ChatGPT (as reported) and (Mar 2026) Perplexity and Microsoft Copilot. MRI via Ezra $899 for members (3rd-party; earlier $499 promo).
- Weakness: US-only, high price, lab-draw model (not an everyday habit loop); critics question valuation (newmarketpitch).
- Thai: not offered (outside US unverified).

**Superpower** (US, LA, founded 2023)

- 100–150+ biomarkers across two draws/yr (Quest, 37+ states), AI-assisted dashboard, care team messaging, member-priced supplement marketplace and prescription access. Price rose from $199 to $349/yr on 1 Sep 2026 (Labor Day promo $299), HSA/FSA eligible; more in NY/NJ (3rd-party).
- Relevant to RooSuk: the closest example of lab + AI + **supplement marketplace** in one membership. US-only.

**InsideTracker** (US)

- Blood/DNA/wearable "InnerAge" biological age plus recommendations. Membership $149/yr (upload labs, wearable sync, recommendations); Ultimate test ~$589 (~$340 for members); InnerAge $99/calc (3rd-party). Thai unverified.

**Whoop Advanced Labs + Whoop Coach** (US)

- Advanced Labs: 75-biomarker "Comprehensive Health" test; $199/yr (1 test), $349 (2), $599 (4), $899 (6); since 18 Aug 2026 sold without a Whoop membership; GRAIL multi-cancer test added (Fierce Healthcare). Lab uploads opened to all members globally in a phased rollout; official testing in UAE (Unilabs, Feb 2026); UK/EU/Canada/Australia "coming" per emails. Whoop Coach (OpenAI-powered, since Sep 2023) answers questions using the member's biometric data. Memberships: One $199/yr, Peak $239, Life $359 (3rd-party). Thailand unverified.

**Oura (Health Panels, Advisor, Lab Uploads)** (Finland/US)

- Health Panels with Quest: 50 biomarkers, $99 ($74.25 promo seen), blood draw at ~2,000 Quest sites (US). Biomarkers linked to sleep/readiness/activity. Oura Advisor (AI) explains results. Lab Uploads (any provider PDF) rolling out 30 Jun 2026. Membership required: $5.99/mo or $69.99/yr; needs Gen3/Ring 4. HSA/FSA eligible. Thai unverified.

**Ultrahuman Blood Vision / Vision Cloud** (India)

- Blood Vision Essentials $99 (60+ biomarkers); Annual plan from $499 (120+); India Rs 999+/Rs 1,999 base, 60+ cities with Tata 1mg; UAE and Saudi live; UK and Australia planned; Vision Cloud offers free analysis of uploaded results (TechRadar/Wareable via search). Regulatory status (FDA etc.) unverified. Notable as an Asia-adjacent but non-Thai example of "free analysis to funnel into a paid test".

**Levels** (US)

- Started as a CGM app; now AI food logging, metabolic scoring, programs. App-first membership ~$15/mo or ~$80/yr (sensors extra); Core $499/yr and Complete $1,999/yr bundles with lab panels (3rd-party). No acquisition information found — unverified.

**ZOE** (UK)

- Gut microbiome test + app; CGM and blood-fat testing removed from the new kit, glucose/fat responses now predicted algorithmically. US: Core $9.99/mo (12-mo rolling), Start $24.99/mo for 4 mo; UK GBP 9.99/mo after GBP 149 test (price cut at turn of 2025, losses widened per The Grocer). Daily30 supplement from $33 trial pack, $65 monthly, $220 per 4 months. Thai unverified. Relevant: a supplement line attached to a data app (marketplace precedent).

### 3.3 AI lab-result explainers and personal health records

**Sano AI** (App Store: "Sano AI: Health Assistant"): upload lab reports, radiology, discharge summaries, clinic notes as photo/PDF and get plain-language educational summaries; multilingual (English, Turkish, Spanish, Arabic, German, French and more). Pricing/company/regulatory status unverified. Others seen in results (not investigated in depth): Kantesti (100+ languages, highlights abnormal values, nutrition modules), BloodGPT (extracts biomarkers and checks reference ranges), Wizey, TestResult.ai, ReadYourLab, AI Lab Results Analyzer. These are the true "lab scan + explain" competitors; most are small, single-feature, web or app-store tools with no longitudinal vault, no consent model and no doctor passport.

**MyLabcorp** (Labcorp, US): launched 20 May 2026; Labcorp results with trend tracking, AI assistant for real-time explanation (partly powered by OpenAI reasoning models), clinically reviewed content (cardiometabolic, kidney), scheduling and billing. Labcorp survey: 55% see AI as important for understanding health information; 41% already use it to interpret lab results. Only Labcorp results (not any lab) per summaries; price unverified. US.

**Apple Health Records / Health app**: Health Records download is available in the US, UK and Canada. September 2026: redesigned Health app (iOS 27.2 beta) with Insights tab, readiness score, "Health Age" in a Longevity tab, guided camera-based movement assessments, add lab results (manually or from records), and a $119 Quest 50-biomarker panel purchasable in-app for US users later in 2026. Starts in US English, more languages later. The rumoured paid "Health+" AI coach (Project Mulberry) was scaled back in Feb 2026 and pushed later in the iOS 27 cycle; no launch confirmed as of Oct 2026 (Business Standard, techstory, Wareable via search). Privacy/claims: Apple's on-device positioning (details unverified).

**Fasten Health**: open-source, self-hosted personal/family record aggregator using FHIR/SMART-on-FHIR with US providers; repo reported archived 18 Jul 2026 (distinct from Fasten Connect). Planned conversational interface never confirmed. Relevant as a precedent for family-oriented record vault, but needs US FHIR endpoints (no Thai equivalent).

**"MyHealth by AI" / DocDroid**: no reliable match found in searches; not covered (see Gaps).

### 3.4 Platform AI coaches, assistants and symptom checkers

**Google Health app + Gemini Health Coach** (Google, US): Fitbit app replaced by "Google Health" in May 2026; coach public preview began 28 Oct 2025 (Android, US), iOS and more countries Feb 2026, broad launch 19 May 2026 with Google Health Premium ($9.99/mo or $99.99/yr; included in Google AI Pro/Ultra). 37 countries and 32 languages (list includes Indonesia, Malaysia, Singapore, India, Japan, South Korea, Taiwan; **Thailand not listed, and Thai users were told to cancel Premium** per Fitbit Community thread). Supports fitness, sleep, health coaching on tracker data. Regulatory/disclaimer wording unverified.

**Samsung Health Assistant** (Samsung): beta for eligible US users from 21 Jul 2026; opt-in; uses Samsung Health data (sleep, activity, nutrition, mindfulness, vitals) from phone, watch, ring; insights validated by physicians and certified coaches; says it does not give medical advice, suggest treatments or diagnose. No global date announced.

**Withings** (France): Withings+ ~$99.50/yr (or ~$10/mo) includes "Withings Intelligence" AI insights and Cardio Check-Up (up to 4 per year; board-certified cardiologist reviews ECG within 24h, detects e.g. AFib). Body Scan 2 announced CES 2026, $599.95. Closest example of a clinician-in-the-loop check layer. Thai availability of subscription unverified.

**ChatGPT Health** (OpenAI): dedicated Health space; connect Apple Health and (US) medical records; apps such as Function, MyFitnessPal, Weight Watchers; January 2026 limited beta via waitlist (not EEA/UK/Switzerland), broad launch to US logged-in adults on web and iOS 23 Jul 2026 on Free/Go/Plus/Pro. Data encrypted, extra isolation, not used to train foundation models or for ads. Evaluated with HealthBench. Criticism: records leave HIPAA protection and are governed by terms of service (Startup Fortune and other privacy commentary). Thai support not confirmed.

**Claude (Anthropic)**: Jan 2026 consumer health integrations in beta for US Pro and Max: Apple Health (iOS), Health Connect (Android), HealthEx and Function. Read-only; explicit opt-in; users can disconnect; not used for training; "designed to include contextual disclaimers, acknowledge uncertainty and direct users to healthcare professionals" (anthropic.com, fetched directly).

**Microsoft Copilot Health**: announced 12 Mar 2026, US adults; 50+ wearable types and records from 50,000+ US providers; isolated, encrypted, not used for training or ads; explicitly not for diagnosing or treating; no HIPAA BAA for the consumer product; free at first, subscription planned; no non-US date.

**Ada** (Germany): CE-marked (Class IIa reported) symptom assessment, 11M+ users reported; says it gives suggestions not diagnosis; app removed in some countries (Ada editorial page, details unverified). Peer-reviewed vignette study (Australia): correct condition first in 65% (top-3 83%), urgency advice matched gold standard 63%. Thai not in app-store language lists.

**Babylon Health** (UK): once $4.2B at 2021 listing; collapsed Aug 2023 (US closed, UK businesses sold to eMed in Sep 2023); coverage attributes the fall to unproven clinical accuracy claims and overreach — the cautionary tale for any "AI doctor" claim. RooSuk's "never diagnose, always hand-off" guardrail is the opposite stance.

---

## 4. Market facts (with sources)

1. **Consumer AI health usage is mainstream.** KFF tracking poll (Mar 2026): ~32% of US adults use AI chatbots for health information or advice; 29% for physical health, 16% for mental health; up from 17% in Jun 2024; 65% cite speed/immediacy as the main reason. (kff.org)
2. **Market size (analyst reports — wide spread, treat as indicative):** digital health market $491.6B in 2026 to $2.35T by 2034 (Fortune Business Insights, 21.6% CAGR); digital health tracking apps $33.3B in 2026 (TBRC, 17.1% CAGR); digital health coaching $15.3B in 2026 to $26.7B by 2030 (TBRC/Research and Markets, ~15% CAGR); health coaching apps $5.1B in 2026 (10.2% CAGR); AI health coaching platforms $985M (2026) to $6.2B (2036), 20.2% CAGR (openpr release, low-reliability source).
3. **Food-photo AI undercounts.** NUTRITION 2026 (Hengist, NIDDK visiting fellow): four apps (MyFitnessPal, Lose It!, Cal AI, Appediet) tested on 102 metabolic-kitchen meals; all underestimated by 250–345 kcal and ~30 g fat (about one third), worst for high-fat/keto meals; carbs more accurate (Healio 4 Aug 2026; Medical Xpress Jul 2026; Medical Daily). Earlier literature: real-world food identification ~68–86%, portion estimation as low as 39%; one 2025 RCT: 86% dishes identified but 68% end-to-end correct; calories within ~30% from photo alone, ~14% when the user adds ingredients (fitia / ScienceDaily summaries; 3rd-party).
4. **US regulation is loosening for wellness/CDS.** FDA, 6 Jan 2026 updated General Wellness and Clinical Decision Support guidance: enforcement discretion for CDS giving a single clinically appropriate recommendation if clinicians can review the logic; non-invasive wearables estimating physiologic parameters can be general wellness if not for diagnosis and without prompting specific clinical action (Cooley, Ropes & Gray, Faegre Drinker, Greenberg Traurig).
5. **EU is tightening.** EU AI Act: general health chatbots and symptom checkers on hospital sites are limited-risk (transparency duties: users must know it is AI); clinical decision support and triage are high-risk; high-risk obligations nominally apply from Aug 2026, devices already under MDR get to Aug 2027 and an "AI Act Omnibus" proposal would push AI medical devices to Aug 2028 (quickbird, intuitionlabs, patientguard summaries). ChatGPT Health is withheld from the EEA/UK/Switzerland at launch (cybernews, OpenAI help via search).
6. **Thai law.** PDPA treats health data as sensitive personal data requiring explicit consent; PDPC issued draft guidelines on personal data in AI development and use on 17 Feb 2026; no standalone Thai AI law yet, risk-based framework expected; Thai FDA regulates medical devices including AI software (cookieinformation, Chambers 2026, regulations.ai, theleveragedyears).
7. **Privacy gap in consumer AI health.** Consumer ChatGPT Health and Copilot Health fall outside HIPAA (no BAA), prompting expert criticism (Startup Fortune, TechRepublic, Epstein Becker Green). Vendors answer with isolation, encryption and no-training pledges. A granular, separate-consent model is therefore a competitive claim, not just compliance.
8. **Blood-test memberships are consolidating and getting cheaper at the entry level while adding services.** Function cut to $365/yr and raised $298M at $2.5B (Nov 2025), then $450M revenue-linked (Jul 2026); Superpower rose to $349/yr; Whoop, Oura and Apple (Quest $119 panel) are all adding labs inside the wearable/OS app (Fierce Healthcare, Athletech, Quest newsroom via search).
9. **Subscription/App Store risk.** Apple removed Cal AI in Apr 2026 over billing design before restoring it (nutrogine summary; 3rd-party — verify).

---

## 5. Where RooSuk is differentiated / exposed (analysis, not sourced fact)

Strengths vs globals: Thai language and Thai consent law; very low price ($1.4–$2.5/mo vs $6–$30); single app that joins food, labs, Ask-AI, vault, passport, family and marketplace; no wearable lock-in; no weight-loss framing; B2B corporate plan for Thai employers.

Exposure: (a) Apple/Google/Samsung/OpenAI/Microsoft/Anthropic all ship "explain my labs + connect my wearable" for free or inside existing subscriptions; Thai-language support from them is a matter of time, so RooSuk's moat must be Thai data (Thai foods, Thai lab report formats and reference ranges, Thai hospitals), local trust and PDPA, not generic AI. (b) Food-photo accuracy claims are legally and reputationally risky; show ranges and require confirmation. (c) Supplement marketplace claims need the "no disease / weight-loss claims" guard already in RooSuk rules; Superpower and ZOE show the revenue model works but also US regulatory exposure. (d) Gold at ~$1.4/mo is far below any competitor; confirm unit economics against AI cost (Cal AI at $2.49/mo annual is the nearest price benchmark and spends heavily on paywall optimisation).

---

## 6. Sources (all accessed 2026-10 via WebSearch; WebFetch blocked except where noted)

**Food scanners**

- https://www.eesel.ai/blog/cal-ai-pricing
- https://nutrogine.com/blog/cal-ai-myfitnesspal-acquisition-deep-dive-2026
- https://calzy-app.com/blog/cal-ai-review
- https://mealthinker.com/blog/myfitnesspal-acquires-cal-ai
- https://blog.myfitnesspal.com/meal-scan/
- https://support.myfitnesspal.com/hc/en-us/articles/360045761612-Meal-Scan-FAQ
- https://blog.myfitnesspal.com/voice-logging/
- https://www.fitbudd.com/post/myfitnesspal-app-cost
- https://nutriscan.app/blog/posts/myfitnesspal-premium-vs-premium-plus-2026-6870e216fc
- https://www.fitbudd.com/post/lose-it-premium-review
- https://calorietrackerlab.com/reviews/lose-it/
- https://ai-health-apps.com/reviews/noom-review/
- https://nutriscan.app/blog/posts/noom-med-pricing-2026-glp1-program-cost-cae274c166
- https://apps.apple.com/us/app/noom-weight-loss-food-tracker/id634598719
- https://nutriscan.app/blog/posts/yazio-pricing-2026-free-vs-pro-what-pro-unlocks-33b26f8fc7
- https://help.yazio.com/hc/en-us/articles/208126989-How-can-I-change-the-language-of-the-app-or-the-database
- https://nutrola.app/en/blog/how-much-does-lifesum-cost-now-2026
- https://help.lifesum.com/en/article/how-can-i-change-the-language-in-the-app-android-ntk7cn/
- https://apps.apple.com/us/app/snapcalorie-ai-calorie-counter/id1574239307
- https://calorietrackerlab.com/reviews/snapcalorie/
- https://nutriscan.app/blog/posts/nutriscan-vs-snapcalorie-ai-food-tracker-e2e26890e9
- https://apps.apple.com/us/app/bevel-ai-health-coach/id6456176249
- https://australianapplenews.com/2026/01/07/review-bevel-a-health-app-that-ticks-almost-all-the-boxes/
- https://product.ferryman.app/en/articles/2026-09-01-bevel-data-coach/

**Blood-test / longevity**

- https://en.wikipedia.org/wiki/Function_Health
- https://www.bloodtestcomparison.com/function-health
- https://techcrunch.com/2025/11/19/function-health-closes-298m-series-b-at-a-2-5b-valuation-launches-medical-intelligence/
- https://valueaddvc.com/blog/function-health-450m-financing-2026-why-valuation-stayed-at-2-5b
- https://www.fiercehealthcare.com/health-tech/function-health-acquires-ezra-combine-lab-testing-and-ai-powered-medical-imaging
- https://clpmag.com/lab-essentials/information-technology/function-health-integrates-lab-data-chatgpt-app/
- https://apps.apple.com/us/app/function-health/id6471280307
- https://superpower.com/ and https://superpower.com/faqs
- https://athletechnews.com/superpower-blood-test-review/
- https://www.bloodtestcomparison.com/superpower
- https://store.insidetracker.com/products/insidetracker-membership
- https://apps.apple.com/us/app/insidetracker/id1501674631
- https://www.fiercehealthcare.com/health-tech/whoop-expands-advanced-labs-offering-non-members-adds-grails-multi-cancer-detection
- https://techcrunch.com/2025/09/30/whoop-opens-its-blood-testing-service-to-350000-on-wait-list/
- https://support.whoop.com/s/article/Advanced-Labs-Availability-Access-and-Pricing?language=en_US
- https://www.whoop.com/us/en/press-center/whoop-launches-advanced-labs-in-the-UAE/
- https://www.whoop.com/us/en/membership/
- https://www.whoop.com/us/en/thelocker/whoop-unveils-the-new-whoop-coach-powered-by-openai/
- https://ouraring.com/blog/health-panels/
- https://support.ouraring.com/hc/en-us/articles/43627485603987-Health-Panels
- https://femtechinsider.com/oura-launches-in-app-blood-testing-integration-with-health-panels-feature/
- https://www.wareable.com/health-and-wellbeing/ultrahuman-blood-vision-cloud-essentials-expansion
- https://hlth.com/insights/news/ultrahuman-launches-vision-cloud-and-99-blood-test-to-expand-preventive-health-access-2025-10-03
- https://www.businessworld.in/article/ultrahuman-blood-vision-vision-cloud-india-launch-preventive-health-578952
- https://glucoseforge.com/levels-health-review
- https://healthrx.com/brands-levels/pricing-analysis
- https://healthrx.com/brands-zoe/pricing-analysis
- https://www.thegrocer.co.uk/news/zoe-gut-health-app-losses-swell-as-it-slashes-membership-price/718306.article
- https://zoe.com/en-us/daily30

**Lab explainers / PHR**

- https://apps.apple.com/us/app/sano-ai-health-assistant/id6751110925
- https://www.kantesti.net/ , https://bloodgpt.com/solutions/report-reader-online , https://testresult.ai/
- https://www.prnewswire.com/news-releases/labcorp-launches-mylabcorp-a-new-ai-powered-mobile-app-designed-to-help-consumers-understand-lab-results-and-track-health-trends-over-time-302777006.html
- https://www.fiercebiotech.com/medtech/labcorp-joins-lab-results-personalisation-push-mylabcorp-ai-app
- https://www.apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/
- https://newsroom.questdiagnostics.com/2026-09-09-Apple-Health-app-Users-to-be-Able-to-Order-Labs-from-Quest-Diagnostics
- https://techcrunch.com/2026/09/09/apples-revamped-health-app-will-calculate-your-health-age-and-readiness-score/
- https://www.macrumors.com/2026/09/16/ios-27-2-health-app-beta/
- https://www.apple.com/newsroom/2020/10/health-records-on-iphone-available-today-in-the-uk-and-canada/
- https://www.business-standard.com/technology/tech-news/apple-ai-health-coach-shelved-project-mulberry-features-arrive-updates-126020601028_1.html
- https://github.com/fastenhealth/fasten-onprem
- https://apps.smarthealthit.org/app/fasten-health

**Platform coaches / assistants / symptom checkers**

- https://blog.google/products-and-platforms/products/google-health/google-health-coach/
- https://blog.google/products-and-platforms/devices/fitbit/fitbit-personal-health-coach-expansion/
- https://techcrunch.com/2026/05/07/googles-9-99-per-month-ai-health-coach-launches-may-19/
- https://community.fitbit.com/t5/Fitbit-Premium/Will-Google-Health-available-in-Thailand/td-p/5830908
- https://www.samsungmobilepress.com/articles/health-assistant-beta-ai-powered-wellness
- https://www.fiercehealthcare.com/ai-and-machine-learning/samsung-launches-beta-version-ai-powered-health-assistant-across-us
- https://www.engadget.com/2219698/samsung-aims-to-help-you-make-more-sense-of-health-data-with-a-new-ai-powered-assistant/
- https://www.withings.com/us/en/landing/withings-plus-2025
- https://www.withings.com/us/en/landing/cardio-check-up
- https://openai.com/index/introducing-chatgpt-health/
- https://help.openai.com/en/articles/20001036-health-in-chatgpt
- https://www.ghacks.net/2026/07/25/openai-launches-health-in-chatgpt-for-us-users-connecting-apple-health-and-medical-records/
- https://startupfortune.com/openai-launched-chatgpt-health-and-quietly-moved-your-medical-records-outside-hipaa/
- https://www.euronews.com/next/2026/01/08/open-ai-launches-dedicated-chatgpt-health-feature-with-medical-record-integrations
- https://cybernews.com/how-to-use-vpn/how-to-unblock-chatgpt-health-from-europe-and-the-uk/
- https://anthropic.com/news/healthcare-life-sciences (fetched directly)
- https://fortune.com/2026/01/11/anthropic-unveils-claude-for-healthcare-and-expands-life-science-features-partners-with-healthex-to-let-users-connect-medical-records/
- https://x.com/claudeai/status/2013754136265621952
- https://microsoft.ai/news/introducing-copilot-health/
- https://support.microsoft.com/en-us/microsoft-copilot/copilot-health
- https://www.fiercehealthcare.com/ai-and-machine-learning/microsoft-unveils-copilot-health-ai-health-companion-consumers
- https://www.techrepublic.com/article/news-microsoft-copilot-health-privacy/
- https://www.ebglaw.com/health-law-advisor/microsoft-copilot-health-another-player-in-ai-driven-healthcare
- https://windowsreport.com/microsoft-expands-copilot-health-preview-to-more-us-microsoft-365-users/
- https://apps.apple.com/us/app/ada-your-health-portal/id1099986434
- https://www.iatrox.com/blog/ada-symptom-checker-review-uk-gp-2026
- https://doi.org/10.1071/PY21032
- https://ada.com/editorial/the-ada-app-is-removed-in-some-countries/
- https://www.fiercehealthcare.com/digital-health/babylon-closes-us-business-lays-employees-after-mindmaze-take-private-deal-collapses
- https://www.medicaldevice-network.com/news/babylon-health-downfall-exception-burgeoning-telehealth-market/
- https://theweek.com/health/babylon-health-the-failed-ai-wonder-app-that-dazzled-politicians
- https://en.wikipedia.org/wiki/Babylon_Health

**Market / studies / regulation**

- https://www.kff.org/public-opinion/kff-tracking-poll-on-health-information-and-trust-use-of-social-media-and-ai-for-health-information-and-advice/
- https://www.forbes.com/sites/brucejapsen/2026/03/25/1-in-3-adults-turn-to-ai-chatbots-for-health-information-poll-says/
- https://www.fortunebusinessinsights.com/industry-reports/digital-health-market-100227
- https://www.thebusinessresearchcompany.com/report/digital-health-tracking-apps-global-market-report
- https://www.researchandmarkets.com/reports/6226734/digital-health-coaching-market-report
- https://www.openpr.com/news/4587298/ai-health-coaching-platforms-market-to-reach-usd-6-200-0-million
- https://www.healio.com/news/primary-care/20260804/ai-photobased-calorietracking-tools-underestimate-them-by-33
- https://medicalxpress.com/news/2026-07-photo-based-calorie-tracking-apps.html
- https://www.eurekalert.org/news-releases/1136415
- https://www.medicaldaily.com/ai-calorie-tracking-apps-underestimate-calories-fat-nih-study-2026-476487
- https://www.sciencedaily.com/releases/2026/07/260726015237.htm
- https://www.mdpi.com/2072-6643/16/15/2573
- https://www.cooley.com/news/insight/2026/2026-01-20-fda-opens-aperture-for-wearables-in-latest-general-wellness-guidance
- https://www.ropesgray.com/en/insights/alerts/2026/01/fda-adapts-with-the-times-on-digital-health-updated-guidances-on-general-wellness-products
- https://www.faegredrinker.com/en/insights/publications/2026/1/key-updates-in-fdas-2026-general-wellness-and-clinical-decision-support-software-guidance
- https://quickbirdmedical.com/en/ai-act-medical-devices-mdr/
- https://patientguard.com/the-ai-act-omnibus-explained-what-the-2026-eu-rules-mean-for-medical-device-and-ivd-manufacturers/
- https://cookieinformation.com/blog/what-is-the-thailand-pdpa/
- https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/thailand/trends-and-developments
- https://www.theleveragedyears.com/ai-regulation-news/thailand-pdpc-ai-personal-data-draft-guidelines-2026

---

## 7. Gaps and unverified items

- Vendor-primary verification was not possible (egress block); every price needs a re-check on the vendor page before being used in RooSuk's paywall or pitch.
- Thai language / Thailand availability: unverified for Cal AI, MFP, Lose It, Lifesum (iOS), SnapCalorie, Bevel, Function, InsideTracker, Whoop labs, Oura, Levels, ZOE, Sano, Withings, ChatGPT Health (Thai UI), Claude. Verified negative/absent: Google Health Coach (Thailand not in 37-country list); Copilot Health and Samsung Health Assistant (US only); Superpower, Function, MyLabcorp (US only); Yazio, Ada, Noom (Thai not in language lists seen).
- HIPAA / FDA / CE status unverified for Cal AI, MFP, Lose It, Noom, Yazio, Lifesum, SnapCalorie, Bevel, InsideTracker, Ultrahuman, Levels, ZOE, Sano, Withings. Ada CE Class IIa comes from a third-party summary.
- Not found / not covered: "MyHealth by AI" and DocDroid (no reliable results), Levels acquisition rumour (nothing found), Apple Health+ launch (none confirmed), Whoop Advanced Labs availability in Thailand.
- Accuracy numbers for Cal AI, SnapCalorie and generic meta-analyses come from third-party blogs; the NUTRITION 2026 study is reported by multiple outlets but its original abstract was not fetched.
- Market-size figures come from commercial report summaries with very different definitions; do not cite as a single market number.
