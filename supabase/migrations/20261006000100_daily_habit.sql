-- Phase 1 / daily habit loop: check-ins and action ticks.
--
-- The score, streak and the three suggested actions are derived from these rows
-- by code (src/lib/health) — nothing is stored that could drift from them.
-- Users write their own rows directly (RLS), but only for TODAY in Thai time:
-- a client cannot back-date a check-in to fake a streak. `bangkok_today()` is
-- the single definition of "today" (the app uses the same rule, UTC+7).

create or replace function public.bangkok_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;

grant execute on function public.bangkok_today() to authenticated, service_role;
revoke execute on function public.bangkok_today() from anon;

-- ── daily_checkins: five taps a day ────────────────────────────────────────
-- Bands, not free text: sleep <5 / 5–6 / 7–8 / 9+ h, activity none / <30 /
-- 30–60 / 60+ min, and 1–5 feeling scales. Nothing about weight or body shape.
create table public.daily_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null,
  sleep_band smallint not null check (sleep_band between 1 and 4),
  activity_band smallint not null check (activity_band between 1 and 4),
  energy smallint not null check (energy between 1 and 5),
  mood smallint not null check (mood between 1 and 5),
  nutrition smallint not null check (nutrition between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, checkin_date)
);

create trigger daily_checkins_set_updated_at
  before update on public.daily_checkins
  for each row execute function public.set_updated_at();

alter table public.daily_checkins enable row level security;
revoke all on public.daily_checkins from anon, authenticated;
grant select, delete on public.daily_checkins to authenticated;
grant insert (user_id, checkin_date, sleep_band, activity_band, energy, mood, nutrition)
  on public.daily_checkins to authenticated;
grant update (sleep_band, activity_band, energy, mood, nutrition)
  on public.daily_checkins to authenticated;

create policy daily_checkins_select_own on public.daily_checkins
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy daily_checkins_insert_today on public.daily_checkins
  for insert to authenticated
  with check (user_id = (select auth.uid()) and checkin_date = public.bangkok_today());

-- Today's answers can be corrected; earlier days are history.
create policy daily_checkins_update_today on public.daily_checkins
  for update to authenticated
  using (user_id = (select auth.uid()) and checkin_date = public.bangkok_today())
  with check (user_id = (select auth.uid()) and checkin_date = public.bangkok_today());

-- Erasure: a user may delete any of their own days.
create policy daily_checkins_delete_own on public.daily_checkins
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── action_completions: ticks on Today's 3 Actions ─────────────────────────
-- Which suggestions exist is decided in code and rotates; this table stores
-- only what the user ticked. `action_key` is free text (a CHECK over a list
-- that keeps growing is a trap — docs/07), valid keys live in src/lib/health.
create table public.action_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  action_date date not null,
  action_key text not null check (length(btrim(action_key)) between 1 and 64),
  done_at timestamptz not null default now(),
  primary key (user_id, action_date, action_key)
);

alter table public.action_completions enable row level security;
revoke all on public.action_completions from anon, authenticated;
grant select, delete on public.action_completions to authenticated;
grant insert (user_id, action_date, action_key) on public.action_completions to authenticated;

create policy action_completions_select_own on public.action_completions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy action_completions_insert_today on public.action_completions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and action_date = public.bangkok_today());

-- Un-ticking works for today only, so past days cannot be rewritten.
create policy action_completions_delete_today on public.action_completions
  for delete to authenticated
  using (user_id = (select auth.uid()) and action_date = public.bangkok_today());
