-- Phase 2 / rewards: a credit wallet (in baht) earned from referrals and
-- challenges and spent as a discount on the next subscription payment (later:
-- on products and check-ups). Amounts and limits are the admin's, in
-- platform_settings. The wallet is an insert-only LEDGER written by the server
-- (service role / SECURITY DEFINER functions) — a person can read their own
-- rows and nothing else — and a balance is just the sum, so it can be audited.

-- ── what the admin sets ─────────────────────────────────────────────────────
alter table public.platform_settings
  add column reward_referral_thb integer not null default 10 check (reward_referral_thb between 0 and 1000),
  add column reward_referee_thb integer not null default 0 check (reward_referee_thb between 0 and 1000),
  add column reward_challenge_thb integer not null default 15 check (reward_challenge_thb between 0 and 1000),
  add column redeem_max_subscription_thb integer not null default 10 check (redeem_max_subscription_thb between 0 and 100000),
  add column redeem_max_other_thb integer not null default 20 check (redeem_max_other_thb between 0 and 100000),
  add column referral_min_checkin_days integer not null default 3 check (referral_min_checkin_days between 1 and 30),
  add column referral_max_rewards integer not null default 20 check (referral_max_rewards between 0 and 1000),
  add column challenge_max_rewards_per_month integer not null default 4 check (challenge_max_rewards_per_month between 0 and 100);

-- ── the ledger ──────────────────────────────────────────────────────────────
create table public.reward_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'referral_reward', 'referee_bonus', 'challenge_reward',
    'redeem_subscription', 'redeem_refund', 'redeem_other', 'admin_adjust'
  )),
  amount_thb integer not null check (amount_thb <> 0),
  -- what it was for: the referred person's id, a challenge id, a payment id…
  ref text check (ref is null or length(ref) <= 80),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint reward_ledger_sign check (
    (kind in ('referral_reward', 'referee_bonus', 'challenge_reward', 'redeem_refund') and amount_thb > 0)
    or (kind in ('redeem_subscription', 'redeem_other') and amount_thb < 0)
    or kind = 'admin_adjust'
  )
);

create index reward_ledger_user_idx on public.reward_ledger (user_id, created_at desc);
-- A reward is granted once per thing it was earned for (retries and double clicks add nothing).
create unique index reward_ledger_grant_once on public.reward_ledger (user_id, kind, ref)
  where kind in ('referral_reward', 'referee_bonus', 'challenge_reward') and ref is not null;

alter table public.reward_ledger enable row level security;
revoke all on public.reward_ledger from anon, authenticated;
grant select on public.reward_ledger to authenticated;
create policy reward_ledger_select_own on public.reward_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Spend credit: refuses when the balance is short. One spender per person at a time (advisory lock),
-- so two payments cannot both spend the same baht.
create or replace function public.redeem_credit(p_user uuid, p_amount integer, p_kind text, p_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 or p_kind not in ('redeem_subscription', 'redeem_other') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtext('reward:' || p_user::text));
  select coalesce(sum(amount_thb), 0) into v_balance from public.reward_ledger where user_id = p_user;
  if v_balance < p_amount then
    return false;
  end if;
  insert into public.reward_ledger (user_id, kind, amount_thb, ref) values (p_user, p_kind, -p_amount, left(p_ref, 80));
  return true;
end;
$$;
revoke all on function public.redeem_credit(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.redeem_credit(uuid, integer, text, text) to service_role;

-- ── referrals ───────────────────────────────────────────────────────────────
create table public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,10}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
revoke all on public.referral_codes from anon, authenticated;
grant select on public.referral_codes to authenticated;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated using (user_id = (select auth.uid()));

create table public.referrals (
  referee_id uuid primary key references auth.users (id) on delete cascade,
  -- null once the inviter has deleted their account (the invited person's own record stays)
  referrer_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  constraint referrals_not_self check (referee_id <> referrer_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;
grant select on public.referrals to authenticated;
create policy referrals_select_own on public.referrals
  for select to authenticated
  using (referee_id = (select auth.uid()) or referrer_id = (select auth.uid()));

-- The person's own code (made on first need).
create or replace function public.ensure_referral_code(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_try integer := 0;
begin
  select code into v_code from public.referral_codes where user_id = p_user;
  if found then
    return v_code;
  end if;
  loop
    -- no 0/O/1/I: a code gets read aloud and typed
    v_code := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 7)
    );
    begin
      insert into public.referral_codes (user_id, code) values (p_user, v_code);
      return v_code;
    exception when unique_violation then
      -- either the code is taken (try another) or the user raced us (return theirs)
      select code into v_code from public.referral_codes where user_id = p_user;
      if found then
        return v_code;
      end if;
      v_try := v_try + 1;
      if v_try > 20 then
        raise exception 'could not make a referral code';
      end if;
    end;
  end loop;
end;
$$;
revoke all on function public.ensure_referral_code(uuid) from public, anon, authenticated;
grant execute on function public.ensure_referral_code(uuid) to service_role;

-- Link a new person to whoever invited them. Only a young account, only once, never themselves.
create or replace function public.attach_referral(p_referee uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
  v_created timestamptz;
begin
  select user_id into v_referrer from public.referral_codes where code = upper(btrim(p_code));
  if not found then
    return 'invalid';
  end if;
  if v_referrer = p_referee then
    return 'self';
  end if;
  if exists (select 1 from public.referrals where referee_id = p_referee) then
    return 'already';
  end if;
  select created_at into v_created from public.profiles where id = p_referee;
  if not found or v_created < now() - interval '14 days' then
    return 'too_late';
  end if;
  insert into public.referrals (referee_id, referrer_id) values (p_referee, v_referrer);
  return 'ok';
end;
$$;
revoke all on function public.attach_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_referral(uuid, text) to service_role;

-- The invited person has been showing up (N check-in days): the reward is earned, once.
create or replace function public.qualify_referral(p_referee uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref public.referrals;
  v_set public.platform_settings;
  v_days integer;
  v_given integer;
  v_referrer_amount integer := 0;
  v_referee_amount integer := 0;
begin
  select * into v_ref from public.referrals where referee_id = p_referee for update;
  if not found or v_ref.qualified_at is not null then
    return jsonb_build_object('qualified', false);
  end if;
  select * into v_set from public.platform_settings where id = true;
  select count(*) into v_days from public.daily_checkins where user_id = p_referee;
  if v_days < coalesce(v_set.referral_min_checkin_days, 3) then
    return jsonb_build_object('qualified', false);
  end if;

  update public.referrals set qualified_at = now() where referee_id = p_referee;

  select count(*) into v_given from public.reward_ledger where user_id = v_ref.referrer_id and kind = 'referral_reward';
  if v_ref.referrer_id is not null and coalesce(v_set.reward_referral_thb, 10) > 0 and v_given < coalesce(v_set.referral_max_rewards, 20) then
    insert into public.reward_ledger (user_id, kind, amount_thb, ref)
    values (v_ref.referrer_id, 'referral_reward', v_set.reward_referral_thb, p_referee::text)
    on conflict do nothing;
    v_referrer_amount := v_set.reward_referral_thb;
  end if;
  if coalesce(v_set.reward_referee_thb, 0) > 0 then
    insert into public.reward_ledger (user_id, kind, amount_thb, ref)
    values (p_referee, 'referee_bonus', v_set.reward_referee_thb, p_referee::text)
    on conflict do nothing;
    v_referee_amount := v_set.reward_referee_thb;
  end if;
  return jsonb_build_object('qualified', true, 'referrer', v_ref.referrer_id,
                            'referrer_amount', v_referrer_amount, 'referee_amount', v_referee_amount);
end;
$$;
revoke all on function public.qualify_referral(uuid) from public, anon, authenticated;
grant execute on function public.qualify_referral(uuid) to service_role;

-- ── spending it on a subscription payment ───────────────────────────────────
-- The order (draft) records the discount it was priced with; the credit is
-- actually spent when the person reports their transfer, and given back if the
-- transfer is rejected, so a draft that is abandoned or replaced costs nothing.
alter table public.payments
  add column credit_applied_thb integer not null default 0 check (credit_applied_thb >= 0),
  add column credit_consumed boolean not null default false;

create or replace function public.consume_payment_credit(p_payment uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then
    return false;
  end if;
  if v_pay.credit_applied_thb = 0 or v_pay.credit_consumed then
    return true;
  end if;
  if v_pay.user_id is null or not public.redeem_credit(v_pay.user_id, v_pay.credit_applied_thb, 'redeem_subscription', p_payment::text) then
    return false;
  end if;
  update public.payments set credit_consumed = true where id = p_payment;
  return true;
end;
$$;
revoke all on function public.consume_payment_credit(uuid) from public, anon, authenticated;
grant execute on function public.consume_payment_credit(uuid) to service_role;

create or replace function public.refund_payment_credit(p_payment uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found or not v_pay.credit_consumed or v_pay.user_id is null then
    return false;
  end if;
  insert into public.reward_ledger (user_id, kind, amount_thb, ref)
  values (v_pay.user_id, 'redeem_refund', v_pay.credit_applied_thb, left(p_payment::text || ':' || extract(epoch from clock_timestamp())::bigint, 80));
  update public.payments set credit_consumed = false where id = p_payment;
  return true;
end;
$$;
revoke all on function public.refund_payment_credit(uuid) from public, anon, authenticated;
grant execute on function public.refund_payment_credit(uuid) to service_role;
