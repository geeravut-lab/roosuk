@AGENTS.md

# Roosuk

RooSuk (รู้สุข) — AI Personal Health OS ("AI ที่รู้จักสุขภาพของคุณ"): consumer health app with a Cal AI–style daily habit loop on top of a precision health check business.

**`docs/ROOSUK-MASTER-PLAN.md` is the source of truth** for the owner's requirements, the build plan and open decisions — read it before starting any work and keep its change log updated. Implementation patterns come from the knowledge files `docs/01–13-*.md` (index: `docs/README.md`) and `docs/PDPA-RIGHTS-SECTION-KNOWLEDGE.md`; their cross-cutting rules in `docs/README.md` apply here.

## Working rules (owner's instructions)

- Test only in Claude's own environment (`npm run check`, `npm run build`, local `next start`, Playwright at 390×844, the Supabase dev project). **Never deploy to or test on Netlify production** without asking the owner first — Netlify credits are limited. Merging to `main` only when the owner says so.
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

## Conventions

- UI copy is Thai-first; keep code, identifiers and comments in English.
- Mobile-first layouts (PWA target).
- Secrets and AI calls stay server-side (`import "server-only"`). Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` to the client.
- Subscription limits live in `src/config/plans.ts`; check quotas there instead of hard-coding numbers.
- Database changes go in `supabase/migrations/` as SQL; every user-data table needs RLS.

## Health guardrails (non-negotiable)

- AI never diagnoses. It summarizes, explains trends and helps users prepare for a doctor; doctors decide.
- Every AI health answer carries a disclaimer; low-confidence or risky cases hand off to a human.
- PDPA: explicit, separate consent for daily logs, photos, wearables and family sharing; support data export/deletion.
- Log AI conversations for audit.
- Gamification rewards consistency, never body shape or weight targets.
