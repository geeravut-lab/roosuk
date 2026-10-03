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

| Command                       | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `npm run dev`                 | Development server                      |
| `npm run build` / `npm start` | Production build / serve                |
| `npm run check`               | Lint + typecheck + tests + format check |
| `npm test`                    | Unit tests (Vitest)                     |
| `npm run format`              | Format with Prettier                    |

## Structure

```text
src/
  app/              Next.js App Router (pages, API routes)
  config/plans.ts   Subscription tiers & AI usage quotas
  lib/env.ts        Validated environment variables
  lib/supabase/     Supabase browser/server clients
  lib/ai/           Claude API client (server-only)
supabase/migrations SQL migrations
docs/               Requirements & business documents
```
