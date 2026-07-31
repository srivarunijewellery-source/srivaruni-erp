-- =====================================================================
-- 0054_scan_pick_allows_extras.sql
--
-- scan_pick used to flatly refuse any barcode not already on the
-- transfer. It now accepts it, inserting a new line with
-- qty_requested = 0 -- the flag used everywhere downstream (approval
-- screen, slip, adjustments report) to mean "added later, not part of
-- the original ask". The requested-quantity cap only applies to lines
-- that actually had a request; an addition has no ceiling from picking,
-- approve_transfer's stock check is what ultimately bounds it.
-- =====================================================================

create or replace function public.scan_pick(p_transfer uuid, p_barcode text, p_delta int default 1)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
  v_item items%rowtype;
  v_line transfer_lines%rowtype;
  v_new int;
begin
  if current_staff_id() is null then raise exception 'Not authenticated'; end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if not is_owner() and t.from_location_id is distinct from my_location_id() then
    raise exception 'Only the sending store can pick this transfer';
  end if;
  if t.status <> 'picking' then
    raise exception 'Transfer is not open for picking (currently %)', t.status;
  end if;

  select * into v_item from items
  where barcode = upper(trim(p_barcode)) or legacy_barcode = upper(trim(p_barcode))
  limit 1;
  if not found then
    raise exception 'Barcode % is not recognised', trim(p_barcode);
  end if;

  select * into v_line from transfer_lines
  where transfer_id = p_transfer and item_id = v_item.id for update;

  if not found then
    insert into transfer_lines (transfer_id, item_id, qty_requested, qty_picked, qty_sent)
    values (p_transfer, v_item.id, 0, 0, 0)
    returning * into v_line;
  end if;

  v_new := greatest(0, v_line.qty_picked + p_delta);

  if v_line.qty_requested > 0 and v_new > v_line.qty_requested then
    raise exception '% is already fully picked (% of %)',
      v_item.name, v_line.qty_picked, v_line.qty_requested;
  end if;

  update transfer_lines set qty_picked = v_new where id = v_line.id;

  return jsonb_build_object(
    'item_id',       v_item.id,
    'barcode',       v_item.barcode,
    'name',          v_item.name,
    'qty_requested', v_line.qty_requested,
    'qty_picked',    v_new,
    'is_extra',      v_line.qty_requested = 0,
    'remaining',     greatest(v_line.qty_requested - v_new, 0),
    'line_complete', v_line.qty_requested > 0 and v_new = v_line.qty_requested,
    'doc_complete',  not exists (
                       select 1 from transfer_lines
                       where transfer_id = p_transfer
                         and qty_requested > 0 and qty_picked < qty_requested
                         and id <> v_line.id
                     ) and (v_line.qty_requested = 0 or v_new = v_line.qty_requested)
  );
end
$function$;
