-- Phase 1 / PromptPay payments (docs/03-promptpay-qr.md, docs/04-*.md).
--
-- Cycle: draft → review → paid | rejected (rejected can be re-reported).
-- Users can only READ their own rows. Every write goes through the server with
-- the service role (the amount is taken from platform_settings there, never
-- from the client), and "paid" is only ever set by confirm_payment() below —
-- a user pressing "I have paid" is a claim, not a receipt.

-- ── platform_settings: where the money goes ────────────────────────────────
-- Phone number (10 digits), citizen/tax id (13) or e-wallet id (15). Digits
-- only; null = payments not configured yet (the pay page then says so).
alter table public.platform_settings
  add column promptpay_id text check (promptpay_id is null or promptpay_id ~ '^[0-9]{10}$|^[0-9]{13}$|^[0-9]{15}$');

-- ── payments ───────────────────────────────────────────────────────────────
-- Kept as a ledger: user_id is nulled when the account is deleted, so the money
-- trail outlives the account (nobody is left to grant a plan to).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  plan_tier text not null check (plan_tier in ('gold', 'premium')),
  period text not null check (period in ('monthly', 'yearly')),
  amount integer not null check (amount > 0),
  -- The account the QR pointed at, frozen on the row: the owner may change the
  -- PromptPay id later and old rows must still say where the money went.
  promptpay_id text not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'paid', 'rejected', 'cancelled')),
  payer_ref text check (payer_ref is null or length(btrim(payer_ref)) between 1 and 80),
  reported_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text check (review_note is null or length(review_note) <= 500),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  -- Without a reference the reviewer cannot find the transfer on the statement.
  constraint payments_ref_required check (status in ('draft', 'cancelled') or payer_ref is not null)
);

create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_review_idx on public.payments (status, reported_at) where status = 'review';
-- One open draft per user: starting a new order replaces the previous draft.
create unique index payments_one_draft_per_user on public.payments (user_id) where status = 'draft';

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── user_subscriptions: one row per granted period ─────────────────────────
create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  payment_id uuid unique references public.payments (id) on delete set null,
  plan_tier text not null check (plan_tier in ('gold', 'premium')),
  period text not null check (period in ('monthly', 'yearly')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_at timestamptz not null default now()
);

create index user_subscriptions_user_idx on public.user_subscriptions (user_id, ends_at desc);

alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;

create policy user_subscriptions_select_own on public.user_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── confirm_payment: admin saw the money arrive ────────────────────────────
-- One transaction: lock the payment, require status = review, mark it paid,
-- write the ledger row and set the user's plan. A second confirm of the same
-- payment is refused, so a double click cannot extend the plan twice.
--
-- Period: a user renewing the SAME tier while it is still live is extended from
-- its expiry (paying early loses nothing); any other case starts now.
create or replace function public.confirm_payment(p_payment uuid, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_prof public.profiles;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_pay.status <> 'review' then
    return jsonb_build_object('ok', false, 'reason', 'not_in_review');
  end if;

  if v_pay.user_id is not null then
    select * into v_prof from public.profiles where id = v_pay.user_id for update;
  end if;

  if v_pay.user_id is null or not found then
    -- The account is gone: record the money as received, grant nothing.
    update public.payments
       set status = 'paid', paid_at = now(), reviewed_at = now(), reviewed_by = p_admin
     where id = p_payment;
    return jsonb_build_object('ok', true, 'granted', false);
  end if;

  v_start := now();
  if v_prof.plan_tier = v_pay.plan_tier and v_prof.plan_expires_at is not null and v_prof.plan_expires_at > v_start then
    v_start := v_prof.plan_expires_at;
  end if;
  v_end := case v_pay.period when 'yearly' then v_start + interval '1 year' else v_start + interval '1 month' end;

  update public.payments
     set status = 'paid', paid_at = now(), reviewed_at = now(), reviewed_by = p_admin, review_note = null
   where id = p_payment;

  insert into public.user_subscriptions (user_id, payment_id, plan_tier, period, starts_at, ends_at)
  values (v_pay.user_id, p_payment, v_pay.plan_tier, v_pay.period, v_start, v_end);

  update public.profiles
     set plan_tier = v_pay.plan_tier, plan_expires_at = v_end
   where id = v_pay.user_id;

  return jsonb_build_object('ok', true, 'granted', true, 'plan_tier', v_pay.plan_tier, 'ends_at', v_end);
end;
$$;

revoke all on function public.confirm_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, uuid) to service_role;
