-- Phase 3E / Corporate plan (basic) and Creator toolkit.
--
-- Corporate: the admin signs a company up for a number of seats on a plan until a
-- date; each employee joins with the company's code, keeps their OWN account and
-- data, and has that plan while the company is active and in date (applied in code,
-- src/lib/billing/grants.server.ts). The company never sees an individual: an
-- employee may opt in to be counted in anonymous group figures, and the figures are
-- shown only when enough people took part (src/lib/corporate/corporate.ts).
--
-- Creators: a person the admin names gets their own memorable referral code and a
-- page with their numbers and ready-made share text. The referral rewards
-- themselves are the ones already set at /admin/rewards.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  code text not null unique check (code ~ '^[2-9A-HJ-NP-Z]{6,10}$'),
  seats integer not null check (seats between 1 and 100000),
  tier text not null default 'premium' check (tier in ('gold', 'premium')),
  valid_until date not null,
  active boolean not null default true,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);

create table public.company_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  -- the person's own, separate opt-in to be counted in the company's anonymous group figures
  share_stats boolean not null default false,
  joined_at timestamptz not null default now()
);
create index company_members_company_idx on public.company_members (company_id);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
revoke all on public.companies, public.company_members from anon, authenticated;
grant select on public.company_members to authenticated;
create policy company_members_select_own on public.company_members
  for select to authenticated using (user_id = (select auth.uid()));

-- reason: invalid | inactive | expired | full | in_company
create or replace function public.join_company(p_user uuid, p_code text, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.companies%rowtype;
begin
  select * into v from public.companies where code = upper(btrim(p_code)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not v.active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if v.valid_until < p_today then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if exists (select 1 from public.company_members where user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'in_company');
  end if;
  if (select count(*) from public.company_members where company_id = v.id) >= v.seats then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  insert into public.company_members (user_id, company_id) values (p_user, v.id);
  return jsonb_build_object('ok', true, 'company', v.id, 'name', v.name);
end;
$$;
revoke all on function public.join_company(uuid, text, date) from public, anon, authenticated;
grant execute on function public.join_company(uuid, text, date) to service_role;

-- ── creators ────────────────────────────────────────────────────────────────
create table public.creators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table public.creators enable row level security;
revoke all on public.creators from anon, authenticated;
grant select on public.creators to authenticated;
create policy creators_select_own on public.creators
  for select to authenticated using (user_id = (select auth.uid()));

-- Make the account with this email a creator with this code. 'ok' | 'not_found' | 'invalid' | 'taken'
create or replace function public.make_creator(p_email text, p_slug text, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_slug text := upper(btrim(p_slug));
begin
  if v_slug !~ '^[2-9A-HJ-NP-Z]{6,10}$' or length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    return 'invalid';
  end if;
  v_user := public.user_id_by_email(p_email);
  if v_user is null then
    return 'not_found';
  end if;
  if exists (select 1 from public.referral_codes where code = v_slug and user_id <> v_user) then
    return 'taken';
  end if;
  insert into public.referral_codes (user_id, code) values (v_user, v_slug)
    on conflict (user_id) do update set code = excluded.code;
  insert into public.creators (user_id, display_name) values (v_user, btrim(p_name))
    on conflict (user_id) do update set display_name = excluded.display_name;
  return 'ok';
end;
$$;
revoke all on function public.make_creator(text, text, text) from public, anon, authenticated;
grant execute on function public.make_creator(text, text, text) to service_role;
