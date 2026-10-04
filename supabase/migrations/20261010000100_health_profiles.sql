-- Phase 1 / Health Profile: the few facts a user tells us once so that scores,
-- the quiz and the AI can speak to them. One row per user, written by the user
-- (RLS: own row only) — there is nothing to compute or protect from them.
--
-- Deliberately NOT collected: weight, height, BMI or any body-shape measure
-- (gamification rewards consistency, never body shape — CLAUDE.md), medications.
-- `conditions` is sensitive health data: covered by the required
-- `sensitive_health_data` consent, optional here, and exported/erased with the rest.

create table public.health_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_year smallint check (birth_year between 1900 and 2100),
  sex text check (sex in ('female', 'male', 'other', 'unspecified')),
  smoking text check (smoking in ('never', 'former', 'current')),
  alcohol text check (alcohol in ('none', 'occasional', 'weekly', 'daily')),
  -- days per week with at least ~30 minutes of movement
  exercise_days smallint check (exercise_days between 0 and 7),
  -- Free-text lists whose valid values live in code (a CHECK over a list that keeps growing is a trap)
  conditions text[] not null default '{}' check (cardinality(conditions) <= 12),
  goals text[] not null default '{}' check (cardinality(goals) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger health_profiles_set_updated_at
  before update on public.health_profiles
  for each row execute function public.set_updated_at();

alter table public.health_profiles enable row level security;
revoke all on public.health_profiles from anon, authenticated;
grant select, delete on public.health_profiles to authenticated;
grant insert (user_id, birth_year, sex, smoking, alcohol, exercise_days, conditions, goals)
  on public.health_profiles to authenticated;
grant update (birth_year, sex, smoking, alcohol, exercise_days, conditions, goals)
  on public.health_profiles to authenticated;

create policy health_profiles_select_own on public.health_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy health_profiles_insert_own on public.health_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy health_profiles_update_own on public.health_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy health_profiles_delete_own on public.health_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));
