-- Phase 1 / notifications (docs/06-automation-rules.md, docs/07-line-notifications.md).
--
--  app_notifications   the in-app inbox (bell + page). Users read it and mark
--                      their own rows read; everything else is server-written.
--  notification_queue  messages waiting to go out on LINE. A user action only
--                      WRITES here; a scheduled tick sends (never push inside a
--                      user's request). Service-role only; the text is COPIED
--                      from the notice so it survives clean-ups of the inbox.
--  notification_prefs  each user's own LINE switches (RLS: own row).
--  notification_settings  the LINE monthly cap and the "halted" flag (service).
--  automation_rules    which rule runs and its numbers, editable by an admin
--                      without a deploy; the CONDITIONS stay in code.
--  cron_ticks          what each scheduled run did (summary per rule).

-- ── app_notifications ──────────────────────────────────────────────────────
create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- free text on purpose: a CHECK over a list that keeps growing silently rejects new kinds (docs/07)
  kind text not null check (length(btrim(kind)) between 1 and 60),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 2000),
  href text check (href is null or (href like '/%' and href not like '//%' and length(href) <= 300)),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index app_notifications_user_idx on public.app_notifications (user_id, created_at desc);
create index app_notifications_unread_idx on public.app_notifications (user_id) where read_at is null;

alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from anon, authenticated;
grant select, delete on public.app_notifications to authenticated;
grant update (read_at) on public.app_notifications to authenticated;

create policy app_notifications_select_own on public.app_notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy app_notifications_update_own on public.app_notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy app_notifications_delete_own on public.app_notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── notification_queue ─────────────────────────────────────────────────────
create table public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_id uuid references public.app_notifications (id) on delete set null,
  -- one reminder per user per day etc.: the same key can be queued only once per user
  dedupe_key text check (dedupe_key is null or length(btrim(dedupe_key)) between 1 and 120),
  channel text not null default 'line' check (channel in ('line')),
  -- results the user is waiting for (a payment) may use the reserved allowance; reminders may not
  urgent boolean not null default false,
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 2000),
  href text check (href is null or (href like '/%' and href not like '//%' and length(href) <= 300)),
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'blocked', 'failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 300),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index notification_queue_dedupe_idx on public.notification_queue (user_id, dedupe_key) where dedupe_key is not null;
create index notification_queue_due_idx on public.notification_queue (created_at) where status = 'queued';
create index notification_queue_sent_idx on public.notification_queue (sent_at) where status = 'sent';

alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

-- ── notification_prefs ─────────────────────────────────────────────────────
-- Service messages (a payment result, a plan about to end) default ON once LINE
-- is linked; habit reminders default OFF — they are opt-in.
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  line_transactional boolean not null default true,
  line_reminders boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select, delete on public.notification_prefs to authenticated;
grant insert (user_id, line_transactional, line_reminders) on public.notification_prefs to authenticated;
grant update (line_transactional, line_reminders) on public.notification_prefs to authenticated;

create policy notification_prefs_select_own on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_prefs_insert_own on public.notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_prefs_update_own on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_prefs_delete_own on public.notification_prefs
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── notification_settings (one row) ────────────────────────────────────────
-- LINE's own monthly message allowance is small on the free plan; the cap here is
-- OUR guard so the system never goes silent for the rest of the month.
create table public.notification_settings (
  id boolean primary key default true check (id),
  line_monthly_cap integer not null default 200 check (line_monthly_cap >= 0),
  -- held back for time-critical messages (payment results) when the cap nears
  line_reserve integer not null default 20 check (line_reserve >= 0),
  halted_until timestamptz,
  halted_reason text check (halted_reason is null or length(halted_reason) <= 200),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.notification_settings (id) values (true) on conflict do nothing;
alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;

-- ── automation_rules ───────────────────────────────────────────────────────
create table public.automation_rules (
  key text primary key check (length(btrim(key)) between 1 and 60),
  title text not null,
  description text not null default '',
  enabled boolean not null default true,
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  sort_order integer not null default 100,
  last_run_at timestamptz,
  last_count integer,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Seeds are DEFAULTS: ON CONFLICT DO NOTHING so a redeploy never overwrites what an admin tuned.
insert into public.automation_rules (key, title, description, enabled, params, sort_order) values
  ('checkin_reminder', 'เตือนเช็กอินรายวัน', 'ส่ง LINE ถึงผู้ที่เปิดรับการเตือนและยังไม่ได้เช็กอินวันนี้ หลังเวลาที่ตั้งไว้ (ชั่วโมงเวลาไทย)', true, '{"hour": 19, "min_streak": 3}', 10),
  ('trial_ending', 'เตือนทดลองใช้ใกล้หมด', 'แจ้งผู้ทดลอง Premium ก่อนหมดตามจำนวนวันที่ตั้งไว้ (วันที่ 1 และ 2)', true, '{"days_first": 3, "days_second": 1}', 20),
  ('plan_expiring', 'เตือนแพ็กเกจใกล้หมดอายุ', 'แจ้งผู้ใช้แพ็กเกจที่ชำระแล้วก่อนหมดอายุตามจำนวนวันที่ตั้งไว้', true, '{"days_first": 3, "days_second": 1}', 30),
  ('queue_expire', 'ทิ้งข้อความ LINE ที่ค้างเกินเวลา', 'ข้อความที่ค้างในคิวนานเกินจำนวนชั่วโมงที่ตั้งไว้ถูกข้าม (ข้อความเตือนที่เลยเวลาแล้วไม่มีประโยชน์)', true, '{"hours": 24}', 90),
  ('cleanup_old', 'ลบข้อมูลแจ้งเตือนเก่า', 'ลบการแจ้งเตือนในแอปที่อ่านแล้วและคิวที่ส่งแล้วเก่ากว่าจำนวนวันที่ตั้งไว้', true, '{"days": 90}', 95)
on conflict do nothing;

alter table public.automation_rules enable row level security;
revoke all on public.automation_rules from anon, authenticated;

-- ── cron_ticks ─────────────────────────────────────────────────────────────
create table public.cron_ticks (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object')
);
create index cron_ticks_started_idx on public.cron_ticks (started_at desc);
alter table public.cron_ticks enable row level security;
revoke all on public.cron_ticks from anon, authenticated;
