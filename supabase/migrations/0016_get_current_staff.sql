-- Single call to resolve the signed-in staff member.
-- Replaces a PostgREST embedded select across two RLS-protected tables,
-- which had three independent failure modes that all produced an
-- indistinguishable null in the app.
create or replace function get_current_staff()
returns table (
  staff_id uuid, auth_user_id uuid, name text,
  role staff_role, location_id uuid, location_code text
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.auth_user_id, s.name, s.role, s.home_location_id, l.code
  from staff s
  left join locations l on l.id = s.home_location_id
  where s.auth_user_id = current_auth_uid() and s.active
  limit 1
$$;

comment on function get_current_staff is
  'Resolves the signed-in staff member in one round trip. Keyed on auth.uid() with no arguments, so it can only ever return the caller.';

revoke execute on function get_current_staff() from public, anon;
grant execute on function get_current_staff() to authenticated;
