-- Phase 1 / lab tests the app does not know yet.
--
-- 1. lab_unknown_markers: a COUNTER of the test names that scans could not match
--    to the reference table — the name as printed, a sample unit, how many
--    confirmed reports had it. No values, no user, no report id: it tells the
--    admin which tests are worth adding, nothing about any person.
-- 2. biomarker_extras: reference ranges an admin/doctor adds without a deploy.
--    A row is DRAFT until someone approves it (recording who and when); only
--    APPROVED rows are ever used to judge a value. Nothing is learned
--    automatically: a range that nobody signed off is never applied.
-- Both are written and read by the server (service role) only.

create table public.lab_unknown_markers (
  normalized_name text primary key check (length(normalized_name) between 1 and 120),
  display_name text not null check (length(display_name) between 1 and 120),
  unit_sample text not null default '' check (length(unit_sample) <= 30),
  times_seen integer not null default 1 check (times_seen >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'resolved', 'ignored')),
  resolved_key text check (resolved_key is null or length(resolved_key) <= 40)
);

create index lab_unknown_markers_queue_idx on public.lab_unknown_markers (status, times_seen desc);

alter table public.lab_unknown_markers enable row level security;
revoke all on public.lab_unknown_markers from anon, authenticated;

-- Count the names a just-confirmed report could not match. One increment per name per report.
create or replace function public.record_unknown_markers(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_name text;
  v_norm text;
  v_unit text;
  v_n integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;
  for e in select * from jsonb_array_elements(p_items) loop
    v_name := left(btrim(coalesce(e ->> 'name', '')), 120);
    v_norm := lower(regexp_replace(v_name, '\s+', ' ', 'g'));
    v_unit := left(btrim(coalesce(e ->> 'unit', '')), 30);
    continue when v_norm = '';
    insert into public.lab_unknown_markers (normalized_name, display_name, unit_sample)
    values (v_norm, v_name, v_unit)
    on conflict (normalized_name) do update
      set times_seen = public.lab_unknown_markers.times_seen + 1,
          last_seen_at = now(),
          unit_sample = case when public.lab_unknown_markers.unit_sample = '' then excluded.unit_sample
                             else public.lab_unknown_markers.unit_sample end;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.record_unknown_markers(jsonb) from public, anon, authenticated;
grant execute on function public.record_unknown_markers(jsonb) to service_role;

create table public.biomarker_extras (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  th text not null check (length(btrim(th)) between 1 and 120),
  en text not null check (length(btrim(en)) between 1 and 120),
  unit text not null check (length(btrim(unit)) between 1 and 20),
  -- null bound = open on that side; `watch` is the wider band around `normal`
  normal_lo numeric,
  normal_hi numeric,
  watch_lo numeric,
  watch_hi numeric,
  aliases text[] not null check (cardinality(aliases) between 1 and 20),
  -- [{"unit":"mmol/L","factor":18.016}] — other units a report may use, converted to `unit`
  conversions jsonb not null default '[]' check (jsonb_typeof(conversions) = 'array' and jsonb_array_length(conversions) <= 10),
  -- where the range comes from (a guideline, the lab's own sheet…): required, so it can be audited
  source_note text not null check (length(btrim(source_note)) between 3 and 300),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint biomarker_extras_has_bound check (normal_lo is not null or normal_hi is not null),
  constraint biomarker_extras_normal_order check (normal_lo is null or normal_hi is null or normal_lo < normal_hi),
  constraint biomarker_extras_watch_wider check (
    (watch_lo is null or normal_lo is null or watch_lo <= normal_lo)
    and (watch_hi is null or normal_hi is null or watch_hi >= normal_hi)
  ),
  constraint biomarker_extras_approved_stamp check (status <> 'approved' or approved_at is not null)
);

alter table public.biomarker_extras enable row level security;
revoke all on public.biomarker_extras from anon, authenticated;
