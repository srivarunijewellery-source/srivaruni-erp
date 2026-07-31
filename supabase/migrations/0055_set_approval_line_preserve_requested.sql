-- =====================================================================
-- 0055_set_approval_line_preserve_requested.sql
--
-- qty_requested is now never touched for a line that already exists --
-- it stays the honest record of what was originally asked for, so a
-- reviewer can always see "asked for 3, shipping 5" rather than having
-- the ask quietly rewritten to match whatever ships. A brand new line
-- gets qty_requested = 0, the same flag scan_pick uses -- one
-- convention, regardless of where the addition happened.
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

  insert into transfer_lines (transfer_id, item_id, qty_requested, qty_picked, qty_sent)
  values (p_transfer, p_item, 0, 0, p_qty)
  on conflict (transfer_id, item_id)
  do update set qty_sent = p_qty;
end
$function$;
