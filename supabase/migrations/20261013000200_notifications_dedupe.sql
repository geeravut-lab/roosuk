-- The inbox needs the same "once per event" guard as the LINE queue: without it a
-- reminder rule that runs every 10 minutes wrote a new inbox row every time even
-- though the queue (correctly) refused the duplicate. Found by the live E2E test.
alter table public.app_notifications
  add column dedupe_key text check (dedupe_key is null or length(btrim(dedupe_key)) between 1 and 120);

create unique index app_notifications_dedupe_idx
  on public.app_notifications (user_id, dedupe_key) where dedupe_key is not null;
