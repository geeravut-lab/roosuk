-- Managing who is an admin from the admin page. Membership stays writable only with
-- the service role; these functions are the ONLY way the app changes it, so the
-- rules live where they cannot be skipped:
--   · only an admin can grant or revoke;
--   · nobody revokes themselves;
--   · the owner's account (geeravut@gmail.com) can never lose admin through here;
--   · granting is by the email of a person who already has an account.
-- Every change is written to the audit log in the same transaction.

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- 'ok' | 'forbidden' (actor is not an admin) | 'not_found' (no such account) | 'already'
create or replace function public.grant_admin(p_actor uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  v_target := public.user_id_by_email(p_email);
  if v_target is null then
    return 'not_found';
  end if;
  insert into public.admins (user_id) values (v_target) on conflict do nothing;
  if not found then
    return 'already';
  end if;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (v_target, 'admin_granted', null, jsonb_build_object('by', p_actor));
  return 'ok';
end;
$$;
revoke all on function public.grant_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_admin(uuid, text) to service_role;

-- 'ok' | 'forbidden' | 'self' | 'protected' (the owner) | 'not_admin'
create or replace function public.revoke_admin(p_actor uuid, p_target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins where user_id = p_actor) then
    return 'forbidden';
  end if;
  if p_actor = p_target then
    return 'self';
  end if;
  if exists (
    select 1 from auth.users where id = p_target and lower(email) = 'geeravut@gmail.com'
  ) then
    return 'protected';
  end if;
  delete from public.admins where user_id = p_target;
  if not found then
    return 'not_admin';
  end if;
  insert into public.privacy_audit_log (user_id, action, detail, meta)
    values (p_target, 'admin_revoked', null, jsonb_build_object('by', p_actor));
  return 'ok';
end;
$$;
revoke all on function public.revoke_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_admin(uuid, uuid) to service_role;
