-- Phase 1 / Lab Scan: reports (draft → confirmed) and the per-marker results
-- that trends are built from. The uploaded file is read in memory and NOT
-- stored. Written only by the server (service role): the status of each value is
-- decided by code from our reference table, so users read and delete their own
-- rows but never write them.

create table public.lab_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  collected_on date,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  model text check (model is null or length(model) <= 100),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint lab_reports_confirmed_complete check (status <> 'confirmed' or (confirmed_at is not null and collected_on is not null))
);

create index lab_reports_user_idx on public.lab_reports (user_id, collected_on desc, created_at desc);

alter table public.lab_reports enable row level security;
revoke all on public.lab_reports from anon, authenticated;
grant select, delete on public.lab_reports to authenticated;

create policy lab_reports_select_own on public.lab_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy lab_reports_delete_own on public.lab_reports
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- One row per confirmed value. marker_key is null for tests outside our table
-- (kept for the user's record, never judged).
create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid not null references public.lab_reports (id) on delete cascade,
  marker_key text check (marker_key is null or length(btrim(marker_key)) between 1 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  value numeric not null,
  unit text not null default '' check (length(unit) <= 30),
  -- the value converted to the marker's catalog unit; null = could not convert
  value_std numeric,
  status text not null check (status in ('normal', 'watch', 'abnormal', 'unknown')),
  collected_on date not null,
  created_at timestamptz not null default now()
);

create index lab_results_trend_idx on public.lab_results (user_id, marker_key, collected_on desc);
create index lab_results_report_idx on public.lab_results (report_id);

alter table public.lab_results enable row level security;
revoke all on public.lab_results from anon, authenticated;
grant select, delete on public.lab_results to authenticated;

create policy lab_results_select_own on public.lab_results
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy lab_results_delete_own on public.lab_results
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── confirm_lab_report: the user's reviewed values become results, atomically ──
-- One transaction: only a DRAFT of this user can be confirmed (a second call
-- returns 0 and changes nothing), the report is finalised and one lab_results
-- row per item is written. If any item violates a constraint the whole thing —
-- including the report's status change — rolls back. The server recomputes each
-- item's status before calling this; the function stores what it is given.
create or replace function public.confirm_lab_report(
  p_report uuid,
  p_user uuid,
  p_collected_on date,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 60 then
    raise exception 'items must be an array of 1 to 60';
  end if;

  update public.lab_reports
     set status = 'confirmed', collected_on = p_collected_on, items = p_items, confirmed_at = now()
   where id = p_report and user_id = p_user and status = 'draft';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return 0;
  end if;

  insert into public.lab_results (user_id, report_id, marker_key, name, value, unit, value_std, status, collected_on)
  select p_user, p_report, nullif(i.marker_key, ''), i.name, i.value, coalesce(i.unit, ''), i.value_std, i.status, p_collected_on
    from jsonb_to_recordset(p_items) as i(marker_key text, name text, value numeric, unit text, value_std numeric, status text);

  return jsonb_array_length(p_items);
end;
$$;

revoke all on function public.confirm_lab_report(uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_lab_report(uuid, uuid, date, jsonb) to service_role;
