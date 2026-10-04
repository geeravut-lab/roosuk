-- Phase 2 / Health Vault: documents the person uploads themselves (a doctor's
-- note, a prescription photo, a vaccination card…) next to the files kept from
-- scans. They use the same sealed storage and the same table; a vault document
-- has no scan behind it, so it carries its own title, category and (optional)
-- document date. How many a person may keep is the plan's `vaultMaxFiles`,
-- enforced by the server (and only direct uploads count).

alter table public.source_files drop constraint source_files_kind_check;
alter table public.source_files
  add constraint source_files_kind_check check (kind in ('lab', 'food', 'body', 'doc'));

alter table public.source_files
  add column title text check (title is null or length(btrim(title)) between 1 and 80),
  add column category text check (category is null or category in ('lab_paper', 'prescription', 'doctor_note', 'vaccine', 'imaging', 'other')),
  add column doc_date date;

alter table public.source_files
  add constraint source_files_doc_has_meta check (kind <> 'doc' or (title is not null and category is not null)),
  add constraint source_files_meta_only_docs check (kind = 'doc' or (title is null and category is null and doc_date is null));
