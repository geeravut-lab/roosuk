-- Liver Health module, Phase L1 (screening and care navigation, never diagnosis).
--
-- Three tables:
--   liver_assessments      one row per questionnaire run: the answers, the labs the
--                          engine used and its result (codes only). Written ONLY by
--                          the server (service role) through record_liver_assessment(),
--                          so a person cannot forge a score or a level. Immutable.
--   liver_audit_log        append-only trail of every assessment (who, when, level,
--                          engine version, digest of the inputs). No update, no
--                          delete (except the cascade when the account is erased).
--   liver_hepatitis_status what the person says about hepatitis B/C testing. A
--                          record of their own words, not a diagnosis. Server-written.
--
-- Users can only READ their own rows. Everything else goes through the service role.

-- ── assessments ─────────────────────────────────────────────────────────────
create table public.liver_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level smallint not null check (level between 0 and 3),
  urgency text not null check (urgency in ('none', 'soon', 'emergency')),
  -- the two headline scores, null when they could not be calculated (never a made-up number)
  fib4 numeric(8, 2),
  apri numeric(8, 2),
  engine_version text not null check (length(engine_version) between 1 and 60),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  -- urgency and level must agree: 'emergency' and 'soon' only exist at level 3
  constraint liver_assessments_urgency_level check ((level = 3) = (urgency <> 'none'))
);
create index liver_assessments_user_idx on public.liver_assessments (user_id, created_at desc);

alter table public.liver_assessments enable row level security;
revoke all on public.liver_assessments from anon, authenticated;
grant select on public.liver_assessments to authenticated;
create policy liver_assessments_select_own on public.liver_assessments
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.liver_block_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'liver assessments and their audit trail are append-only';
end;
$$;

create trigger liver_assessments_immutable
  before update on public.liver_assessments
  for each row execute function public.liver_block_update();

-- ── audit log ───────────────────────────────────────────────────────────────
create table public.liver_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null references public.liver_assessments (id) on delete cascade,
  event text not null check (event in ('assessed')),
  level smallint not null check (level between 0 and 3),
  urgency text not null check (urgency in ('none', 'soon', 'emergency')),
  engine_version text not null check (length(engine_version) between 1 and 60),
  -- SHA-256 of the normalised answers + lab values the engine saw, to prove later what it was given
  inputs_digest text not null check (inputs_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index liver_audit_log_user_idx on public.liver_audit_log (user_id, created_at desc);

alter table public.liver_audit_log enable row level security;
revoke all on public.liver_audit_log from anon, authenticated;
grant select on public.liver_audit_log to authenticated;
create policy liver_audit_log_select_own on public.liver_audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create trigger liver_audit_log_immutable
  before update on public.liver_audit_log
  for each row execute function public.liver_block_update();
-- Nobody edits or removes a row; only the cascade from deleting the account (which runs as the
-- table owner and is not a grant) clears them.
revoke update, delete, truncate on public.liver_audit_log from anon, authenticated, service_role;
revoke update, delete, truncate on public.liver_assessments from anon, authenticated, service_role;

-- ── hepatitis B / C status (self-reported) ──────────────────────────────────
create table public.liver_hepatitis_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hep_b text not null default 'unknown'
    check (hep_b in ('unknown', 'never_tested', 'negative', 'positive', 'vaccinated')),
  hep_c text not null default 'unknown'
    check (hep_c in ('unknown', 'never_tested', 'negative', 'positive')),
  hep_b_tested_on date,
  hep_c_tested_on date,
  updated_at timestamptz not null default now()
);

create trigger liver_hepatitis_status_set_updated_at
  before update on public.liver_hepatitis_status
  for each row execute function public.set_updated_at();

alter table public.liver_hepatitis_status enable row level security;
revoke all on public.liver_hepatitis_status from anon, authenticated;
grant select on public.liver_hepatitis_status to authenticated;
create policy liver_hepatitis_status_select_own on public.liver_hepatitis_status
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── record_liver_assessment: assessment + audit + hepatitis status, atomically ──
-- The server computes the result with the rule engine and calls this with the
-- service role. One transaction: either all three rows are written or none.
-- Returns the new assessment id, or NULL when the person already ran 20 checks in
-- the last 24 hours (keeps the audit trail from being flooded).
create or replace function public.record_liver_assessment(
  p_user uuid,
  p_level smallint,
  p_urgency text,
  p_fib4 numeric,
  p_apri numeric,
  p_engine text,
  p_answers jsonb,
  p_result jsonb,
  p_digest text,
  p_hep_b text,
  p_hep_c text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_recent integer;
begin
  select count(*) into v_recent
    from public.liver_assessments
   where user_id = p_user and created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    return null;
  end if;

  insert into public.liver_assessments (user_id, level, urgency, fib4, apri, engine_version, answers, result)
  values (p_user, p_level, p_urgency, p_fib4, p_apri, p_engine, p_answers, p_result)
  returning id into v_id;

  insert into public.liver_audit_log (user_id, assessment_id, event, level, urgency, engine_version, inputs_digest)
  values (p_user, v_id, 'assessed', p_level, p_urgency, p_engine, p_digest);

  -- the answers carry the person's hepatitis status: keep the latest on file
  insert into public.liver_hepatitis_status (user_id, hep_b, hep_c)
  values (p_user, p_hep_b, p_hep_c)
  on conflict (user_id) do update
    set hep_b = excluded.hep_b,
        hep_c = excluded.hep_c,
        -- a changed status makes the old test date meaningless
        hep_b_tested_on = case when public.liver_hepatitis_status.hep_b = excluded.hep_b then public.liver_hepatitis_status.hep_b_tested_on end,
        hep_c_tested_on = case when public.liver_hepatitis_status.hep_c = excluded.hep_c then public.liver_hepatitis_status.hep_c_tested_on end
    where (public.liver_hepatitis_status.hep_b, public.liver_hepatitis_status.hep_c)
          is distinct from (excluded.hep_b, excluded.hep_c);

  return v_id;
end;
$$;

revoke all on function public.record_liver_assessment(uuid, smallint, text, numeric, numeric, text, jsonb, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_liver_assessment(uuid, smallint, text, numeric, numeric, text, jsonb, jsonb, text, text, text)
  to service_role;
