-- Phase 3C / AI Health Agent: a Premium assistant that can LOOK AT the person's own
-- records (through a short fixed list of read tools) and SET a reminder for them.
-- It never diagnoses; its answers pass the same checks as Ask My Health. This adds
-- the conversation kind, the reminders it can set, and the rule that delivers them.

alter table public.ai_conversations drop constraint ai_conversations_kind_check;
alter table public.ai_conversations
  add constraint ai_conversations_kind_check check (kind in ('chat', 'lab_explain', 'monthly_report', 'insight', 'doctor_brief', 'agent'));

-- A reminder the person asked the agent for: one line, on one day. Written by the
-- server (the agent's tool); the person reads and cancels their own.
create table public.agent_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  remind_on date not null,
  text text not null check (length(btrim(text)) between 3 and 200),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create index agent_reminders_user_idx on public.agent_reminders (user_id, remind_on);
create index agent_reminders_due_idx on public.agent_reminders (remind_on) where notified_at is null;

alter table public.agent_reminders enable row level security;
revoke all on public.agent_reminders from anon, authenticated;
grant select, delete on public.agent_reminders to authenticated;
create policy agent_reminders_select_own on public.agent_reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy agent_reminders_delete_own on public.agent_reminders
  for delete to authenticated using (user_id = (select auth.uid()));

insert into public.automation_rules (key, title, description, enabled, params, sort_order) values
  ('agent_reminders', 'ส่งเตือนที่ผู้ใช้ตั้งไว้ผ่าน AI Health Agent', 'ในเช้าของวันที่ผู้ใช้ขอให้ AI เตือน ส่งข้อความเตือนนั้นให้ (ครั้งเดียว) · ตั้งชั่วโมงเริ่มส่งได้ (เวลาไทย)', true, '{"hour": 8}', 17)
on conflict do nothing;
