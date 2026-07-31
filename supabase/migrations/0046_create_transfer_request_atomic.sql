-- =====================================================================
-- 0046_create_transfer_request_atomic.sql
--
-- Items are now selected before the transfer document exists (see the
-- /transfers/new screen). This creates the transfer row and every line
-- in one transaction: either the whole request lands, or none of it does.
-- No half-built document is ever visible on the transfers list.
-- =====================================================================

create or replace function public.create_transfer_request(
  p_from uuid, p_to uuid, p_reason text, p_note text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  v_id uuid;
  v_line jsonb;
  v_item_id uuid;
  v_qty int;
  v_line_count int;
begin
  if current_staff_id() is null then
    raise exception 'Not authenticated';
  end if;
  if p_from = p_to then
    raise exception 'Source and destination must differ';
  end if;
  if not exists (select 1 from locations where id = p_from and active)
  or not exists (select 1 from locations where id = p_to and active) then
    raise exception 'Both locations must exist and be active';
  end if;

  select jsonb_array_length(p_lines) into v_line_count;
  if v_line_count is null or v_line_count = 0 then
    raise exception 'Select at least one item before raising the request';
  end if;

  insert into transfers (doc_no, from_location_id, to_location_id, status,
                         reason, note, created_by, requested_by, requested_at)
  values (next_transfer_doc_no(p_from), p_from, p_to, 'requested',
          p_reason, p_note, current_staff_id(), current_staff_id(), now())
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := (v_line->>'item_id')::uuid;
    v_qty     := (v_line->>'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be positive for every selected item';
    end if;
    if not exists (select 1 from items where id = v_item_id and status = 'active') then
      raise exception 'Item % is not an active item', v_item_id;
    end if;

    insert into transfer_lines (transfer_id, item_id, qty_requested, qty_sent, qty_picked)
    values (v_id, v_item_id, v_qty, v_qty, 0)
    on conflict (transfer_id, item_id) do update set qty_requested = excluded.qty_requested,
                                                       qty_sent      = excluded.qty_sent;
  end loop;

  return v_id;
end
$function$;

revoke execute on function public.create_transfer_request(uuid, uuid, text, text, jsonb) from public, anon;
grant  execute on function public.create_transfer_request(uuid, uuid, text, text, jsonb) to authenticated;
