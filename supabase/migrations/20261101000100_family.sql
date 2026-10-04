-- Phase 3D / Family (Premium +1): a Premium owner invites one person; that person
-- keeps their OWN account and data, gets Premium while the owner's paid Premium is
-- live (applied in code, src/lib/billing/grants.server.ts), and each side decides,
-- in separate explicit switches, what small summary the other may see. Everything
-- is written by SECURITY DEFINER functions (service role); people read only the
-- rows that concern them.

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,10}$'),
  -- the owner's seats when the invite was made (the plan's familyMembers)
  seats integer not null check (seats between 1 and 10),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- who used it: nulled if that person later deletes their account (their own copy is family_members)
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);
create index family_invites_owner_idx on public.family_invites (owner_id, created_at desc);

-- A person is in at most one family (member_id is the key). owner_id is kept for
-- lookups; the row goes when the owner's invite does (the owner deleting their account).
create table public.family_members (
  member_id uuid primary key references auth.users (id) on delete cascade,
  invite_id uuid not null unique references public.family_invites (id) on delete cascade,
  owner_id uuid not null,
  joined_at timestamptz not null default now(),
  constraint family_not_self check (member_id <> owner_id)
);
create index family_members_owner_idx on public.family_members (owner_id);

-- What each side lets the other see. Tied to the membership: when it ends, these go.
create table public.family_shares (
  member_id uuid not null references public.family_members (member_id) on delete cascade,
  -- who shares with whom
  direction text not null check (direction in ('owner_to_member', 'member_to_owner')),
  scope text not null check (scope in ('checkin', 'score')),
  granted_at timestamptz not null default now(),
  primary key (member_id, direction, scope)
);

alter table public.family_invites enable row level security;
alter table public.family_members enable row level security;
alter table public.family_shares enable row level security;
revoke all on public.family_invites, public.family_members, public.family_shares from anon, authenticated;
grant select on public.family_invites, public.family_members, public.family_shares to authenticated;

create policy family_invites_select_own on public.family_invites
  for select to authenticated using (owner_id = (select auth.uid()));
create policy family_members_select_own on public.family_members
  for select to authenticated
  using (member_id = (select auth.uid()) or owner_id = (select auth.uid()));
create policy family_shares_select_own on public.family_shares
  for select to authenticated
  using (exists (
    select 1 from public.family_members m
     where m.member_id = family_shares.member_id
       and (m.member_id = (select auth.uid()) or m.owner_id = (select auth.uid()))
  ));

-- New invite (the previous open one is cancelled). reason: plan | is_member | full
create or replace function public.create_family_invite(p_owner uuid, p_seats integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_try integer := 0;
begin
  if p_seats < 1 then
    return jsonb_build_object('ok', false, 'reason', 'plan');
  end if;
  perform pg_advisory_xact_lock(hashtext('family:' || p_owner::text));
  if exists (select 1 from public.family_members where member_id = p_owner) then
    return jsonb_build_object('ok', false, 'reason', 'is_member');
  end if;
  if (select count(*) from public.family_members where owner_id = p_owner) >= p_seats then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  update public.family_invites set revoked_at = now()
   where owner_id = p_owner and accepted_by is null and revoked_at is null;
  loop
    v_code := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 7)
    );
    begin
      insert into public.family_invites (owner_id, code, seats, expires_at)
        values (p_owner, v_code, p_seats, now() + interval '7 days');
      return jsonb_build_object('ok', true, 'code', v_code);
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 20 then
        raise exception 'could not make an invite code';
      end if;
    end;
  end loop;
end;
$$;
revoke all on function public.create_family_invite(uuid, integer) from public, anon, authenticated;
grant execute on function public.create_family_invite(uuid, integer) to service_role;

-- Use a code. reason: invalid | revoked | expired | used | own | in_family | owner_busy | full
create or replace function public.accept_family_invite(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.family_invites%rowtype;
begin
  select * into v from public.family_invites where code = upper(btrim(p_code)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtext('family:' || v.owner_id::text));
  if v.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v.accepted_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  if v.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v.owner_id = p_user then
    return jsonb_build_object('ok', false, 'reason', 'own');
  end if;
  if exists (select 1 from public.family_members where member_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'in_family');
  end if;
  if exists (select 1 from public.family_members where owner_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'owner_busy');
  end if;
  if (select count(*) from public.family_members where owner_id = v.owner_id) >= v.seats then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  insert into public.family_members (member_id, invite_id, owner_id) values (p_user, v.id, v.owner_id);
  update public.family_invites set accepted_by = p_user, accepted_at = now() where id = v.id;
  return jsonb_build_object('ok', true, 'owner', v.owner_id);
end;
$$;
revoke all on function public.accept_family_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_family_invite(uuid, text) to service_role;

-- Either side ends the link (the owner removes the member, the member leaves). Their shares go with it.
create or replace function public.end_family_link(p_actor uuid, p_other uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.family_members
   where (owner_id = p_actor and member_id = p_other)
      or (member_id = p_actor and owner_id = p_other);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.end_family_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.end_family_link(uuid, uuid) to service_role;

-- Replace what p_actor shares with p_other (-1: they are not in a family together).
create or replace function public.set_family_shares(p_actor uuid, p_other uuid, p_scopes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_dir text;
  v_scope text;
begin
  select member_id, 'owner_to_member' into v_member, v_dir
    from public.family_members where owner_id = p_actor and member_id = p_other;
  if not found then
    select member_id, 'member_to_owner' into v_member, v_dir
      from public.family_members where member_id = p_actor and owner_id = p_other;
  end if;
  if v_member is null then
    return -1;
  end if;
  delete from public.family_shares where member_id = v_member and direction = v_dir;
  foreach v_scope in array coalesce(p_scopes, '{}') loop
    insert into public.family_shares (member_id, direction, scope) values (v_member, v_dir, v_scope);
  end loop;
  return coalesce(cardinality(p_scopes), 0);
end;
$$;
revoke all on function public.set_family_shares(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.set_family_shares(uuid, uuid, text[]) to service_role;
