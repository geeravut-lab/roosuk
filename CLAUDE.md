@AGENTS.md

# Roosuk

RooSuk (รู้สุข) — AI Personal Health OS ("AI ที่รู้จักสุขภาพของคุณ"): consumer health app with a Cal AI–style daily habit loop on top of a precision health check business.

**`docs/ROOSUK-MASTER-PLAN.md` is the source of truth** for the owner's requirements, the build plan and open decisions — read it before starting any work and keep its change log updated. Implementation patterns come from the knowledge files `docs/01–13-*.md` (index: `docs/README.md`) and `docs/PDPA-RIGHTS-SECTION-KNOWLEDGE.md`; their cross-cutting rules in `docs/README.md` apply here.

## Working rules (owner's instructions)

- Test in Claude's own environment first (`npm run check`, `npm run build`, local `next start`, Playwright at 390×844, and the live suite `E2E_LIVE=1 npx playwright test e2e/live --project=mobile` against the shared Supabase project — it creates and deletes its own users). Do not hit Netlify production for testing; when production must be checked, tell the owner what to test.
- **Deploy rule (owner, 2026-10-18, replaces the 2026-10-03 sync-after-every-update rule):** in EVERY prompt — however many items it holds — test only in Claude's own environment (`npm run check`, `npm run build`, local `next start`, Playwright, the live suite). Commit and push the working branch as you go, but do NOT touch `main` until everything the prompt asked for is finished and has passed `npm run check`; then fast-forward `main` ONCE (`git checkout main && git merge --ff-only <branch> && git push origin main && git checkout <branch>`) so Netlify deploys production once (it costs credits; `netlify.toml` already skips docs/test-only changes). After that single deploy, smoke-test production, and tell the owner what is left for them to test. Never force-push `main`; gate pushes on `npm run check` with `&&`, never `;`.
- Sandbox: Node's `fetch` ignores the proxy unless `NODE_USE_ENV_PROXY=1` (set in `.claude/settings.json`; export it by hand if a session started before that). Never print key values or prefixes — names and set/missing only.
- Supabase is ONE project shared by dev/test/prod until launch (D11): treat all data as test data and follow the pre-launch checklist in `docs/SETUP-GUIDE.md` §C (wipe data, rotate/revoke keys, upgrade to Pro) before real users sign up. Without the `*.supabase.co` / `api.supabase.com` network allowlist the sandbox cannot reach Supabase; Postgres port 5432 is unreachable, so apply migrations through the Management API.
- Unit tests mock AI providers; real AI calls cost money and never run in CI.
- Deploy: Netlify · Auth/DB/Storage: Supabase · Repo: github.com/geeravut-lab/roosuk.

## Brand

Teal `#0A8FA3` (primary) · Mint `#2DD4A7` (secondary) · Sky Blue `#1E90FF` (charts/numbers) · Coral `#FF7A6B` (CTAs, encouragement) · background `#F7FBFA` · text `#1F2A30` (never pure black). Bright red is reserved for genuinely abnormal values only. Accessible-usage rules (dark text on coral/mint buttons, `#07707F` for small teal text) are in the master plan §3. Logo: `docs/RooSuk Logo.jpg`.

## Stack

- Next.js 16 (App Router, `src/`), React 19, TypeScript strict, Tailwind CSS 4
- Supabase (Auth, Postgres, Storage) via `@supabase/ssr` — `src/lib/supabase/{client,server}.ts`
- Claude API via `@anthropic-ai/sdk` — `src/lib/ai/client.ts` (server-only)
- Zod for validation; env access goes through `src/lib/env.ts`
- Vitest for unit tests (`*.test.ts` next to the code)

## Commands

- `npm run dev` — dev server
- `npm run check` — lint + typecheck + test + format check (run before committing)
- `npm run build` — production build
- `npm run format` — apply Prettier
- `npm run build && npm run e2e` — Playwright layout + accessibility tests at 390×844 and 1280×800 (uses `/preview/*`, a backend-free fixture enabled only by `ENABLE_UI_PREVIEW=1`)
- `npm run db:status` / `npm run db:migrate` — apply `supabase/migrations/*.sql` via the Management API (needs `SUPABASE_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN`)

## Conventions

- UI copy is Thai-first; keep code, identifiers and comments in English. Every UI string lives in `src/lib/i18n/dict.ts` (`th` is the source, `en satisfies Dict`); write `t.key`, never inline text. Server actions/routes return `err_*` error CODES, never sentences.
- Auth/consent: `(app)/layout.tsx` enforces sign-in + current consent; `requireUser()` / `requireAdmin()` in `src/lib/auth/server.ts`; feature switches via `assertFeature()` on the first line of every feature's server action. Always check how many rows a write touched (`.select("id")`) — an UPDATE matching nothing is "success" to PostgREST.
- Next 16: the old `middleware` is `src/proxy.ts`. Read `node_modules/next/dist/docs/` before using a Next API.
- Mobile-first layouts (PWA target).
- **Slow actions show a spinner (owner, 2026-10-18):** page changes get the global indicator automatically (`NavigationFeedback` in the root layout). A server-action form uses `SubmitButton` / `PendingButton` (spinner + disabled while it runs, so it cannot be fired twice); a client form shows `<Spinner />` in its `pending` state. Never add a submit button that can be pressed again while its action runs.
- Secrets and AI calls stay server-side (`import "server-only"`). Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` to the client.
- Plans and AI quotas: defaults in `src/config/plans.ts`, real values (prices, trial days, fair-use caps, quota overrides) in `platform_settings`, parsed by `src/lib/billing/settings.ts`. **Every AI call must first pass `checkAndConsume(userId, feature)`** (`src/lib/billing/quota.server.ts`) — it resolves the current plan (live paid plan → trial = Premium → Free-lite), applies the quota and fair-use cap and counts the use atomically in SQL (`consume_usage`); it fails closed and counts "unlimited" plans too. Plan/trial columns on `profiles` are written only with the service role.
- Database changes go in `supabase/migrations/` as SQL (`YYYYMMDDHHMMSS_name.sql`); every user-data table needs RLS plus tests in `supabase/tests/` (they run in `npm test` against in-memory Postgres — extend them with each migration). Revoke default grants and grant back only what is needed; give users column-level `update` grants only.

## Rewards, challenges and experiments

- Credit is a baht **ledger** (`reward_ledger`, insert-only; balance = sum), written only by SECURITY DEFINER functions / the service role. Amounts and per-use limits are the admin's (`/admin/rewards`, `platform_settings`); never hard-code a reward number. Credit is spent when a transfer is _reported_ and refunded when rejected (`consume_payment_credit` / `refund_payment_credit`).
- Challenges and badges reward **showing up** (check-in days, logging), never weight, body shape or calories; copy is tested for that.
- The paywall A/B shows the same plans and prices in both versions (order and wording only); every funnel event carries `pw_a`/`pw_b`.
- Open Food Facts (barcode) and Gemini audio are not reachable/free in every environment: the barcode path is tested against a local stub (`OPEN_FOOD_FACTS_URL`), voice against a synthesised Thai sentence (`e2e/fixtures/voice-th.wav`).

## Phase 3 features (sharing, devices, money)

- **Plan grants:** a family seat or a company seat lifts a person's plan through `withGrant()` (`src/lib/billing/plan.ts`) inside BOTH billing loaders (`profile.server.ts`, `profile-admin.server.ts`) via `grants.server.ts`; the stored `profiles` row is never changed. A family member has Premium only while the owner's **paid** Premium is live (a trial does not extend). Always ask the plan through `tierFor()` / `getBillingProfile()`, never read `plan_tier` raw.
- **Sharing links and tokens** (Health Passport, wearable ingest tokens): the secret is shown once and only its SHA-256 is stored. A passport is a snapshot of exactly the sections the person ticked; nothing else is read.
- **Wearables:** each source needs its own consent row (`wearable_sources`); `health_observations` is idempotent by (user, source, external_id); plan decides which types are stored (`PLANS[tier].wearables`). Weight is stored for the person's own record and is never a goal, score or badge.
- **AI Health Agent:** the model answers in JSON steps (`src/lib/agent/agent.ts`) — one of five fixed tools or a final answer; the final answer goes through `finalizeAnswer` like Ask AI; emergency words never reach a model; log every message and tool use. Add a tool = add it to `TOOLS`, `runTool`, the system prompt, and tests.
- **Marketplace:** orders are made ONLY by the SQL function `create_shop_order` (prices from the database, stock, credit cap, one transaction). Supplement texts pass `violatesProductClaims` (no disease or weight-loss claims). Product photos live in the private `shop-images` bucket and are served through `/api/shop/img`. Orders are money records: they outlive the account, scrubbed of address and phone.
- **Admins:** granting/revoking goes through `grant_admin` / `revoke_admin` (only an admin; never yourself; `geeravut@gmail.com` can never be revoked — `src/config/admin.ts` and the SQL hold the same address).
- **Install as app (PWA):** `public/sw.js` caches only `/offline.html` and one icon — never anything a signed-in person sees. Keep it that way.
- **Live suite and AI quota:** the sandbox's Gemini key is free-tier (a handful of requests a day). Specs that need a real model skip with a stated reason when the quota is spent; the agent loop itself is unit-tested with a scripted model.

## Goals, liver, telepharmacy (2026-10 additions)

- **Goals** (`src/lib/goals/`, `/goals`): kinds weight | sleep | brain | condition, ≤3 active, fixed program length per kind. Numbers (BMI, TDEE, kcal, macros, water, minutes) are computed by CODE; the model only words the daily tasks, meal ideas and tips, and its JSON goes through `violatesProgramGuardrails` / `normalizeProgram` — failure falls back to `templates.ts` (always safe) and refunds the `goalPlan` quota unit. Weight-goal safety rails live in `assessWeightGoal` / `weightTargets`: blocked under 18, pregnancy, eating-disorder history, underweight; deficit ≤25% of TDEE with kcal floors; gain ≤500/day. No fasting/detox/supplement/promised-kg wording. Weight lives in `weight_logs` for the person's own record. `goal_plan` is deliberately NOT in `EDITABLE_TASKS`.
- **Food watch** (`watch.ts`, `food-tags.ts`, flag `diet_watch`, rule `diet_watch`): counts tagged dishes in the person's own logged meals against per-condition thresholds (DRAFT, dietitian/doctor review pending). Wording is "worth a look", never a diagnosis or a ban.
- **Meal diary** : `meal_logs.meal_type` (breakfast/lunch/dinner/snack); logging food is always optional.
- **Liver module** (`/liver`, flag `liver_check`, `docs/LIVER-MODULE.md`): rule-based screening, no AI; rows via `record_liver_assessment()`; the 🔒 items need hepatologist review before launch.
- **Plans are editable** at `/admin/plans`: only differences from `src/config/plans.ts` are stored (`platform_settings.plan_specs`); read plan specs through `planSpec()` / `resolvePlanSpec()`, never `PLANS[...]` directly.
- **Menu**: `src/config/nav.ts` is the one list; groups daily | data | care | rewards | shop | account; bottom bar = Today, Goals, Scan, Ask, More.

## Health guardrails (non-negotiable)

- AI never diagnoses. It summarizes, explains trends and helps users prepare for a doctor; doctors decide.
- Every AI health answer carries a disclaimer; low-confidence or risky cases hand off to a human.
- PDPA: explicit, separate consent for daily logs, photos, wearables and family sharing; support data export/deletion.
- Log AI conversations for audit.
- Gamification rewards consistency only: scores, streaks, badges, challenges and credit never reward weight, body shape or calories. A weight/diet goal exists ONLY as an opt-in the user chose (`/goals`) and is bounded by code-enforced safety rails (`src/lib/goals/weight.ts`) — see "Goals, liver, telepharmacy".
