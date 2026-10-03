-- Phase 0 foundation: profiles, admins, consent records, platform settings,
-- LINE links and the privacy audit log.
--
-- Security model: every table has RLS enabled and ALL default grants revoked
-- from anon/authenticated, then only what is needed is granted back. Rows a
-- user must not write themselves (admins, platform_settings, line_links,
-- privacy_audit_log) are written only by trusted server code with the service
-- role, which bypasses RLS.

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  language text not null default 'th' check (language in ('th', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level grant: a user can edit these three columns and nothing else
-- (later migrations add plan/billing columns that stay server-written).
grant update (display_name, avatar_url, language) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user gets a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── admins ─────────────────────────────────────────────────────────────────
-- Membership is managed only with the service role (scripts/grant-admin.mjs).
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create policy admins_select_own on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ── consent_records ────────────────────────────────────────────────────────
-- Append-only history: one row per time the user accepted a policy version.
-- `items` holds one boolean per consent item, so "what did I agree to?" can be
-- answered item by item. accepted_at is the server's clock, never the client's.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  items jsonb not null check (jsonb_typeof(items) = 'object'),
  accepted_at timestamptz not null default now()
);

create index consent_records_user_idx on public.consent_records (user_id, accepted_at desc);

alter table public.consent_records enable row level security;
revoke all on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;
grant insert (user_id, policy_version, items) on public.consent_records to authenticated;

create policy consent_records_select_own on public.consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy consent_records_insert_own on public.consent_records
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ── platform_settings (single row) ─────────────────────────────────────────
-- Only DISABLED feature flags are stored; a missing key means "on".
create table public.platform_settings (
  id boolean primary key default true check (id),
  feature_flags jsonb not null default '{}'::jsonb check (jsonb_typeof(feature_flags) = 'object'),
  manual_url text not null default '' check (manual_url = '' or manual_url ~* '^https://'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;

create policy platform_settings_select on public.platform_settings
  for select to authenticated
  using (true);

-- ── line_links ─────────────────────────────────────────────────────────────
create table public.line_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  line_sub text not null unique,
  display_name text,
  picture_url text,
  created_at timestamptz not null default now()
);

alter table public.line_links enable row level security;
revoke all on public.line_links from anon, authenticated;
grant select on public.line_links to authenticated;

create policy line_links_select_own on public.line_links
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── privacy_audit_log ──────────────────────────────────────────────────────
-- Data export / deletion / consent changes. Service-role only (no policies).
-- user_id is SET NULL on deletion so the audit trail outlives the account.
create table public.privacy_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.privacy_audit_log enable row level security;
revoke all on public.privacy_audit_log from anon, authenticated;
