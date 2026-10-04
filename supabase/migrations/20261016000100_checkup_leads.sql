-- Phase 1 / "สนใจตรวจสุขภาพ" (interested in a health check): until real booking
-- exists (D6, Phase 4) the button collects a lead — what the person is
-- interested in and how to reach them — for the team to call back. It carries
-- NO health data: the user's results are never attached. The person agrees to
-- being contacted on the form (consented_at). Written by the server only; the
-- user reads their own request (and withdraws it through a server action), the
-- admin works the list through the service role.

create table public.checkup_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  interest text not null check (interest in ('checkup', 'home_service', 'corporate', 'consult')),
  contact_method text not null check (contact_method in ('line', 'phone')),
  phone text check (phone is null or phone ~ '^[0-9+][0-9 -]{6,18}$'),
  note text check (note is null or length(note) <= 300),
  status text not null default 'new' check (status in ('new', 'contacted', 'done', 'declined')),
  admin_note text check (admin_note is null or length(admin_note) <= 300),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checkup_leads_phone_needed check (contact_method <> 'phone' or phone is not null)
);

-- One open request per person: sending again while one is waiting is refused (they can withdraw it first).
create unique index checkup_leads_one_open on public.checkup_leads (user_id) where status = 'new';
create index checkup_leads_status_idx on public.checkup_leads (status, created_at desc);

alter table public.checkup_leads enable row level security;
revoke all on public.checkup_leads from anon, authenticated;
grant select on public.checkup_leads to authenticated;

create policy checkup_leads_select_own on public.checkup_leads
  for select to authenticated
  using (user_id = (select auth.uid()));
