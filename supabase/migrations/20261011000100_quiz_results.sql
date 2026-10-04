-- Phase 1 / Health Quiz: saved results of signed-in users. The score, health age
-- and levers are computed by code on the server (src/lib/quiz) and the 7-day plan
-- is written by AI or a template, so rows are written only by the server (service
-- role); users read and delete their own. Anonymous quiz-takers are never stored.

create table public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  score smallint not null check (score between 0 and 100),
  chrono_age smallint not null check (chrono_age between 0 and 130),
  -- health age minus real age, bounded like the algorithm
  delta_years smallint not null check (delta_years between -10 and 10),
  levers jsonb not null check (jsonb_typeof(levers) = 'array' and jsonb_array_length(levers) <= 3),
  plan jsonb not null check (jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) = 7),
  plan_source text not null check (plan_source in ('ai', 'template')),
  model text check (model is null or length(model) <= 100),
  created_at timestamptz not null default now()
);

create index quiz_results_user_idx on public.quiz_results (user_id, created_at desc);

alter table public.quiz_results enable row level security;
revoke all on public.quiz_results from anon, authenticated;
grant select, delete on public.quiz_results to authenticated;

create policy quiz_results_select_own on public.quiz_results
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy quiz_results_delete_own on public.quiz_results
  for delete to authenticated
  using (user_id = (select auth.uid()));
