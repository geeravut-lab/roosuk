-- Phase 3A / Health Passport + AI Pre-Doctor Brief: a link the person makes to
-- show a doctor what THEY chose to show. The content is a snapshot taken when the
-- link is made (what was shared is what the person saw at that moment), the link
-- has an expiry, can be cancelled any time, and only the SHA-256 of its secret is
-- stored — the link itself is shown once. Rows are written by the server only.

create table public.health_passports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  holder_name text check (holder_name is null or length(btrim(holder_name)) between 1 and 60),
  sections text[] not null check (cardinality(sections) between 1 and 6),
  snapshot jsonb not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index health_passports_user_idx on public.health_passports (user_id, created_at desc);

alter table public.health_passports enable row level security;
revoke all on public.health_passports from anon, authenticated;
grant select on public.health_passports to authenticated;
create policy health_passports_select_own on public.health_passports
  for select to authenticated
  using (user_id = (select auth.uid()));

-- What a visitor with the link gets. Looks the link up by the hash of its secret and,
-- only when it is live, counts the view and returns the snapshot. One statement, so a
-- cancelled or expired link can never be opened by a request that raced the cancel.
create or replace function public.open_passport(p_hash text)
returns table (status text, label text, holder_name text, snapshot jsonb, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.health_passports%rowtype;
begin
  select * into v from public.health_passports where token_hash = p_hash;
  if not found then
    return query select 'missing'::text, null::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;
  if v.revoked_at is not null then
    return query select 'revoked'::text, null::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;
  if v.expires_at <= now() then
    return query select 'expired'::text, null::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;
  update public.health_passports
     set view_count = view_count + 1, last_viewed_at = now()
   where id = v.id;
  return query select 'ok'::text, v.label, v.holder_name, v.snapshot, v.expires_at;
end;
$$;
revoke all on function public.open_passport(text) from public, anon, authenticated;
grant execute on function public.open_passport(text) to service_role;

-- The AI conversation log accepts the brief.
alter table public.ai_conversations drop constraint ai_conversations_kind_check;
alter table public.ai_conversations
  add constraint ai_conversations_kind_check check (kind in ('chat', 'lab_explain', 'monthly_report', 'insight', 'doctor_brief'));
