# Liver Health module (Phase L1) — knowledge

Source: `docs/RooSuk Liver Health Module Design.pdf` (merged Grok + Gemini + ChatGPT) and `docs/Liver Check - ChatGPT.txt`.
It is **screening and care navigation, never diagnosis**. A rule engine in code decides; no LLM reads a number or picks a level, and Phase L1 makes no AI call at all.

## Everything marked 🔒 needs a hepatologist / internist before launch

Cut-offs, reference ranges, severe-value limits and the level rules are drafts compiled from commonly published AASLD / EASL / THASL material. They live in `src/lib/liver/scores.ts` (`CUTOFFS`, `PLAUSIBLE`), `src/lib/liver/engine.ts` (`SEVERE`, `BODY`, the level rules) and `src/config/biomarkers.ts` (liver tests). The UI says so in a small note (`liverDraftNote`).

| Item                        | Draft value                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| 🔒 FIB-4                    | < 1.3 low · 1.3–2.67 intermediate · > 2.67 high · age ≥ 65 low cut-off 2.0 · note under 35         |
| 🔒 APRI (AST ULN 40)        | < 0.5 low · 0.5–1.5 intermediate · > 1.5 high                                                      |
| 🔒 NFS                      | < −1.455 low · −1.455–0.676 intermediate · > 0.676 high · age ≥ 65 low cut-off 0.12                |
| 🔒 FLI                      | < 30 low · 30–59 intermediate · ≥ 60 high (information + level 1 floor only)                       |
| 🔒 Severe → level 3 "soon"  | ALT/AST ≥ 10× ULN (400) · total bilirubin ≥ 3.0 mg/dL · INR ≥ 1.5 · albumin < 2.5 · platelets < 50 |
| 🔒 Body size                | BMI ≥ 23; waist ≥ 90 cm (men) / ≥ 80 cm (women)                                                    |
| 🔒 Reference ranges         | unisex ALT/AST 40 U/L (AASLD sex-specific limits are tighter); INR range assumes no warfarin       |
| 🔒 Labs older than 365 days | ignored for the level; older than 180 days → "consider repeating"                                  |

## Levels (design §5.2)

0 No current concern (never "liver is normal") · 1 Risk factors present · 2 Needs follow-up · 3 Urgent.

- **Level 3** — any red flag (jaundice, severe right-upper pain, vomiting blood / black stools, fast-swelling abdomen + breathlessness, confusion/drowsiness) → `urgency: emergency`, 1669 button, remaining questions skipped. Severe lab values → `urgency: soon` (no emergency script, but 1669 reminder for symptoms).
- **Level 2** — a core liver test outside its range; FIB-4 intermediate/high; APRI > 1.5; NFS high; hepatitis B/C "positive"; told of abnormal liver tests / liver disease; dark urine-pale stool, itching or unintended weight loss; three or more risk factors.
- **Level 1** — any risk factor (body size, diabetes, hypertension, dyslipidemia, metabolic labs, told of fatty liver, daily alcohol, family history, regular medicines/herbs flag, born ≤ 1991 and hepatitis B untested, any chronic symptom, FLI high).
- **Level 0** — otherwise. Missing data never becomes a number: a score is `insufficient` (names what is missing) or `invalid` (implausible input, e.g. a platelet count in the wrong unit).

## Where things are

| What                                  | Where                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Scores, engine, wording, brief, trend | `src/lib/liver/*` (pure, tested); loaders in `server.ts`                                                                 |
| Pages                                 | `/liver`, `/liver/check`, `/liver/result/[id]`, `/liver/brief`, `/liver/hepatitis`                                       |
| Actions                               | `src/app/actions/liver.ts` (`assertFeature("liver_check")` first; error CODES only)                                      |
| Migration                             | `supabase/migrations/20261110000100_liver_check.sql` (+ `supabase/tests/liver.test.ts`)                                  |
| Passport                              | `liver` section: `src/lib/passport/*`, `src/components/liver/BriefView.tsx`                                              |
| Flag                                  | `liver_check` (src/lib/flags/flags.ts)                                                                                   |
| Lab Scan                              | INR added; ALT/AST/ALP/GGT/bilirubin/platelet aliases and Thai units in `src/config/biomarkers.ts`, `src/lib/lab/lab.ts` |

## Data rules

- `liver_assessments` / `liver_audit_log` are written only by `record_liver_assessment()` (service role, one transaction, max 20 per 24 h); users have SELECT only; both are append-only (update trigger + revoked update/delete). They are removed with the account.
- `liver_hepatitis_status` is the person's own note ("never tested / negative / positive / vaccinated"), server-written, never a diagnosis.
- Medicines/herbs are a yes/no/unsure flag. No names are stored and no advice is given.
- Weight/BMI are used only to find a risk factor, never as a goal, score or badge.

## Not in L1 (design §9)

MASLD / hepatitis pathways, ultrasound / FibroScan records, reminders (L2) · partner booking, telemedicine (L3) · liver-specific health age, predictive models (L4) · AI explanation of the result (would go through `checkAndConsume` and the Ask-AI guardrails) · eye / palm Vision AI (design §7: not in MVP).
