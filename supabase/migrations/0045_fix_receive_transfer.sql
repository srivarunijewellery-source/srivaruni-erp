-- =====================================================================
-- 0045_fix_receive_transfer.sql
--
-- Fixes a production crash: receive_transfer moved stock out of transit
-- for every line on the transfer unconditionally. Once a short pick could
-- leave a line at qty_sent = 0 (0041-0043), that produced a zero-delta
-- stock_ledger insert, which stock_ledger_qty_delta_check (qty_delta <> 0)
-- correctly rejected. This function predates the pick-stage work and was
-- never revisited when qty_sent = 0 became a valid state.
-- =====================================================================

create or replace function public.receive_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
  v_loss uuid;
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

  select id into v_loss from locations
  where kind = 'damage' and active order by code limit 1;
  if v_loss is null then
    raise exception 'No damage/loss location configured';
  end if;

  update transfer_lines set qty_received = qty_sent
  where transfer_id = p_transfer and qty_received is null;

  if exists (select 1 from transfer_lines
             where transfer_id = p_transfer and qty_received > qty_sent) then
    raise exception 'Cannot receive more than was dispatched';
  end if;

  -- Everything that actually shipped leaves transit. A line that was
  -- requested but never picked has qty_sent = 0 and never entered transit
  -- in the first place, so it is excluded here -- inserting a zero-delta
  -- row is both meaningless and rejected by stock_ledger_qty_delta_check.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.transit_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_sent > 0;

  -- What actually arrived lands at the destination.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.to_location_id, l.qty_received, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_received > 0;

  -- What did not arrive is a loss, parked in the damage bucket with the
  -- transfer reference so it can be chased with the courier. Only counts
  -- for lines that actually shipped; a never-picked line already carries
  -- its shortfall visibly as qty_requested vs qty_sent = 0.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
  select l.item_id, v_loss, (l.qty_sent - l.qty_received), 'count_variance',
         'transfer', p_transfer, current_staff_id(),
         format('Short in transit on %s: sent %s, received %s', t.doc_no, l.qty_sent, l.qty_received)
  from transfer_lines l
  where l.transfer_id = p_transfer and l.qty_sent > 0 and l.qty_received < l.qty_sent;

  update transfers
  set status = 'received', received_by = current_staff_id(), received_at = now()
  where id = p_transfer;
end
$function$;
