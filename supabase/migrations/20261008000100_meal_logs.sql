-- Phase 1 / Food Scan: meal logs + a refund for AI uses that did not deliver.
--
-- The photo is analysed in memory and NOT stored (no photo consent is needed
-- for what is never kept). A scan first creates a DRAFT the user reviews, then
-- confirms. Rows are written only by the server (service role): the nutrition
-- numbers come from our catalog, so users read and delete their own rows but
-- never write them.

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_date date not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 8),
  kcal integer not null check (kcal between 0 and 20000),
  protein_g numeric(7, 1) not null check (protein_g >= 0),
  carbs_g numeric(7, 1) not null check (carbs_g >= 0),
  fat_g numeric(7, 1) not null check (fat_g >= 0),
  -- provider/model that read the photo, for cost and quality tracking
  model text check (model is null or length(model) <= 100),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint meal_logs_confirmed_has_time check (status <> 'confirmed' or confirmed_at is not null)
);

create index meal_logs_user_date_idx on public.meal_logs (user_id, meal_date desc, created_at desc);

alter table public.meal_logs enable row level security;
revoke all on public.meal_logs from anon, authenticated;
grant select, delete on public.meal_logs to authenticated;

create policy meal_logs_select_own on public.meal_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy meal_logs_delete_own on public.meal_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── refund_usage: give back one AI use when the call failed on our side ─────
-- The quota is charged BEFORE the provider call (so a refused user costs
-- nothing); if the provider then fails — or finds no food in the photo — the
-- user must not lose a use for it. Never drops below zero.
create or replace function public.refund_usage(p_user uuid, p_feature text, p_month date)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set used = greatest(used - 1, 0), updated_at = now()
   where user_id = p_user and feature = p_feature and period_start = p_month;
$$;

revoke all on function public.refund_usage(uuid, text, date) from public, anon, authenticated;
grant execute on function public.refund_usage(uuid, text, date) to service_role;
