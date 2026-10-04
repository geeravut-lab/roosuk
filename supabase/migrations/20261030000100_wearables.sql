-- Phase 3B / Wearables: one table for everything a watch, phone, scale or the
-- person's own hand records (docs/ROOSUK-MASTER-PLAN.md §9). Steps, heart rate,
-- sleep… arrive from a file import in the browser, from the ingestion API (a
-- per-person token, for the companion app and other senders) or typed in. A source
-- may only send once the person has ticked its own, separate consent; withdrawing
-- stops it and the person can also erase what that source sent. Writes come from
-- the server only; a person reads and erases their own rows.

create table public.wearable_sources (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('apple_health', 'health_connect', 'csv', 'api')),
  consented_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, source)
);
alter table public.wearable_sources enable row level security;
revoke all on public.wearable_sources from anon, authenticated;
grant select on public.wearable_sources to authenticated;
create policy wearable_sources_select_own on public.wearable_sources
  for select to authenticated using (user_id = (select auth.uid()));

create table public.health_observations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'steps', 'heart_rate', 'resting_heart_rate', 'sleep_minutes', 'weight_kg',
    'bp_systolic', 'bp_diastolic', 'blood_glucose', 'spo2'
  )),
  value numeric not null,
  unit text not null check (length(unit) between 1 and 12),
  start_at timestamptz not null,
  end_at timestamptz,
  source text not null check (source in ('apple_health', 'health_connect', 'csv', 'manual', 'api')),
  device text check (device is null or length(device) <= 60),
  -- what makes a re-send harmless: the same thing from the same source is one row
  external_id text not null check (length(external_id) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint health_observations_span check (end_at is null or end_at >= start_at),
  constraint health_observations_once unique (user_id, source, external_id)
);
create index health_observations_user_idx on public.health_observations (user_id, type, start_at desc);

alter table public.health_observations enable row level security;
revoke all on public.health_observations from anon, authenticated;
grant select, delete on public.health_observations to authenticated;
create policy health_observations_select_own on public.health_observations
  for select to authenticated using (user_id = (select auth.uid()));
create policy health_observations_delete_own on public.health_observations
  for delete to authenticated using (user_id = (select auth.uid()));

-- Tokens for senders that cannot use the browser session. Only the hash is kept.
create table public.ingest_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index ingest_tokens_user_idx on public.ingest_tokens (user_id, created_at desc);
alter table public.ingest_tokens enable row level security;
revoke all on public.ingest_tokens from anon, authenticated;
-- the list shows everything but the hash
grant select (id, user_id, label, last_used_at, revoked_at, created_at) on public.ingest_tokens to authenticated;
create policy ingest_tokens_select_own on public.ingest_tokens
  for select to authenticated using (user_id = (select auth.uid()));
