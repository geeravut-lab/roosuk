-- Phase 2 / monthly report.
--
-- The figures on the report are computed from the person's own data every time
-- they open it, so nothing numeric is stored. What IS stored is the optional AI
-- recap (one per month, written by the server after the guardrail check, so a
-- person cannot put text there themselves) — which the person can delete to
-- have it written again. The AI conversation log gets a new kind for audit.

create table public.monthly_reports (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  summary text not null check (length(summary) between 10 and 1500),
  highlights jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array'),
  next_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(next_steps) = 'array'),
  model text not null default '' check (length(model) <= 100),
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.monthly_reports enable row level security;
revoke all on public.monthly_reports from anon, authenticated;
grant select, delete on public.monthly_reports to authenticated;

create policy monthly_reports_select_own on public.monthly_reports
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy monthly_reports_delete_own on public.monthly_reports
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.ai_conversations drop constraint ai_conversations_kind_check;
alter table public.ai_conversations
  add constraint ai_conversations_kind_check check (kind in ('chat', 'lab_explain', 'monthly_report'));
