-- Vendor bill is now OPTIONAL at submit.
-- It stays the owner's best source for rates, and the UI still prompts
-- for it, but blocking submission was wrong: a carton that arrives with
-- a handwritten slip, or none at all, still needs recording. Forcing a
-- photo just teaches staff to upload a blank frame to clear the gate,
-- which is worse than an honest empty field.
create or replace function submit_inward(p_inward uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v inwards%rowtype;
begin
  select * into v from inwards where id = p_inward for update;
  if not found then raise exception 'Inward % not found', p_inward; end if;

  if current_staff_id() is null then
    raise exception 'Not authenticated';
  end if;
  if not is_owner() and v.location_id is distinct from my_location_id() then
    raise exception 'You can only submit inwards at your own location';
  end if;
  if v.status <> 'draft' then
    raise exception 'Only a draft inward can be submitted (currently %)', v.status;
  end if;
  if not exists (select 1 from inward_lines where inward_id = p_inward) then
    raise exception 'Cannot submit an inward with no lines';
  end if;

  update inwards set status = 'submitted', submitted_at = now() where id = p_inward;
end
$$;
