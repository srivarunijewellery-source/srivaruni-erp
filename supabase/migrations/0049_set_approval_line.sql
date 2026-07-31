-- =====================================================================
-- 0049_set_approval_line.sql
--
-- The review screen between picking and shipping can now change what
-- will actually ship: bump a line up, trim it down, or add an item the
-- picker never scanned at all. Only reachable while the box sits at
-- 'picked, awaiting approval'. approve_transfer's existing stock check
-- is the hard backstop -- this function does not itself verify shelf
-- stock, so an over-ambitious edit here is refused at approval, not here.
-- =====================================================================

create or replace function public.set_approval_line(p_transfer uuid, p_item uuid, p_qty int)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can adjust the box at approval';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  if t.status <> 'picked' then
    raise exception 'The box can only be adjusted while awaiting approval (currently %)', t.status;
  end if;
  if p_qty < 0 then raise exception 'Quantity cannot be negative'; end if;
  if not exists (select 1 from items where id = p_item and status = 'active') then
    raise exception 'Item % is not an active item', p_item;
  end if;

  -- An existing line just has its shipped quantity changed. A brand new
  -- item (one the picker never scanned) is inserted with qty_picked = 0,
  -- so it stays visibly distinct on the slip and in transit_reconciliation
  -- as "added at approval, not physically scanned in by the picker".
  insert into transfer_lines (transfer_id, item_id, qty_requested, qty_picked, qty_sent)
  values (p_transfer, p_item, p_qty, 0, p_qty)
  on conflict (transfer_id, item_id)
  do update set qty_sent      = p_qty,
                qty_requested = greatest(transfer_lines.qty_requested, p_qty);
end
$function$;

revoke execute on function public.set_approval_line(uuid, uuid, int) from public, anon;
grant  execute on function public.set_approval_line(uuid, uuid, int) to authenticated;
