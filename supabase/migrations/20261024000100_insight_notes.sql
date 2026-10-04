-- Phase 2 / AI anomaly + next action. What changed is found by code and shown
-- for free; this stores only the OPTIONAL AI explanation of it, one per
-- (insight kind, anchor) so it is paid for once, written by the server after the
-- guardrail check (a person cannot write it) and deletable by the person.

create table public.insight_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('lab_worse', 'score_drop', 'sleep_short', 'comeback')),
  anchor text not null check (length(anchor) between 1 and 120),
  summary text not null check (length(summary) between 10 and 1500),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  model text not null default '' check (length(model) <= 100),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, anchor)
);

alter table public.insight_notes enable row level security;
revoke all on public.insight_notes from anon, authenticated;
grant select, delete on public.insight_notes to authenticated;

create policy insight_notes_select_own on public.insight_notes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy insight_notes_delete_own on public.insight_notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.ai_conversations drop constraint ai_conversations_kind_check;
alter table public.ai_conversations
  add constraint ai_conversations_kind_check check (kind in ('chat', 'lab_explain', 'monthly_report', 'insight'));
