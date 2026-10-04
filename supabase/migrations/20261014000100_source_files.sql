-- Phase 1 / kept source files: the photo or PDF a scan was read from, kept ONLY
-- when the user chose to keep it for that scan. The bytes live in the private
-- Storage bucket `user-sources`, encrypted by the app before upload (see
-- src/lib/files/crypto.ts), so this table holds just metadata: whose file it
-- is, what it is, and where the sealed object sits. Written by the server only
-- (service role); users read their own rows, and delete through a server
-- action that also removes the object.

create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('lab', 'food')),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  -- size of the original (before sealing)
  bytes integer not null check (bytes between 1 and 6291456),
  object_path text not null unique check (length(object_path) between 10 and 200),
  created_at timestamptz not null default now()
);

create index source_files_user_idx on public.source_files (user_id, created_at desc);

alter table public.source_files enable row level security;
revoke all on public.source_files from anon, authenticated;
grant select on public.source_files to authenticated;

create policy source_files_select_own on public.source_files
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The report / meal points at its file. Deleting the file row just clears the
-- pointer; deleting the report leaves the file row for the orphan sweep (the
-- app removes the object right away and the sweep catches what it missed).
alter table public.lab_reports
  add column source_file_id uuid references public.source_files (id) on delete set null;
alter table public.meal_logs
  add column source_file_id uuid references public.source_files (id) on delete set null;

create index lab_reports_source_file_idx on public.lab_reports (source_file_id) where source_file_id is not null;
create index meal_logs_source_file_idx on public.meal_logs (source_file_id) where source_file_id is not null;
