-- Phase 2 / achievements.
--
-- Badges reward SHOWING UP (check-in streaks, logging, scanning, finishing the
-- profile) and nothing about the body: no weight, BMI, calories or score targets.
-- A row is written only by award_achievements(), which counts the person's own
-- history, so a badge cannot be claimed without having earned it, and a person
-- cannot write the table at all. Rows are never removed except with the account.

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key in (
    'checkin_first', 'streak_3', 'streak_7', 'streak_14', 'streak_30', 'checkin_days_30',
    'meal_first', 'meal_20', 'lab_first', 'lab_two_dates', 'profile_done', 'line_linked', 'quiz_done'
  )),
  earned_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_achievements enable row level security;
revoke all on public.user_achievements from anon, authenticated;
grant select on public.user_achievements to authenticated;

create policy user_achievements_select_own on public.user_achievements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Count the person's history and add every badge now earned. Returns the keys added this time.
create or replace function public.award_achievements(p_user uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_days integer;
  v_best integer;
  v_meals integer;
  v_labs integer;
  v_lab_dates integer;
  v_added text[];
begin
  select count(*) into v_days from public.daily_checkins where user_id = p_user;

  select coalesce(max(run), 0) into v_best
  from (
    select count(*) as run
    from (
      select checkin_date - (row_number() over (order by checkin_date))::integer as grp
      from public.daily_checkins
      where user_id = p_user
    ) s
    group by grp
  ) r;

  select count(*) into v_meals from public.meal_logs where user_id = p_user and status = 'confirmed';
  select count(*), count(distinct collected_on) into v_labs, v_lab_dates
    from public.lab_reports where user_id = p_user and status = 'confirmed' and collected_on is not null;

  with earned(key) as (
    select k from (values
      ('checkin_first', v_days >= 1),
      ('streak_3', v_best >= 3),
      ('streak_7', v_best >= 7),
      ('streak_14', v_best >= 14),
      ('streak_30', v_best >= 30),
      ('checkin_days_30', v_days >= 30),
      ('meal_first', v_meals >= 1),
      ('meal_20', v_meals >= 20),
      ('lab_first', v_labs >= 1),
      ('lab_two_dates', v_lab_dates >= 2),
      ('profile_done', exists (select 1 from public.health_profiles where user_id = p_user)),
      ('line_linked', exists (select 1 from public.line_links where user_id = p_user)),
      ('quiz_done', exists (select 1 from public.quiz_results where user_id = p_user))
    ) as v(k, ok) where ok
  ), ins as (
    insert into public.user_achievements (user_id, key, earned_on)
    select p_user, key, v_today from earned
    on conflict do nothing
    returning key
  )
  select coalesce(array_agg(key order by key), '{}') into v_added from ins;
  return v_added;
end;
$$;

revoke all on function public.award_achievements(uuid) from public, anon, authenticated;
grant execute on function public.award_achievements(uuid) to service_role;
