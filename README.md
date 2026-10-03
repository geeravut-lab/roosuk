# roosuk

**AI ที่รู้จักสุขภาพของคุณ** — AI Personal Health OS ที่เปลี่ยนข้อมูลสุขภาพ (อาหาร, การนอน, กิจกรรม, ผลแล็บ) ให้เป็นสิ่งที่ใช้ได้ทุกวัน

- Requirements summary: [`docs/requirements.md`](docs/requirements.md)
- Source documents: [`docs/`](docs/)

## Getting started

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local   # fill in Supabase / Anthropic keys
npm run dev                  # http://localhost:3000
```

## Scripts

| Command                            | Purpose                                               |
| ---------------------------------- | ----------------------------------------------------- |
| `npm run dev`                      | Development server                                    |
| `npm run build` / `npm start`      | Production build / serve                              |
| `npm run check`                    | Lint + typecheck + tests + format check               |
| `npm test`                         | Unit tests (Vitest)                                   |
| `npm run format`                   | Format with Prettier                                  |
| `npm run e2e`                      | Playwright layout/a11y tests (after `npm run build`)  |
| `npm run db:status` / `db:migrate` | Show / apply SQL migrations (Supabase Management API) |

## Structure

```text
src/
  app/                  Next.js App Router
    (app)/              signed-in area (shell, today/timeline/scan/ask/settings, admin)
    auth/ consent/ privacy/ terms/ api/   public + auth routes
    actions/            server actions (auth, consent, language, admin)
  proxy.ts              session refresh + redirect for protected paths (Next 16 "proxy")
  components/           AppShell (sidebar / bottom bar), Logo, LangSwitch, …
  config/               plans, nav, routes, legal (policy version, consent items), data region
  lib/
    i18n/               Thai/English dictionary (th is the source of truth)
    auth/ consent/ flags/ settings/ line/   server helpers + pure logic with tests
    supabase/           browser / server / admin / proxy clients
    ai/                 Claude API client (server-only)
supabase/
  migrations/           SQL migrations (applied with npm run db:migrate)
  tests/                RLS tests on in-memory Postgres (run by npm test)
  scripts/              one-off SQL (pre-launch reset)
scripts/                db-migrate, grant-admin, brand asset generator
e2e/                    Playwright specs (mobile 390×844 + desktop)
docs/                   Master plan, setup guide, requirements, knowledge files
```
