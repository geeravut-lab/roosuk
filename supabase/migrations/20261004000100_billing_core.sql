-- Phase 1 / billing core: plan + trial columns, admin-tunable pricing and
-- fair-use settings, and the atomic AI usage counter behind the quota gate.
--
-- Users can READ their plan/trial state but never write it: profiles keeps its
-- column-level UPDATE grant (display_name, avatar_url, language only), so the
-- new columns below are server-written (service role) by construction.

-- ── profiles: plan + trial state ───────────────────────────────────────────
alter table public.profiles
  add column plan_tier text not null default 'free' check (plan_tier in ('free', 'gold', 'premium')),
  add column plan_expires_at timestamptz,
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,
  add column ai_suspended boolean not null default false;

-- ── platform_settings: prices, trial length, fair-use caps, quota overrides ─
-- Defaults mirror docs/Precision Health Subscription Tiers Business Model.pdf
-- and the owner's decisions D3/D4. Caps count AI calls per calendar month and
-- 0 = no cap. The cap defaults are PROVISIONAL: tune them from measured cost.
alter table public.platform_settings
  add column trial_days integer not null default 14 check (trial_days between 0 and 365),
  add column price_gold_monthly integer not null default 49 check (price_gold_monthly >= 0),
  add column price_gold_yearly integer not null default 490 check (price_gold_yearly >= 0),
  add column price_premium_monthly integer not null default 89 check (price_premium_monthly >= 0),
  add column price_premium_yearly integer not null default 890 check (price_premium_yearly >= 0),
  add column fair_use_cap_trial integer not null default 200 check (fair_use_cap_trial >= 0),
  add column fair_use_cap_premium integer not null default 600 check (fair_use_cap_premium >= 0),
  add column plan_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(plan_overrides) = 'object');

-- ── ai_usage: one row per user × feature × calendar month ──────────────────
-- `feature` is free text with a non-empty check: a CHECK over a list that keeps
-- growing is a trap (docs/07-line-notifications.md). Valid names live in code.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (length(btrim(feature)) > 0),
  period_start date not null check (period_start = date_trunc('month', period_start)::date),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, period_start)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── consume_usage: the quota gate's atomic check-and-count ─────────────────
-- Checks the limit AND increments in one transaction, serialised per user with
-- an advisory lock, so two simultaneous requests cannot both slip under the
-- limit. "Unlimited" (p_limit null) is still counted — usage data is what the
-- prices are set from. Called only by the server with the service role.
--
--   p_month         first day of the current calendar month (Asia/Bangkok)
--   p_window_start  first day of the quota window's first month (for a 3-month
--                   quota this is the start of the current quarter)
--   p_limit         max uses within the window; null = unlimited
--   p_month_cap     fair-use cap on ALL features this month; null/0 = none
create or replace function public.consume_usage(
  p_user uuid,
  p_feature text,
  p_month date,
  p_window_start date,
  p_limit integer,
  p_month_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_used integer;
  v_month_total integer;
begin
  if p_month <> date_trunc('month', p_month)::date or p_window_start <> date_trunc('month', p_window_start)::date then
    raise exception 'p_month and p_window_start must be the first day of a month';
  end if;
  if p_window_start > p_month then
    raise exception 'p_window_start must not be after p_month';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select coalesce(sum(used), 0) into v_window_used
    from public.ai_usage
   where user_id = p_user and feature = p_feature
     and period_start >= p_window_start and period_start <= p_month;

  select coalesce(sum(used), 0) into v_month_total
    from public.ai_usage
   where user_id = p_user and period_start = p_month;

  if p_limit is not null and v_window_used >= p_limit then
    return jsonb_build_object('allowed', false, 'reason', 'quota_exhausted',
                              'used', v_window_used, 'month_total', v_month_total);
  end if;

  if coalesce(p_month_cap, 0) > 0 and v_month_total >= p_month_cap then
    return jsonb_build_object('allowed', false, 'reason', 'fair_use',
                              'used', v_window_used, 'month_total', v_month_total);
  end if;

  insert into public.ai_usage (user_id, feature, period_start, used)
  values (p_user, p_feature, p_month, 1)
  on conflict (user_id, feature, period_start)
  do update set used = public.ai_usage.used + 1, updated_at = now();

  return jsonb_build_object('allowed', true, 'reason', 'ok',
                            'used', v_window_used + 1, 'month_total', v_month_total + 1);
end;
$$;

revoke all on function public.consume_usage(uuid, text, date, date, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, date, date, integer, integer) to service_role;
