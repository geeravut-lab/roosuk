-- ⚠ DESTRUCTIVE — run manually in the Supabase SQL editor, ONLY as part of the
-- pre-launch checklist (docs/SETUP-GUIDE.md §C), never after real users exist.
--
-- Removes every user and everything that belongs to them, keeps
-- platform_settings (prices, flags, links). Re-grant yourself admin afterwards
-- with `node scripts/grant-admin.mjs <email>`.
--
-- Storage buckets are NOT cleared by SQL — empty them in Storage → each bucket.

begin;

truncate table public.privacy_audit_log restart identity;

-- Cascades to profiles, admins, consent_records, line_links and every
-- user-owned table added by later migrations (all reference auth.users).
delete from auth.users;

commit;
