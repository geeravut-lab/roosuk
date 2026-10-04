-- Phase 1 / admin additions to the AI prompts. The built-in prompts and the
-- guardrails live in code and are shown (read-only) in /admin/prompts; an
-- admin can ADD instructions per task here without a deploy. They are appended
-- BELOW the built-in rules with a statement that they can never override them,
-- and every addition passes a code check and an AI review before it is saved.
--
-- Insert-only history: the current text of a task is its latest row (an empty
-- body = no addition). Nothing is edited or deleted, so there is always a record
-- of who changed what and what the review said. Written and read by the server
-- (service role) only.

create table public.ai_prompt_versions (
  id bigint generated always as identity primary key,
  task text not null check (task ~ '^[a-z][a-z_]{2,29}$'),
  body text not null default '' check (length(body) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- what allowed it: {"verdict":"ok","reasons":[],"model":"provider/model"}; null when cleared
  review jsonb check (review is null or jsonb_typeof(review) = 'object')
);

create index ai_prompt_versions_task_idx on public.ai_prompt_versions (task, id desc);

alter table public.ai_prompt_versions enable row level security;
revoke all on public.ai_prompt_versions from anon, authenticated;
