-- Goals: the person chooses what they want (a few taps), the app writes a short daily
-- program, and the person ticks the day's small tasks. Also the pieces a goal needs:
-- the meal slot of a logged meal (the diary), weigh-ins, and a height.
--
-- Weight and height are sensitive health data: they are asked ONLY inside the weight goal,
-- optional, and covered by the existing sensitive-health-data consent. They never feed a
-- reward, badge, streak or score (those still reward showing up, never body shape — CLAUDE.md).
-- Goals, programs and the safety decisions behind them are written by the SERVER; a person
-- reads them, ticks their own tasks for today, and logs their own weight.

-- ── the meal diary needs a slot; the scan sets it, the person can change it ──
alter table public.meal_logs
  add column meal_type text check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));

-- ── height (cm), kept with the profile so it is asked once ──────────────────
alter table public.health_profiles
  add column height_cm smallint check (height_cm between 100 and 230);
grant insert (height_cm), update (height_cm) on public.health_profiles to authenticated;

-- ── weight_logs: one weigh-in a day, written by the person ──────────────────
create table public.weight_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_on date not null,
  weight_kg numeric(4, 1) not null check (weight_kg between 25 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, logged_on)
);

create trigger weight_logs_set_updated_at
  before update on public.weight_logs
  for each row execute function public.set_updated_at();

alter table public.weight_logs enable row level security;
revoke all on public.weight_logs from anon, authenticated;
grant select, delete on public.weight_logs to authenticated;
grant insert (user_id, logged_on, weight_kg) on public.weight_logs to authenticated;
grant update (weight_kg) on public.weight_logs to authenticated;

create policy weight_logs_select_own on public.weight_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- no future dates, and not further back than two months (a typo, not a history import)
create policy weight_logs_insert_own on public.weight_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and logged_on <= public.bangkok_today()
    and logged_on >= public.bangkok_today() - 60
  );

create policy weight_logs_update_own on public.weight_logs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy weight_logs_delete_own on public.weight_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── user_goals: what the person is working on ───────────────────────────────
-- `kind` and the keys of `params` are checked in code (src/lib/goals), not here.
create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (length(kind) between 1 and 30),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  started_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint user_goals_dates check (ends_on >= started_on)
);

-- one live goal per kind (and per condition, for "manage a condition")
create unique index user_goals_one_active
  on public.user_goals (user_id, kind, coalesce(params ->> 'condition', ''))
  where status = 'active';
create index user_goals_user_idx on public.user_goals (user_id, status, created_at desc);

create trigger user_goals_set_updated_at
  before update on public.user_goals
  for each row execute function public.set_updated_at();

alter table public.user_goals enable row level security;
revoke all on public.user_goals from anon, authenticated;
grant select, delete on public.user_goals to authenticated;

create policy user_goals_select_own on public.user_goals
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_goals_delete_own on public.user_goals
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── goal_programs: the daily program (and the numbers it was built from) ────
-- Several versions per goal: a new one replaces the old when the person asks for a fresh plan.
create table public.goal_programs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.user_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  -- 'ai' = written by the model and passed the guardrails; 'template' = the standard program
  source text not null check (source in ('ai', 'template')),
  model text check (model is null or length(model) <= 100),
  valid_from date not null,
  valid_to date not null,
  -- numbers decided by code (calories, macros, water, sleep times …)
  targets jsonb not null check (jsonb_typeof(targets) = 'object'),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  created_at timestamptz not null default now(),
  unique (goal_id, version),
  constraint goal_programs_dates check (valid_to >= valid_from)
);

create index goal_programs_user_idx on public.goal_programs (user_id, created_at desc);

alter table public.goal_programs enable row level security;
revoke all on public.goal_programs from anon, authenticated;
grant select on public.goal_programs to authenticated;

create policy goal_programs_select_own on public.goal_programs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── goal_task_checks: the day's small tasks the person has done ─────────────
-- Today only (Thai time): a client cannot back-fill days to look more consistent.
create table public.goal_task_checks (
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.user_goals (id) on delete cascade,
  task_date date not null,
  task_key text not null check (length(task_key) between 1 and 20),
  done_at timestamptz not null default now(),
  primary key (user_id, goal_id, task_date, task_key)
);

alter table public.goal_task_checks enable row level security;
revoke all on public.goal_task_checks from anon, authenticated;
grant select, insert, delete on public.goal_task_checks to authenticated;

create policy goal_task_checks_select_own on public.goal_task_checks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy goal_task_checks_insert_own on public.goal_task_checks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and task_date = public.bangkok_today()
    and exists (
      select 1 from public.user_goals g
       where g.id = goal_id and g.user_id = (select auth.uid()) and g.status = 'active'
    )
  );

create policy goal_task_checks_delete_own on public.goal_task_checks
  for delete to authenticated
  using (user_id = (select auth.uid()) and task_date = public.bangkok_today());
