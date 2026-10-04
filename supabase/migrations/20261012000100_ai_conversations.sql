-- Phase 1 / AI conversation audit (CLAUDE.md: "Log AI conversations for audit").
-- Every AI health answer — Ask My Health and lab-result explanations — is kept
-- with the question, the answer, which model wrote it and any safety flag, so a
-- bad answer can be investigated and the user can read, export and delete their
-- own history. Written only by the server (service role); users read/delete own.
-- Provider-side prompts built from context (profile, labs) are NOT stored here —
-- only what the user and the assistant actually said.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'lab_explain')),
  -- the report an explanation belongs to; the conversation outlives a deleted report
  report_id uuid references public.lab_reports (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_idx on public.ai_conversations (user_id, kind, updated_at desc);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  -- denormalised so RLS and the account-deletion cascade need no join
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 8000),
  -- why the answer was changed or escalated, e.g. emergency, self_harm, guardrail, see_doctor, low_confidence
  flag text check (flag is null or length(flag) between 1 and 40),
  model text check (model is null or length(model) <= 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, id);
create index ai_messages_flag_idx on public.ai_messages (created_at desc) where flag is not null;

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
revoke all on public.ai_conversations from anon, authenticated;
revoke all on public.ai_messages from anon, authenticated;
grant select, delete on public.ai_conversations to authenticated;
grant select, delete on public.ai_messages to authenticated;

create policy ai_conversations_select_own on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_conversations_delete_own on public.ai_conversations
  for delete to authenticated using (user_id = (select auth.uid()));
create policy ai_messages_select_own on public.ai_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_messages_delete_own on public.ai_messages
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── lab_reports: the AI explanation of a confirmed report ──────────────────
-- Written only by the server (users have no UPDATE right on lab_reports). The
-- statuses it talks about are the code-decided ones stored in `items`.
alter table public.lab_reports
  add column explanation jsonb check (explanation is null or jsonb_typeof(explanation) = 'object'),
  add column explained_at timestamptz;
