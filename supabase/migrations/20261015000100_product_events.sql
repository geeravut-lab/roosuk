-- Phase 1 / usage analytics (K05): a small event log for the admin dashboard —
-- who is active (DAU/WAU/MAU), where people drop out of the funnel, which
-- features get used. Events carry NO content (no answers, values, food, text):
-- just the event name, the day, the user (null for the public quiz) and an
-- optional short tag. The list of event names is decided in code
-- (src/lib/analytics/events.ts); the database only checks their shape.
-- Written by the server only (service role); users have no access of their own
-- (their copy is the PDPA export), and the rows go with the account.

create table public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  event text not null check (event ~ '^[a-z][a-z0-9_]{2,39}$'),
  day date not null default public.bangkok_today(),
  detail text check (detail is null or length(detail) <= 40),
  created_at timestamptz not null default now()
);

create index product_events_day_event_idx on public.product_events (day, event);
create index product_events_user_idx on public.product_events (user_id, day) where user_id is not null;
-- once per user per day / once per user: repeats are ignored by the writer
create unique index product_events_active_uniq on public.product_events (user_id, day) where event = 'active';
create unique index product_events_signup_uniq on public.product_events (user_id) where event = 'signup';

alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;

-- ── admin_analytics: everything the dashboard shows, in one call ─────────────
-- The funnel counts distinct users who did each step INSIDE the window (not a
-- cohort): good enough to see where the biggest drop is. Retention is cohort-based:
-- of the users who signed up in the window (and long enough ago), the share seen
-- active again exactly 1 / 7 days later.
create or replace function public.admin_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.bangkok_today();
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_from date;
begin
  v_from := v_today - (v_days - 1);
  return jsonb_build_object(
    'today', v_today,
    'days', v_days,
    'dau', (select count(distinct user_id) from public.product_events where event = 'active' and day = v_today),
    'wau', (select count(distinct user_id) from public.product_events where event = 'active' and day > v_today - 7),
    'mau', (select count(distinct user_id) from public.product_events where event = 'active' and day > v_today - 30),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', g.day, 'active', coalesce(a.n, 0)) order by g.day)
        from generate_series(v_from, v_today, interval '1 day') as g(day)
        left join (
          select day, count(distinct user_id) as n
            from public.product_events where event = 'active' and day >= v_from group by day
        ) a on a.day = g.day::date
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event', event, 'total', total, 'users', users) order by total desc)
        from (
          select event, count(*) as total, count(distinct user_id) as users
            from public.product_events
           where day >= v_from and event <> 'active'
           group by event
        ) s
    ), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'quiz', (select count(*) from public.product_events where event = 'quiz_completed' and day >= v_from),
      'signup', (select count(distinct user_id) from public.product_events where event = 'signup' and day >= v_from),
      'scan', (select count(distinct user_id) from public.product_events where event in ('food_scanned', 'lab_scanned') and day >= v_from),
      'paywall', (select count(distinct user_id) from public.product_events where event = 'paywall_viewed' and day >= v_from),
      'order', (select count(distinct user_id) from public.product_events where event = 'order_created' and day >= v_from),
      'subscribed', (select count(distinct user_id) from public.product_events where event = 'subscribed' and day >= v_from)
    ),
    'retention', jsonb_build_object(
      'd1_cohort', (select count(*) from public.product_events s where s.event = 'signup' and s.day >= v_from and s.day <= v_today - 1),
      'd1_back', (
        select count(*) from public.product_events s
         where s.event = 'signup' and s.day >= v_from and s.day <= v_today - 1
           and exists (select 1 from public.product_events a where a.user_id = s.user_id and a.event = 'active' and a.day = s.day + 1)
      ),
      'd7_cohort', (select count(*) from public.product_events s where s.event = 'signup' and s.day >= v_from and s.day <= v_today - 7),
      'd7_back', (
        select count(*) from public.product_events s
         where s.event = 'signup' and s.day >= v_from and s.day <= v_today - 7
           and exists (select 1 from public.product_events a where a.user_id = s.user_id and a.event = 'active' and a.day = s.day + 7)
      )
    )
  );
end;
$$;

revoke all on function public.admin_analytics(integer) from public, anon, authenticated;
grant execute on function public.admin_analytics(integer) to service_role;
