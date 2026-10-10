-- e-KYC (identity verification): liveness -> ID / passport OCR -> face match, done
-- by a provider on the SERVER. What this schema guarantees:
--   · nobody but the service role writes a result: a person cannot mark themselves
--     verified, the admin queue is decided through functions that audit the change;
--   · NO image is stored anywhere, only masked facts (name, masked document number)
--     and the scores;
--   · at most ONE live verification per person (unique partial index), a daily
--     attempt limit and "never re-verify a verified user" are decided in SQL under a
--     per-user lock, so two parallel requests cannot both pass.
-- The admin's switches live in a single-row table, like platform_settings.

-- ── settings (single row) ───────────────────────────────────────────────────
create table public.ekyc_settings (
  id boolean primary key default true check (id),
  -- master switch: OFF by default; the real provider key is a server secret, not a column
  enabled boolean not null default false,
  thai_id boolean not null default true,
  passport boolean not null default true,
  liveness boolean not null default true,
  face_match boolean not null default true,
  liveness_threshold numeric(3, 2) not null default 0.80 check (liveness_threshold between 0 and 1),
  -- 0 = use the provider's own threshold
  face_threshold numeric(5, 2) not null default 0 check (face_threshold between 0 and 100),
  max_attempts_per_day smallint not null default 5 check (max_attempts_per_day between 1 and 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.ekyc_settings (id) values (true) on conflict (id) do nothing;
alter table public.ekyc_settings enable row level security;
revoke all on public.ekyc_settings from anon, authenticated;
grant select on public.ekyc_settings to authenticated;
create policy ekyc_settings_select on public.ekyc_settings for select to authenticated using (true);

-- ── attempts (what the daily limit counts; every provider call costs money) ──
create table public.ekyc_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ekyc_attempts_user_idx on public.ekyc_attempts (user_id, created_at desc);
alter table public.ekyc_attempts enable row level security;
revoke all on public.ekyc_attempts from anon, authenticated;

-- ── verifications (masked facts + scores, never an image) ───────────────────
create table public.ekyc_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in ('thai_id', 'passport')),
  -- passed: decided by the rules · review: failed, waits for an admin · approved/rejected: the admin's call · revoked: taken back
  status text not null check (status in ('passed', 'review', 'approved', 'rejected', 'revoked')),
  doc_name text check (doc_name is null or length(doc_name) <= 120),
  doc_number_masked text check (doc_number_masked is null or length(doc_number_masked) <= 40),
  nationality text check (nationality is null or length(nationality) <= 40),
  liveness_score numeric,
  ocr_score numeric,
  face_score numeric,
  face_threshold numeric,
  -- which step passed / failed, e.g. {"liveness": true, "face_match": false}
  steps jsonb not null default '{}'::jsonb check (jsonb_typeof(steps) = 'object'),
  reasons text[] not null default '{}',
  provider text not null default 'iapp' check (length(provider) <= 30),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 500),
  created_at timestamptz not null default now()
);
create index ekyc_verifications_user_idx on public.ekyc_verifications (user_id, created_at desc);
create index ekyc_verifications_queue_idx on public.ekyc_verifications (status, created_at);
-- one live verification per person
create unique index ekyc_verifications_one_live on public.ekyc_verifications (user_id)
  where status in ('passed', 'approved');

alter table public.ekyc_verifications enable row level security;
revoke all on public.ekyc_verifications from anon, authenticated;
grant select on public.ekyc_verifications to authenticated;
create policy ekyc_verifications_select_own on public.ekyc_verifications
  for select to authenticated using (user_id = (select auth.uid()));

-- ── is this person verified? ────────────────────────────────────────────────
create or replace function public.is_kyc_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ekyc_verifications
     where user_id = p_user and status in ('passed', 'approved')
  );
$$;
revoke all on function public.is_kyc_verified(uuid) from public, anon, authenticated;
grant execute on function public.is_kyc_verified(uuid) to service_role;

-- ── start an attempt: limit + never re-verify, atomically ───────────────────
-- 'ok' | 'verified' (already verified) | 'pending' (an earlier failure still waits for an admin) | 'limit'
create or replace function public.ekyc_begin_attempt(p_user uuid, p_max integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext('ekyc:' || p_user::text));
  if public.is_kyc_verified(p_user) then
    return 'verified';
  end if;
  if exists (select 1 from public.ekyc_verifications where user_id = p_user and status = 'review') then
    return 'pending';
  end if;
  select count(*) into v_n from public.ekyc_attempts
   where user_id = p_user and created_at > now() - interval '24 hours';
  if v_n >= greatest(p_max, 1) then
    return 'limit';
  end if;
  insert into public.ekyc_attempts (user_id) values (p_user);
  return 'ok';
end;
$$;
revoke all on function public.ekyc_begin_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.ekyc_begin_attempt(uuid, integer) to service_role;

-- ── the admin's decisions (all audited) ─────────────────────────────────────
-- 'ok' | 'forbidden' | 'not_found' | 'state' (not waiting for review) | 'already' (the person is verified meanwhile)
create or replace function public.ekyc_admin_review(p_actor uuid, p_id uuid, p_approve boolean, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ekyc_verifications%rowtype;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  select * into v from public.ekyc_verifications where id = p_id for update;
  if not found then
    return 'not_found';
  end if;
  if v.status <> 'review' then
    return 'state';
  end if;
  if p_approve and public.is_kyc_verified(v.user_id) then
    return 'already';
  end if;
  update public.ekyc_verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = p_actor, reviewed_at = now(), review_note = left(p_note, 500)
   where id = p_id;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (v.user_id, case when p_approve then 'ekyc_approved' else 'ekyc_rejected' end, null,
            jsonb_build_object('by', p_actor, 'verification', p_id));
  return 'ok';
end;
$$;
revoke all on function public.ekyc_admin_review(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.ekyc_admin_review(uuid, uuid, boolean, text) to service_role;

-- Take a verification back (e.g. it was obtained by fraud). 'ok' | 'forbidden' | 'not_verified'
create or replace function public.ekyc_admin_revoke(p_actor uuid, p_user uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  update public.ekyc_verifications
     set status = 'revoked', reviewed_by = p_actor, reviewed_at = now(), review_note = left(p_note, 500)
   where user_id = p_user and status in ('passed', 'approved')
   returning id into v_id;
  if v_id is null then
    return 'not_verified';
  end if;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (p_user, 'ekyc_revoked', null, jsonb_build_object('by', p_actor, 'verification', v_id));
  return 'ok';
end;
$$;
revoke all on function public.ekyc_admin_revoke(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ekyc_admin_revoke(uuid, uuid, text) to service_role;

-- Give a person a fresh day of attempts (and close a stuck review). 'ok' | 'forbidden'
create or replace function public.ekyc_admin_reset(p_actor uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  delete from public.ekyc_attempts where user_id = p_user;
  update public.ekyc_verifications
     set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), review_note = 'reset by an admin'
   where user_id = p_user and status = 'review';
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (p_user, 'ekyc_reset', null, jsonb_build_object('by', p_actor));
  return 'ok';
end;
$$;
revoke all on function public.ekyc_admin_reset(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ekyc_admin_reset(uuid, uuid) to service_role;
