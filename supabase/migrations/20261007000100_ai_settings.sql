-- Phase 1 / AI provider router (docs/11-ai-provider-settings.md).
-- ai_settings: ONE row of admin-editable routing. ai_events: only fallbacks and
-- errors (never successful calls, never prompt/answer text — it is health data).
-- Both are service-role only: users never read or write them, and the admin page
-- reads them on the server after requireAdmin().

create table public.ai_settings (
  id boolean primary key default true check (id),
  -- { "<task>": { "primary": "<provider>", "fallback": "<provider>|none" } }
  route_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(route_overrides) = 'object'),
  -- { "<provider>": { "<task>": "<model id>" } }
  model_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(model_overrides) = 'object'),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.ai_settings (id) values (true) on conflict do nothing;

alter table public.ai_settings enable row level security;
revoke all on public.ai_settings from anon, authenticated;

create table public.ai_events (
  id bigint generated always as identity primary key,
  provider text not null check (length(btrim(provider)) > 0),
  task text not null check (length(btrim(task)) > 0),
  status text not null check (status in ('fallback', 'error')),
  error_code text check (error_code is null or length(error_code) <= 64),
  message text check (message is null or length(message) <= 300),
  created_at timestamptz not null default now()
);

create index ai_events_created_idx on public.ai_events (created_at desc);

alter table public.ai_events enable row level security;
revoke all on public.ai_events from anon, authenticated;
