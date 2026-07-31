-- =====================================================================
-- 0053_receive_transfer_lost_in_transit.sql
--
-- receive_transfer now routes shortfalls to the dedicated 'lost' location
-- with reason 'lost_in_transit', instead of the generic damage bucket
-- with reason 'count_variance'. See 0050-0052.
-- =====================================================================

create or replace function public.receive_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
  v_lost uuid;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can receive a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if not is_owner() and t.to_location_id is distinct from my_location_id() then
    raise exception 'You can only receive a transfer at your own location';
  end if;
  if t.status <> 'dispatched' then
    raise exception 'Transfer must be dispatched before receipt (currently %)', t.status;
  end if;

  select id into v_lost from locations
  where kind = 'lost' and active order by code limit 1;
  if v_lost is null then
    raise exception 'No lost-in-transit location configured';
  end if;

  update transfer_lines set qty_received = qty_sent
  where transfer_id = p_transfer and qty_received is null;

  if exists (select 1 from transfer_lines
             where transfer_id = p_transfer and qty_received > qty_sent) then
    raise exception 'Cannot receive more than was dispatched';
  end if;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.transit_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_sent > 0;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.to_location_id, l.qty_received, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_received > 0;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
  select l.item_id, v_lost, (l.qty_sent - l.qty_received), 'lost_in_transit',
         'transfer', p_transfer, current_staff_id(),
         format('Lost in transit on %s: dispatched %s, received %s', t.doc_no, l.qty_sent, l.qty_received)
  from transfer_lines l
  where l.transfer_id = p_transfer and l.qty_sent > 0 and l.qty_received < l.qty_sent;

  update transfers
  set status = 'received', received_by = current_staff_id(), received_at = now()
  where id = p_transfer;
end
$function$;
