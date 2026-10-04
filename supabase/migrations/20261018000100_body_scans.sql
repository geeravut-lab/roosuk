-- Phase 1 / body scan: a rough, opt-in estimate of weight and BMI from a
-- full-body photo plus the person's height, with optional face and palm photos
-- read only for fixed, non-diagnostic visual observations.
--
-- This is deliberately NOT part of the daily habit loop: nothing here feeds the
-- health score, the streak or any gamification (those reward consistency, never
-- body shape), and there are no targets. The AI returns only numbers and fixed
-- categories; BMI, its band and every sentence the user sees are decided by code.
-- Written by the server only (service role); users read and delete their own rows.

create table public.body_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  height_cm numeric(4, 1) not null check (height_cm between 120 and 230),
  -- the weight the person typed (a scale beats a photo); null when they did not
  weight_kg numeric(4, 1) check (weight_kg is null or weight_kg between 30 and 250),
  -- the AI's rough range from the photo; null when it could not give a usable one
  est_weight_low numeric(4, 1) check (est_weight_low is null or est_weight_low between 30 and 250),
  est_weight_high numeric(4, 1) check (est_weight_high is null or est_weight_high between 30 and 250),
  -- BMI is one number from a typed weight, a range from an estimate; the band is decided by code
  bmi_low numeric(3, 1) not null check (bmi_low between 10 and 70),
  bmi_high numeric(3, 1) not null check (bmi_high between 10 and 70),
  bmi_band text not null check (bmi_band in ('low', 'healthy', 'above', 'high', 'very_high')),
  bmi_basis text not null check (bmi_basis in ('measured', 'estimated')),
  confidence numeric(2, 1) not null default 0 check (confidence between 0 and 1),
  -- fixed visual observations, never a diagnosis: where they cannot be judged they say so
  face_note text not null default 'not_provided' check (face_note in ('not_provided', 'none', 'possible', 'unclear')),
  palm_note text not null default 'not_provided' check (palm_note in ('not_provided', 'none', 'possible', 'unclear')),
  source_file_id uuid references public.source_files (id) on delete set null,
  model text check (model is null or length(model) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_scans_bmi_order check (bmi_low <= bmi_high),
  constraint body_scans_est_order check (est_weight_low is null or est_weight_high is null or est_weight_low <= est_weight_high)
);

create index body_scans_user_idx on public.body_scans (user_id, created_at desc);
create index body_scans_source_file_idx on public.body_scans (source_file_id) where source_file_id is not null;

alter table public.body_scans enable row level security;
revoke all on public.body_scans from anon, authenticated;
grant select, delete on public.body_scans to authenticated;

create policy body_scans_select_own on public.body_scans
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy body_scans_delete_own on public.body_scans
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- A kept body photo is a source file like the others.
alter table public.source_files drop constraint source_files_kind_check;
alter table public.source_files
  add constraint source_files_kind_check check (kind in ('lab', 'food', 'body'));
