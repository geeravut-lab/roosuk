-- Phase 2 / challenges: a short goal about SHOWING UP (check-in days, days a
-- meal was logged) done alone or with one friend. Nothing here is about weight,
-- body shape or calories. Whoever reaches the target inside the window earns the
-- admin's challenge reward (reward_ledger); a friend's progress is just shown,
-- so one person finishing never takes the reward from the other.
--
-- Written only by the server (SECURITY DEFINER functions); people read the
-- challenges they take part in and their own participation.

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  template text not null check (template in ('streak7', 'days10of14', 'meals7of14')),
  mode text not null check (mode in ('solo', 'friend')),
  metric text not null check (metric in ('checkin_days', 'meal_days')),
  starts_on date not null,
  ends_on date not null,
  target integer not null check (target between 1 and 60),
  invite_code text unique check (invite_code is null or invite_code ~ '^[A-Z0-9]{6,10}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint challenges_window check (ends_on >= starts_on and ends_on - starts_on < 60),
  constraint challenges_target_fits check (target <= ends_on - starts_on + 1),
  constraint challenges_friend_has_code check (mode = 'solo' or invite_code is not null)
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);
create index challenge_participants_user_idx on public.challenge_participants (user_id, joined_at desc);

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
revoke all on public.challenges, public.challenge_participants from anon, authenticated;
grant select on public.challenges, public.challenge_participants to authenticated;

create policy challenge_participants_select_own on public.challenge_participants
  for select to authenticated using (user_id = (select auth.uid()));
create policy challenges_select_member on public.challenges
  for select to authenticated
  using (exists (
    select 1 from public.challenge_participants p
    where p.challenge_id = id and p.user_id = (select auth.uid())
  ));

-- Start one. At most 3 open at once and one per template; a friend challenge gets an invite code.
create or replace function public.start_challenge(
  p_user uuid, p_template text, p_mode text, p_metric text, p_target integer, p_days integer, p_today date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text := null;
  v_open integer;
begin
  perform pg_advisory_xact_lock(hashtext('challenge:' || p_user::text));
  select count(*) into v_open
    from public.challenge_participants p
    join public.challenges c on c.id = p.challenge_id
   where p.user_id = p_user and p.completed_at is null and c.ends_on >= p_today;
  if v_open >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  if exists (
    select 1 from public.challenge_participants p
    join public.challenges c on c.id = p.challenge_id
     where p.user_id = p_user and p.completed_at is null and c.ends_on >= p_today and c.template = p_template
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;
  if p_mode = 'friend' then
    loop
      v_code := (
        select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::integer, 1), '')
        from generate_series(1, 7)
      );
      exit when not exists (select 1 from public.challenges where invite_code = v_code);
    end loop;
  end if;
  insert into public.challenges (template, mode, metric, starts_on, ends_on, target, invite_code, created_by)
  values (p_template, p_mode, p_metric, p_today, p_today + p_days - 1, p_target, v_code, p_user)
  returning id into v_id;
  insert into public.challenge_participants (challenge_id, user_id) values (v_id, p_user);
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code);
end;
$$;
revoke all on function public.start_challenge(uuid, text, text, text, integer, integer, date) from public, anon, authenticated;
grant execute on function public.start_challenge(uuid, text, text, text, integer, integer, date) to service_role;

-- Join a friend's challenge by its code: only in its first two days, only two people, never your own.
create or replace function public.join_challenge(p_user uuid, p_code text, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.challenges;
begin
  select * into v_c from public.challenges where invite_code = upper(btrim(p_code)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if exists (select 1 from public.challenge_participants where challenge_id = v_c.id and user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'already', 'id', v_c.id);
  end if;
  if p_today > v_c.starts_on + 1 or p_today > v_c.ends_on then
    return jsonb_build_object('ok', false, 'reason', 'late');
  end if;
  if (select count(*) from public.challenge_participants where challenge_id = v_c.id) >= 2 then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  if (
    select count(*) from public.challenge_participants p
      join public.challenges c on c.id = p.challenge_id
     where p.user_id = p_user and p.completed_at is null and c.ends_on >= p_today
  ) >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.challenge_participants (challenge_id, user_id) values (v_c.id, p_user);
  return jsonb_build_object('ok', true, 'id', v_c.id);
end;
$$;
revoke all on function public.join_challenge(uuid, text, date) from public, anon, authenticated;
grant execute on function public.join_challenge(uuid, text, date) to service_role;

-- Look at the person's open challenges: reaching the target inside the window completes it, once,
-- and earns the admin's amount unless this month's cap for challenge rewards is used up.
create or replace function public.evaluate_challenges(p_user uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_have integer;
  v_set public.platform_settings;
  v_month_start date := date_trunc('month', p_today)::date;
  v_given integer;
  v_out jsonb := '[]'::jsonb;
  v_amount integer;
begin
  select * into v_set from public.platform_settings where id = true;
  for r in
    select c.id, c.metric, c.starts_on, c.ends_on, c.target
      from public.challenge_participants p
      join public.challenges c on c.id = p.challenge_id
     where p.user_id = p_user and p.completed_at is null
     for update of p
  loop
    if r.metric = 'checkin_days' then
      select count(*) into v_have from public.daily_checkins
       where user_id = p_user and checkin_date between r.starts_on and r.ends_on;
    else
      select count(distinct meal_date) into v_have from public.meal_logs
       where user_id = p_user and status = 'confirmed' and meal_date between r.starts_on and r.ends_on;
    end if;
    if v_have >= r.target then
      update public.challenge_participants set completed_at = now()
       where challenge_id = r.id and user_id = p_user;
      v_amount := 0;
      select count(*) into v_given from public.reward_ledger
       where user_id = p_user and kind = 'challenge_reward' and created_at >= v_month_start;
      if coalesce(v_set.reward_challenge_thb, 15) > 0 and v_given < coalesce(v_set.challenge_max_rewards_per_month, 4) then
        insert into public.reward_ledger (user_id, kind, amount_thb, ref)
        values (p_user, 'challenge_reward', v_set.reward_challenge_thb, r.id::text)
        on conflict do nothing;
        v_amount := v_set.reward_challenge_thb;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('challenge', r.id, 'amount', v_amount));
    end if;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.evaluate_challenges(uuid, date) from public, anon, authenticated;
grant execute on function public.evaluate_challenges(uuid, date) to service_role;
