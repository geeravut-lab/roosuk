-- Telepharmacy: talk to a pharmacist about a product, a medicine or a service, either
-- in a booked slot (mode A) or right now when one is free (mode B).
--
-- What the schema guarantees (the app is not the only line of defence):
--   · every state change goes through a SECURITY DEFINER function that locks the rows
--     it decides on — a customer cannot forge a status, two pharmacists cannot take the
--     same call, two people cannot take the same slot (unique indexes are the last wall);
--   · the room name and the customer's access key are random, only the key's SHA-256 is
--     stored, and the room link is never stored or sent to anyone but the two parties;
--   · what the pharmacist sees of a person is a SNAPSHOT the person agreed to share
--     when asking (profile ranges, optionally recent labs and earlier consult records) —
--     there is no live access to anything else, and the snapshot column is not readable
--     by a pharmacist's own client (only server code, which writes an access log row);
--   · the consult RECORD is written by the pharmacist, final once finalised (only the
--     follow-up part may still change), and kept when the person leaves — detached and
--     scrubbed of who they were (like shop orders);
--   · the access log is append-only and tells the person who opened their record.
-- A pharmacist's licence is marked verified ONLY by an admin (function below); changing
-- the licence number takes the mark away again.

-- ── settings (single row, the admin's) ──────────────────────────────────────
create table public.telepharmacy_settings (
  id boolean primary key default true check (id),
  -- everything is OFF until an admin switches it on
  enabled boolean not null default false,
  instant_enabled boolean not null default true,
  scheduled_enabled boolean not null default true,
  -- opening hours, Bangkok time. open_days: 0 = Sunday … 6 = Saturday
  open_days smallint[] not null default '{1,2,3,4,5,6}'
    check (cardinality(open_days) <= 7 and open_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  open_from time not null default '09:00',
  open_to time not null default '20:00',
  slot_minutes smallint not null default 20 check (slot_minutes between 10 and 120),
  -- how many customers can hold the same slot (normally the number of pharmacists on duty)
  slot_capacity smallint not null default 1 check (slot_capacity between 1 and 20),
  booking_days_ahead smallint not null default 14 check (booking_days_ahead between 1 and 60),
  booking_min_lead_minutes smallint not null default 60 check (booking_min_lead_minutes between 0 and 1440),
  max_active_bookings smallint not null default 3 check (max_active_bookings between 1 and 10),
  wait_timeout_sec integer not null default 180 check (wait_timeout_sec between 30 and 1800),
  max_waiting smallint not null default 3 check (max_waiting between 1 and 50),
  max_call_minutes smallint not null default 30 check (max_call_minutes between 5 and 180),
  video_provider text not null default 'jitsi' check (video_provider in ('jitsi', 'jaas', 'custom')),
  -- the consent a customer accepts is versioned: change the text => change the version
  consent_version text not null default 'draft-1' check (length(btrim(consent_version)) between 1 and 40),
  consent_text_th text not null default '' check (length(consent_text_th) <= 4000),
  consent_text_en text not null default '' check (length(consent_text_en) <= 4000),
  disclaimer_th text not null default '' check (length(disclaimer_th) <= 1500),
  disclaimer_en text not null default '' check (length(disclaimer_en) <= 1500),
  -- identity checks (e-KYC) — ON by default: a consult needs to know who it is with
  require_kyc_for_consult boolean not null default true,
  require_kyc_for_pharmacist boolean not null default true,
  -- how long finished consults and their records are kept before an admin may purge them
  retention_days integer not null default 1825 check (retention_days between 30 and 36500),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint telepharmacy_hours_order check (open_from < open_to)
);
insert into public.telepharmacy_settings (id) values (true) on conflict (id) do nothing;
alter table public.telepharmacy_settings enable row level security;
revoke all on public.telepharmacy_settings from anon, authenticated;
grant select on public.telepharmacy_settings to authenticated;
create policy telepharmacy_settings_select on public.telepharmacy_settings
  for select to authenticated using (true);

-- ── pharmacists ─────────────────────────────────────────────────────────────
create table public.pharmacists (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  -- the licence number as the pharmacist typed it; never trusted until an admin checks it
  license_no text check (license_no is null or length(btrim(license_no)) between 3 and 40),
  license_verified boolean not null default false,
  license_verified_at timestamptz,
  license_verified_by uuid references auth.users (id) on delete set null,
  online boolean not null default false,
  last_seen timestamptz,
  active_consult_id uuid,
  created_at timestamptz not null default now()
);
alter table public.pharmacists enable row level security;
revoke all on public.pharmacists from anon, authenticated;
grant select on public.pharmacists to authenticated;
create policy pharmacists_select_own on public.pharmacists
  for select to authenticated using (user_id = (select auth.uid()));

-- Changing the licence number takes the verification away (and the pharmacist off the line).
create or replace function public.pharmacists_license_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.license_no is distinct from old.license_no then
    new.license_verified := false;
    new.license_verified_at := null;
    new.license_verified_by := null;
    new.online := false;
  end if;
  return new;
end;
$$;
create trigger pharmacists_license_guard
  before update on public.pharmacists
  for each row execute function public.pharmacists_license_guard();

create or replace function public.is_pharmacist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pharmacists where user_id = (select auth.uid()));
$$;
revoke all on function public.is_pharmacist() from public, anon;
grant execute on function public.is_pharmacist() to authenticated;

-- May this pharmacist take calls? Licence checked by an admin AND (if required) identity verified.
create or replace function public.pharmacist_can_serve(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pharmacists p where p.user_id = p_user and p.license_verified)
     and (
       not coalesce((select s.require_kyc_for_pharmacist from public.telepharmacy_settings s where s.id), true)
       or public.is_kyc_verified(p_user)
     );
$$;
revoke all on function public.pharmacist_can_serve(uuid) from public, anon, authenticated;
grant execute on function public.pharmacist_can_serve(uuid) to service_role;

-- The signed-in user asks about THEMSELVES only (used by row policies).
create or replace function public.i_can_serve_consults()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pharmacist_can_serve((select auth.uid()));
$$;
revoke all on function public.i_can_serve_consults() from public, anon;
grant execute on function public.i_can_serve_consults() to authenticated;

-- ── consults ────────────────────────────────────────────────────────────────
create table public.consults (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('instant', 'scheduled')),
  -- waiting (instant, in the queue) · booked (scheduled, not started) · accepted (a pharmacist took it) · done · missed · cancelled
  status text not null check (status in ('waiting', 'booked', 'accepted', 'done', 'missed', 'cancelled')),
  -- null once the person deleted their account (the record stays, their identity does not)
  patient_id uuid references auth.users (id) on delete set null,
  patient_name text check (patient_name is null or length(btrim(patient_name)) between 1 and 80),
  pharmacist_id uuid references auth.users (id) on delete set null,
  -- the professional's identity as it was at the time: part of the legal record
  pharmacist_name text check (pharmacist_name is null or length(pharmacist_name) <= 80),
  pharmacist_license_no text check (pharmacist_license_no is null or length(pharmacist_license_no) <= 40),
  topic text not null check (topic in ('general', 'medicine_use', 'side_effects', 'product_choice', 'other')),
  product_id uuid references public.shop_products (id) on delete set null,
  product_name text check (product_name is null or length(product_name) <= 120),
  -- what the person typed: {"medicines": "...", "allergies": "..."}
  intake jsonb not null default '{}'::jsonb
    check (jsonb_typeof(intake) = 'object' and pg_column_size(intake) < 3000),
  shared_sections text[] not null default '{}' check (cardinality(shared_sections) <= 4),
  -- what the person agreed to share, frozen when asking
  snapshot jsonb check (snapshot is null or (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) < 100000)),
  consent_version text not null check (length(consent_version) between 1 and 40),
  consent_text_hash text not null check (length(consent_text_hash) = 64),
  consent_at timestamptz not null default now(),
  -- {"consult": true, "record": true, "share_profile": bool, "share_labs": bool, "share_history": bool}
  consent_items jsonb not null check (jsonb_typeof(consent_items) = 'object'),
  provider text not null check (provider in ('jitsi', 'jaas', 'custom')),
  room_name text not null unique check (length(room_name) between 16 and 80),
  access_key_hash text not null check (length(access_key_hash) = 64),
  scheduled_at timestamptz,
  slot_no smallint check (slot_no is null or slot_no between 1 and 20),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  end_reason text check (end_reason is null or end_reason in (
    'completed', 'timeout', 'sweep', 'patient_cancelled', 'no_show', 'pharmacist_ended'
  )),
  reminded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint consults_scheduled_shape check (
    (mode = 'scheduled') = (scheduled_at is not null) and (mode = 'scheduled') = (slot_no is not null)
  )
);
create index consults_patient_idx on public.consults (patient_id, created_at desc);
create index consults_pharmacist_idx on public.consults (pharmacist_id, created_at desc);
create index consults_queue_idx on public.consults (status, created_at);
create index consults_scheduled_idx on public.consults (scheduled_at) where mode = 'scheduled';
-- two people cannot hold the same slot number of the same time, a person cannot hold the same time twice
create unique index consults_slot_unique on public.consults (scheduled_at, slot_no)
  where mode = 'scheduled' and status in ('booked', 'accepted', 'done');
create unique index consults_patient_time_unique on public.consults (patient_id, scheduled_at)
  where mode = 'scheduled' and status in ('booked', 'accepted', 'done');
-- one live instant request per person; one call at a time per pharmacist
create unique index consults_one_instant_per_patient on public.consults (patient_id)
  where mode = 'instant' and status in ('waiting', 'accepted');
create unique index consults_one_call_per_pharmacist on public.consults (pharmacist_id)
  where status = 'accepted';
create trigger consults_set_updated_at
  before update on public.consults
  for each row execute function public.set_updated_at();

-- When the person's account goes the consult stays (a pharmacy record), but loses who they were.
create or replace function public.consults_scrub()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.patient_name := null;
  new.intake := '{}'::jsonb;
  new.snapshot := null;
  new.shared_sections := '{}';
  return new;
end;
$$;
create trigger consults_scrub_on_detach
  before update of patient_id on public.consults
  for each row
  when (old.patient_id is not null and new.patient_id is null)
  execute function public.consults_scrub();

alter table public.pharmacists
  add constraint pharmacists_active_consult_fk
  foreign key (active_consult_id) references public.consults (id) on delete set null;

-- The signed-in user's own client reads only the non-sensitive columns: never the snapshot, the
-- typed intake, the room name or the access key hash (server code reads those, and logs it).
alter table public.consults enable row level security;
revoke all on public.consults from anon, authenticated;
grant select (
  id, mode, status, patient_id, patient_name, pharmacist_id, pharmacist_name, pharmacist_license_no,
  topic, product_id, product_name, consent_version, consent_at, provider, scheduled_at, slot_no,
  created_at, accepted_at, ended_at, duration_sec, end_reason
) on public.consults to authenticated;
create policy consults_select on public.consults
  for select to authenticated
  using (
    patient_id = (select auth.uid())
    or pharmacist_id = (select auth.uid())
    or (
      public.i_can_serve_consults()
      and (status = 'waiting' or (status = 'booked' and scheduled_at < now() + interval '1 day'))
    )
  );

-- ── consult records (the pharmacist's service record) ───────────────────────
create table public.consult_records (
  id uuid primary key default gen_random_uuid(),
  consult_id uuid not null unique references public.consults (id) on delete cascade,
  patient_id uuid references auth.users (id) on delete set null,
  pharmacist_id uuid references auth.users (id) on delete set null,
  pharmacist_name text not null check (length(pharmacist_name) between 1 and 80),
  license_no text check (license_no is null or length(license_no) <= 40),
  -- date/time and length of the service
  service_at timestamptz not null,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  -- patient history as it was shared WITH CONSENT: a copy, not a live view
  patient_context jsonb not null default '{}'::jsonb
    check (jsonb_typeof(patient_context) = 'object' and pg_column_size(patient_context) < 120000),
  advice text not null default '' check (length(advice) <= 4000),
  refer_doctor boolean not null default false,
  -- products the PHARMACIST suggests: [{"product_id": uuid|null, "name": text, "note": text}]
  products jsonb not null default '[]'::jsonb
    check (jsonb_typeof(products) = 'array' and jsonb_array_length(products) <= 10),
  follow_up_on date,
  follow_up_note text check (follow_up_note is null or length(follow_up_note) <= 500),
  follow_up_outcome text check (follow_up_outcome is null or length(follow_up_outcome) <= 1000),
  follow_up_done_at timestamptz,
  -- what the person said when asked how it went
  follow_up_reply text check (follow_up_reply is null or length(follow_up_reply) <= 500),
  follow_up_reply_at timestamptz,
  follow_up_notified_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consult_records_patient_idx on public.consult_records (patient_id, service_at desc);
create index consult_records_followup_idx on public.consult_records (follow_up_on)
  where follow_up_on is not null and follow_up_notified_at is null;
create trigger consult_records_set_updated_at
  before update on public.consult_records
  for each row execute function public.set_updated_at();

-- A finalised record is the legal one: only the follow-up part may still move. When the person's
-- account goes, their copy of the context goes with it (the pharmacist's advice stays).
create or replace function public.consult_records_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_detaching boolean := old.patient_id is not null and new.patient_id is null;
begin
  if v_detaching then
    new.patient_context := '{}'::jsonb;
  end if;
  if old.finalized_at is not null then
    if (new.consult_id, new.pharmacist_name, new.license_no, new.service_at, new.duration_sec,
        new.advice, new.refer_doctor, new.products, new.follow_up_on, new.follow_up_note, new.finalized_at)
       is distinct from
       (old.consult_id, old.pharmacist_name, old.license_no, old.service_at, old.duration_sec,
        old.advice, old.refer_doctor, old.products, old.follow_up_on, old.follow_up_note, old.finalized_at)
       or (new.patient_context is distinct from old.patient_context and not v_detaching)
       or (new.patient_id is not null and new.patient_id is distinct from old.patient_id)
       or (new.pharmacist_id is not null and new.pharmacist_id is distinct from old.pharmacist_id)
    then
      raise exception 'a finalized consult record cannot be changed (violates record finality)'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger consult_records_guard
  before update on public.consult_records
  for each row execute function public.consult_records_guard();

alter table public.consult_records enable row level security;
revoke all on public.consult_records from anon, authenticated;
grant select on public.consult_records to authenticated;
-- the person sees the record once it is final; the pharmacist sees their own, drafts included
create policy consult_records_select on public.consult_records
  for select to authenticated
  using (
    (patient_id = (select auth.uid()) and finalized_at is not null)
    or pharmacist_id = (select auth.uid())
  );

-- ── access log (append-only) ────────────────────────────────────────────────
create table public.consult_access_log (
  id bigint generated always as identity primary key,
  -- no foreign key on purpose: the trail outlives the consult it describes
  consult_id uuid not null,
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('pharmacist', 'patient', 'admin', 'system')),
  patient_id uuid references auth.users (id) on delete set null,
  action text not null check (length(action) between 1 and 40),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  at timestamptz not null default now()
);
create index consult_access_log_consult_idx on public.consult_access_log (consult_id, at);
create index consult_access_log_patient_idx on public.consult_access_log (patient_id, at desc);

-- Nothing is ever edited or removed. The one thing allowed to touch a row is the database itself
-- blanking actor_id / patient_id when an account is deleted (the foreign keys' SET NULL).
create or replace function public.consult_access_log_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.id = new.id and old.consult_id = new.consult_id and old.action = new.action
     and old.actor_role = new.actor_role and old.at = new.at and old.meta = new.meta
     and (new.actor_id is null or new.actor_id = old.actor_id)
     and (new.patient_id is null or new.patient_id = old.patient_id)
  then
    return new;
  end if;
  raise exception 'the consult access log is append-only (violates the audit trail)'
    using errcode = 'check_violation';
end;
$$;
create trigger consult_access_log_no_edit
  before update or delete on public.consult_access_log
  for each row execute function public.consult_access_log_guard();
create trigger consult_access_log_no_truncate
  before truncate on public.consult_access_log
  for each statement execute function public.consult_access_log_guard();

alter table public.consult_access_log enable row level security;
revoke all on public.consult_access_log from anon, authenticated;
grant select on public.consult_access_log to authenticated;
create policy consult_access_log_select_own on public.consult_access_log
  for select to authenticated using (patient_id = (select auth.uid()));

-- One writer for the log: it looks the patient up itself, so a caller cannot misattribute a row.
create or replace function public.consult_log_access(
  p_consult uuid, p_actor uuid, p_role text, p_action text, p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.consult_access_log (consult_id, actor_id, actor_role, patient_id, action, meta)
    values (p_consult, p_actor, p_role,
            (select c.patient_id from public.consults c where c.id = p_consult),
            p_action, coalesce(p_meta, '{}'::jsonb));
end;
$$;
revoke all on function public.consult_log_access(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.consult_log_access(uuid, uuid, text, text, jsonb) to service_role;

-- ── the exact consent text people accepted (kept forever, never edited) ─────
-- A consult stores the version label and the hash of the text its person saw; this table keeps
-- the text behind each hash, so "what did they agree to?" can be answered after the admin
-- has changed the wording.
create table public.telepharmacy_consent_texts (
  text_hash text primary key check (length(text_hash) = 64),
  version text not null check (length(version) between 1 and 40),
  lang text not null check (lang in ('th', 'en')),
  body text not null check (length(body) between 1 and 6000),
  created_at timestamptz not null default now()
);
create or replace function public.telepharmacy_consent_texts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'consent texts are never edited or removed (violates the audit trail)'
    using errcode = 'check_violation';
end;
$$;
create trigger telepharmacy_consent_texts_no_edit
  before update or delete on public.telepharmacy_consent_texts
  for each row execute function public.telepharmacy_consent_texts_guard();
alter table public.telepharmacy_consent_texts enable row level security;
revoke all on public.telepharmacy_consent_texts from anon, authenticated;

-- ── opening hours and availability (decided here, from the heartbeat) ───────
create or replace function public.telepharmacy_in_hours(p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select extract(dow from (p_at at time zone 'Asia/Bangkok'))::smallint = any (s.open_days)
       and (p_at at time zone 'Asia/Bangkok')::time >= s.open_from
       and (p_at at time zone 'Asia/Bangkok')::time < s.open_to
      from public.telepharmacy_settings s where s.id
  ), false);
$$;
revoke all on function public.telepharmacy_in_hours(timestamptz) from public, anon, authenticated;
grant execute on function public.telepharmacy_in_hours(timestamptz) to service_role;

-- How many pharmacists could take a call right now: online, seen in the last 120 seconds,
-- not in a call, licence verified (and identity verified when required).
create or replace function public.consult_available_count(p_now timestamptz default now())
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.pharmacists p
   where p.online
     and p.last_seen > p_now - interval '120 seconds'
     and p.active_consult_id is null
     and public.pharmacist_can_serve(p.user_id);
$$;
revoke all on function public.consult_available_count(timestamptz) from public, anon, authenticated;
grant execute on function public.consult_available_count(timestamptz) to service_role;

-- Switch on/off and heartbeat. 'ok' | 'not_pharmacist' | 'license' | 'kyc'
create or replace function public.pharmacist_set_presence(p_user uuid, p_online boolean, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.pharmacists%rowtype;
  v_kyc boolean;
begin
  select * into v from public.pharmacists where user_id = p_user for update;
  if not found then
    return 'not_pharmacist';
  end if;
  if p_online then
    if not v.license_verified then
      return 'license';
    end if;
    select s.require_kyc_for_pharmacist into v_kyc from public.telepharmacy_settings s where s.id;
    if coalesce(v_kyc, true) and not public.is_kyc_verified(p_user) then
      return 'kyc';
    end if;
  end if;
  update public.pharmacists set online = p_online, last_seen = p_now where user_id = p_user;
  return 'ok';
end;
$$;
revoke all on function public.pharmacist_set_presence(uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.pharmacist_set_presence(uuid, boolean, timestamptz) to service_role;

-- Switches, opt-in to e-KYC. Returns the reason a request must be refused, or null.
create or replace function public.telepharmacy_gate(p_patient uuid, p_mode text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.telepharmacy_settings%rowtype;
begin
  select * into s from public.telepharmacy_settings where id;
  if not found or not s.enabled then
    return 'off';
  end if;
  if (p_mode = 'instant' and not s.instant_enabled) or (p_mode = 'scheduled' and not s.scheduled_enabled) then
    return 'off';
  end if;
  if s.require_kyc_for_consult and not public.is_kyc_verified(p_patient) then
    return 'kyc';
  end if;
  return null;
end;
$$;
revoke all on function public.telepharmacy_gate(uuid, text) from public, anon, authenticated;

-- ── mode B: ask to talk now ─────────────────────────────────────────────────
-- reason: off | kyc | closed | busy_user | queue_full | none_available
create or replace function public.request_instant_consult(
  p_patient uuid, p_patient_name text, p_topic text, p_product uuid, p_product_name text,
  p_intake jsonb, p_shared text[], p_snapshot jsonb,
  p_consent_version text, p_consent_hash text, p_consent_items jsonb,
  p_room text, p_key_hash text, p_provider text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.telepharmacy_settings%rowtype;
  v_reason text;
  v_id uuid := gen_random_uuid();
begin
  v_reason := public.telepharmacy_gate(p_patient, 'instant');
  if v_reason is not null then
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;
  select * into s from public.telepharmacy_settings where id;
  -- instant requests are rare: one at a time keeps "queue size vs. free pharmacists" exact
  perform pg_advisory_xact_lock(hashtext('consult-instant'));
  if not public.telepharmacy_in_hours(p_now) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if exists (select 1 from public.consults where patient_id = p_patient and mode = 'instant' and status in ('waiting', 'accepted')) then
    return jsonb_build_object('ok', false, 'reason', 'busy_user');
  end if;
  if (select count(*) from public.consults where mode = 'instant' and status = 'waiting') >= s.max_waiting then
    return jsonb_build_object('ok', false, 'reason', 'queue_full');
  end if;
  if public.consult_available_count(p_now) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'none_available');
  end if;
  insert into public.consults (
    id, mode, status, patient_id, patient_name, topic, product_id, product_name, intake, shared_sections,
    snapshot, consent_version, consent_text_hash, consent_at, consent_items, provider, room_name, access_key_hash, created_at
  ) values (
    v_id, 'instant', 'waiting', p_patient, p_patient_name, p_topic, p_product, p_product_name, coalesce(p_intake, '{}'::jsonb),
    coalesce(p_shared, '{}'), p_snapshot, p_consent_version, p_consent_hash, p_now, p_consent_items, p_provider, p_room, p_key_hash, p_now
  );
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'busy_user');
end;
$$;
revoke all on function public.request_instant_consult(uuid, text, text, uuid, text, jsonb, text[], jsonb, text, text, jsonb, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.request_instant_consult(uuid, text, text, uuid, text, jsonb, text[], jsonb, text, text, jsonb, text, text, text, timestamptz) to service_role;

-- ── mode A: book a slot ─────────────────────────────────────────────────────
-- reason: off | kyc | closed | bad_slot | too_soon | too_far | too_many | taken
create or replace function public.book_consult_slot(
  p_patient uuid, p_patient_name text, p_at timestamptz, p_topic text, p_product uuid, p_product_name text,
  p_intake jsonb, p_shared text[], p_snapshot jsonb,
  p_consent_version text, p_consent_hash text, p_consent_items jsonb,
  p_room text, p_key_hash text, p_provider text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.telepharmacy_settings%rowtype;
  v_reason text;
  v_local timestamp;
  v_min integer;
  v_open integer;
  v_close integer;
  v_slot integer := null;
  v_n integer;
  v_id uuid := gen_random_uuid();
begin
  v_reason := public.telepharmacy_gate(p_patient, 'scheduled');
  if v_reason is not null then
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;
  select * into s from public.telepharmacy_settings where id;

  v_local := p_at at time zone 'Asia/Bangkok';
  v_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_open := extract(hour from s.open_from)::integer * 60 + extract(minute from s.open_from)::integer;
  v_close := extract(hour from s.open_to)::integer * 60 + extract(minute from s.open_to)::integer;
  if not (extract(dow from v_local)::smallint = any (s.open_days)) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if extract(second from v_local) <> 0 or v_min < v_open or v_min + s.slot_minutes > v_close
     or (v_min - v_open) % s.slot_minutes <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_slot');
  end if;
  if p_at < p_now + make_interval(mins => s.booking_min_lead_minutes) then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  if p_at > p_now + make_interval(days => s.booking_days_ahead) then
    return jsonb_build_object('ok', false, 'reason', 'too_far');
  end if;

  -- everyone asking for THIS slot waits their turn, so the count below cannot go stale
  perform pg_advisory_xact_lock(hashtext('consult-slot:' || extract(epoch from p_at)::text));
  select count(*) into v_n from public.consults
   where patient_id = p_patient and mode = 'scheduled' and status = 'booked';
  if v_n >= s.max_active_bookings then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  for v_n in 1..s.slot_capacity loop
    if not exists (
      select 1 from public.consults
       where mode = 'scheduled' and scheduled_at = p_at and slot_no = v_n and status in ('booked', 'accepted', 'done')
    ) then
      v_slot := v_n;
      exit;
    end if;
  end loop;
  if v_slot is null then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;

  insert into public.consults (
    id, mode, status, patient_id, patient_name, topic, product_id, product_name, intake, shared_sections,
    snapshot, consent_version, consent_text_hash, consent_at, consent_items, provider, room_name, access_key_hash,
    scheduled_at, slot_no, created_at
  ) values (
    v_id, 'scheduled', 'booked', p_patient, p_patient_name, p_topic, p_product, p_product_name, coalesce(p_intake, '{}'::jsonb),
    coalesce(p_shared, '{}'), p_snapshot, p_consent_version, p_consent_hash, p_now, p_consent_items, p_provider, p_room, p_key_hash,
    p_at, v_slot, p_now
  );
  return jsonb_build_object('ok', true, 'id', v_id, 'slot_no', v_slot);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'taken');
end;
$$;
revoke all on function public.book_consult_slot(uuid, text, timestamptz, text, uuid, text, jsonb, text[], jsonb, text, text, jsonb, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.book_consult_slot(uuid, text, timestamptz, text, uuid, text, jsonb, text[], jsonb, text, text, jsonb, text, text, text, timestamptz) to service_role;

-- ── a pharmacist takes a call (atomic) ──────────────────────────────────────
-- reason: not_pharmacist | not_allowed | busy | not_found | taken | too_early | expired
create or replace function public.claim_consult(p_pharmacist uuid, p_consult uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pharmacists%rowtype;
  c public.consults%rowtype;
  s public.telepharmacy_settings%rowtype;
begin
  select * into p from public.pharmacists where user_id = p_pharmacist for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_pharmacist');
  end if;
  if not public.pharmacist_can_serve(p_pharmacist) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if p.active_consult_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  select * into c from public.consults where id = p_consult for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if c.status not in ('waiting', 'booked') then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  if c.mode = 'scheduled' then
    select * into s from public.telepharmacy_settings where id;
    if p_now < c.scheduled_at - interval '15 minutes' then
      return jsonb_build_object('ok', false, 'reason', 'too_early');
    end if;
    if p_now > c.scheduled_at + make_interval(mins => s.slot_minutes + 30) then
      return jsonb_build_object('ok', false, 'reason', 'expired');
    end if;
  end if;
  update public.consults
     set status = 'accepted', accepted_at = p_now, pharmacist_id = p_pharmacist,
         pharmacist_name = p.display_name, pharmacist_license_no = p.license_no
   where id = p_consult;
  update public.pharmacists set active_consult_id = p_consult where user_id = p_pharmacist;
  return jsonb_build_object('ok', true, 'id', p_consult);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'busy');
end;
$$;
revoke all on function public.claim_consult(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_consult(uuid, uuid, timestamptz) to service_role;

-- The pharmacist ends the call. 'ok' | 'not_found' | 'forbidden' | 'state'
create or replace function public.end_consult(p_actor uuid, p_consult uuid, p_reason text, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.consults%rowtype;
begin
  select * into c from public.consults where id = p_consult for update;
  if not found then
    return 'not_found';
  end if;
  if c.pharmacist_id is distinct from p_actor then
    return 'forbidden';
  end if;
  if c.status <> 'accepted' then
    return 'state';
  end if;
  update public.consults
     set status = 'done', ended_at = p_now, duration_sec = greatest(extract(epoch from (p_now - c.accepted_at))::integer, 0),
         end_reason = case when p_reason in ('completed', 'pharmacist_ended') then p_reason else 'completed' end
   where id = p_consult;
  update public.pharmacists set active_consult_id = null where user_id = p_actor and active_consult_id = p_consult;
  return 'ok';
end;
$$;
revoke all on function public.end_consult(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.end_consult(uuid, uuid, text, timestamptz) to service_role;

-- The customer withdraws before it starts. 'ok' | 'not_found' | 'state'
create or replace function public.cancel_consult(p_patient uuid, p_consult uuid, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.consults%rowtype;
begin
  select * into c from public.consults where id = p_consult and patient_id = p_patient for update;
  if not found then
    return 'not_found';
  end if;
  if c.status not in ('waiting', 'booked') then
    return 'state';
  end if;
  update public.consults set status = 'cancelled', ended_at = p_now, end_reason = 'patient_cancelled' where id = p_consult;
  return 'ok';
end;
$$;
revoke all on function public.cancel_consult(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.cancel_consult(uuid, uuid, timestamptz) to service_role;

-- ── the sweep: runs from the scheduled tick AND whenever the queue is read ──
-- Returns the consults it just gave up on, so the caller can tell the customers.
create or replace function public.sweep_consults(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.telepharmacy_settings%rowtype;
  v_missed jsonb := '[]'::jsonb;
  v_part jsonb;
  v_ended integer := 0;
  v_off integer := 0;
begin
  select * into s from public.telepharmacy_settings where id;
  if not found then
    return jsonb_build_object('missed', v_missed, 'ended', 0, 'offline', 0);
  end if;

  -- nobody picked up in time
  with m as (
    update public.consults
       set status = 'missed', ended_at = p_now, end_reason = 'timeout'
     where mode = 'instant' and status = 'waiting'
       and created_at < p_now - make_interval(secs => s.wait_timeout_sec)
    returning id, patient_id, mode
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'patient_id', patient_id, 'mode', mode)), '[]'::jsonb) into v_part from m;
  v_missed := v_missed || v_part;

  -- a booked time nobody started
  with m as (
    update public.consults
       set status = 'missed', ended_at = p_now, end_reason = 'no_show'
     where mode = 'scheduled' and status = 'booked'
       and scheduled_at + make_interval(mins => s.slot_minutes + 30) < p_now
    returning id, patient_id, mode
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'patient_id', patient_id, 'mode', mode)), '[]'::jsonb) into v_part from m;
  v_missed := v_missed || v_part;

  -- a call that ran far past its limit is closed
  with e as (
    update public.consults
       set status = 'done', ended_at = p_now, end_reason = 'sweep',
           duration_sec = greatest(extract(epoch from (p_now - accepted_at))::integer, 0)
     where status = 'accepted' and accepted_at < p_now - make_interval(mins => s.max_call_minutes + 5)
    returning id
  )
  select count(*)::integer into v_ended from e;

  -- a pharmacist who stopped sending heartbeats is not "online"
  with o as (
    update public.pharmacists set online = false
     where online and (last_seen is null or last_seen < p_now - interval '120 seconds')
    returning user_id
  )
  select count(*)::integer into v_off from o;

  -- a "busy" mark that no longer points at a running call is cleared
  update public.pharmacists p set active_consult_id = null
   where p.active_consult_id is not null
     and not exists (select 1 from public.consults c where c.id = p.active_consult_id and c.status = 'accepted');

  return jsonb_build_object('missed', v_missed, 'ended', v_ended, 'offline', v_off);
end;
$$;
revoke all on function public.sweep_consults(timestamptz) from public, anon, authenticated;
grant execute on function public.sweep_consults(timestamptz) to service_role;

-- ── admin: pharmacists and their licences (all audited) ─────────────────────
-- 'ok' | 'forbidden' | 'not_found' (no such account) | 'already'
create or replace function public.admin_add_pharmacist(p_actor uuid, p_email text, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_name text;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  v_target := public.user_id_by_email(p_email);
  if v_target is null then
    return 'not_found';
  end if;
  v_name := coalesce(
    nullif(btrim(p_name), ''),
    (select nullif(btrim(pr.display_name), '') from public.profiles pr where pr.id = v_target),
    split_part(btrim(p_email), '@', 1)
  );
  insert into public.pharmacists (user_id, display_name) values (v_target, left(v_name, 80)) on conflict do nothing;
  if not found then
    return 'already';
  end if;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (v_target, 'pharmacist_added', null, jsonb_build_object('by', p_actor));
  return 'ok';
end;
$$;
revoke all on function public.admin_add_pharmacist(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_add_pharmacist(uuid, text, text) to service_role;

-- 'ok' | 'forbidden' | 'not_found' | 'busy' (in a call)
create or replace function public.admin_remove_pharmacist(p_actor uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pharmacists%rowtype;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  select * into p from public.pharmacists where user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  if p.active_consult_id is not null then
    return 'busy';
  end if;
  delete from public.pharmacists where user_id = p_user;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (p_user, 'pharmacist_removed', null, jsonb_build_object('by', p_actor));
  return 'ok';
end;
$$;
revoke all on function public.admin_remove_pharmacist(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_pharmacist(uuid, uuid) to service_role;

-- The ONLY way a licence becomes (or stops being) verified. 'ok' | 'forbidden' | 'not_found' | 'no_license'
create or replace function public.admin_set_license_verified(p_actor uuid, p_user uuid, p_verified boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pharmacists%rowtype;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  select * into p from public.pharmacists where user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  if p_verified and (p.license_no is null or btrim(p.license_no) = '') then
    return 'no_license';
  end if;
  update public.pharmacists
     set license_verified = p_verified,
         license_verified_at = case when p_verified then now() end,
         license_verified_by = case when p_verified then p_actor end,
         online = case when p_verified then online else false end
   where user_id = p_user;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (p_user, case when p_verified then 'pharmacist_license_verified' else 'pharmacist_license_unverified' end, null,
            jsonb_build_object('by', p_actor));
  return 'ok';
end;
$$;
revoke all on function public.admin_set_license_verified(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_license_verified(uuid, uuid, boolean) to service_role;

-- ── retention: an admin may purge what is older than the retention period ───
-- Never automatic: pharmacy records can be required by law, so a human decides and the act is logged.
-- Returns how many consults were deleted (their records go with them); the access log stays.
create or replace function public.admin_purge_consults(p_actor uuid, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_n integer;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return -1;
  end if;
  select retention_days into v_days from public.telepharmacy_settings where id;
  delete from public.consults
   where status in ('done', 'missed', 'cancelled')
     and coalesce(ended_at, created_at) < p_now - make_interval(days => v_days);
  get diagnostics v_n = row_count;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (null, 'consults_purged', null, jsonb_build_object('by', p_actor, 'count', v_n, 'retention_days', v_days));
  return v_n;
end;
$$;
revoke all on function public.admin_purge_consults(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_purge_consults(uuid, timestamptz) to service_role;

-- ── scheduled work: shown on the admin "rules" page, switchable ─────────────
insert into public.automation_rules (key, title, description, enabled, params, sort_order) values
  ('consult_sweep', 'ปิดสายปรึกษาเภสัชกรที่ค้าง', 'สายที่รอเกินเวลา การนัดที่ไม่มีใครเริ่ม และสายที่คุยเกินเวลาสูงสุด จะถูกปิดอัตโนมัติ (ระบบยังตรวจซ้ำทุกครั้งที่เปิดคิว)', true, '{}', 18),
  ('consult_reminders', 'เตือนนัดปรึกษาเภสัชกรและการติดตามการใช้ยา', 'เตือนผู้ใช้ก่อนนัดปรึกษา และเมื่อถึงวันติดตามผลที่เภสัชกรกำหนด (ข้อความไม่ใส่รายละเอียดสุขภาพ) · ตั้งจำนวนนาทีก่อนนัดได้', true, '{"minutes_before": 60}', 19)
on conflict do nothing;
