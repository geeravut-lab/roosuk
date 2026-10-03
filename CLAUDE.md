@AGENTS.md

# Roosuk

AI Personal Health OS ("AI ที่รู้จักสุขภาพของคุณ") — consumer health app with a Cal AI–style daily habit loop on top of a precision health check business. Read `docs/requirements.md` first; the original source docs are in `docs/`.

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
