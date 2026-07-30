-- =====================================================================
-- 0042_transfer_pick_functions.sql
--
-- The scanning API. Every rule lives here rather than in the browser: a
-- hardware scanner fires faster than a round trip, so the screen must be
-- unable to drive a count past what was requested even if it tries.
-- =====================================================================

create or replace function public.set_transfer_line(p_transfer uuid, p_item uuid, p_qty int)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  if current_staff_id() is null then raise exception 'Not authenticated'; end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if t.status <> 'requested' then
    raise exception 'Lines can only be edited while the transfer is still a request (currently %)', t.status;
  end if;
  if p_qty < 0 then raise exception 'Quantity cannot be negative'; end if;

  if p_qty = 0 then
    delete from transfer_lines where transfer_id = p_transfer and item_id = p_item;
    return;
  end if;

  if not exists (select 1 from items where id = p_item and status = 'active') then
    raise exception 'Item % is not an active item', p_item;
  end if;

  insert into transfer_lines (transfer_id, item_id, qty_requested, qty_sent, qty_picked)
  values (p_transfer, p_item, p_qty, p_qty, 0)
  on conflict (transfer_id, item_id)
  do update set qty_requested = excluded.qty_requested,
                qty_sent      = excluded.qty_sent;
end
$function$;

create or replace function public.start_pick(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  if current_staff_id() is null then raise exception 'Not authenticated'; end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if not is_owner() and t.from_location_id is distinct from my_location_id() then
    raise exception 'Only the sending store can pick this transfer';
  end if;
  if t.status = 'picking' then return; end if;
  if t.status <> 'requested' then
    raise exception 'Picking can only start on a request (currently %)', t.status;
  end if;
  if not exists (select 1 from transfer_lines where transfer_id = p_transfer) then
    raise exception 'Cannot pick a transfer with no lines';
  end if;

  update transfers
  set status = 'picking', picking_by = current_staff_id(), picking_at = now()
  where id = p_transfer;
end
$function$;

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
    raise exception '% is not on this transfer', v_item.name;
  end if;

  v_new := greatest(0, v_line.qty_picked + p_delta);
  if v_new > v_line.qty_requested then
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
    'remaining',     v_line.qty_requested - v_new,
    'line_complete', v_new = v_line.qty_requested,
    'doc_complete',  not exists (
                       select 1 from transfer_lines
                       where transfer_id = p_transfer
                         and qty_picked < qty_requested
                         and id <> v_line.id
                     ) and v_new = v_line.qty_requested
  );
end
$function$;

create or replace function public.confirm_pick(p_transfer uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
  v_short int;
  v_total int;
begin
  if current_staff_id() is null then raise exception 'Not authenticated'; end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if not is_owner() and t.from_location_id is distinct from my_location_id() then
    raise exception 'Only the sending store can close this pick';
  end if;
  if t.status <> 'picking' then
    raise exception 'Only a transfer being picked can be confirmed (currently %)', t.status;
  end if;

  select count(*) filter (where qty_picked < qty_requested), coalesce(sum(qty_picked), 0)
  into v_short, v_total
  from transfer_lines where transfer_id = p_transfer;

  if v_total = 0 then
    raise exception 'Nothing was picked. Cancel the transfer instead of shipping an empty box';
  end if;
  if v_short > 0 and coalesce(trim(p_note), '') = '' then
    raise exception '% line(s) came up short. A note is required explaining why', v_short;
  end if;

  -- The box contains what it contains. What was picked is what ships;
  -- the shortfall stays visible on the line as requested vs sent.
  update transfer_lines set qty_sent = qty_picked where transfer_id = p_transfer;

  update transfers
  set status = 'picked', picked_by = current_staff_id(),
      picked_at = now(), pick_note = nullif(trim(p_note), '')
  where id = p_transfer;
end
$function$;

create or replace function public.scan_receive(p_transfer uuid, p_barcode text, p_delta int default 1)
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
  if not is_owner() and t.to_location_id is distinct from my_location_id() then
    raise exception 'Only the receiving store can scan this transfer in';
  end if;
  if t.status <> 'dispatched' then
    raise exception 'Transfer is not in transit (currently %)', t.status;
  end if;

  -- First scan switches the document from "assume all arrived" to
  -- "only what is scanned arrived". Anything never scanned counts as short.
  update transfer_lines set qty_received = 0
  where transfer_id = p_transfer and qty_received is null;

  select * into v_item from items
  where barcode = upper(trim(p_barcode)) or legacy_barcode = upper(trim(p_barcode))
  limit 1;
  if not found then raise exception 'Barcode % is not recognised', trim(p_barcode); end if;

  select * into v_line from transfer_lines
  where transfer_id = p_transfer and item_id = v_item.id for update;
  if not found then
    raise exception '% was not in this box', v_item.name;
  end if;
  if v_line.qty_sent = 0 then
    raise exception '% was requested but never picked, so it should not be in this box', v_item.name;
  end if;

  v_new := greatest(0, coalesce(v_line.qty_received, 0) + p_delta);
  if v_new > v_line.qty_sent then
    raise exception 'More % scanned than were dispatched (% of %)',
      v_item.name, v_new, v_line.qty_sent;
  end if;

  update transfer_lines set qty_received = v_new where id = v_line.id;

  return jsonb_build_object(
    'item_id',        v_item.id,
    'barcode',        v_item.barcode,
    'name',           v_item.name,
    'qty_sent',       v_line.qty_sent,
    'qty_received',   v_new,
    'remaining',      v_line.qty_sent - v_new,
    'line_complete',  v_new = v_line.qty_sent,
    'doc_complete',   not exists (
                        select 1 from transfer_lines
                        where transfer_id = p_transfer
                          and coalesce(qty_received, 0) < qty_sent
                          and id <> v_line.id
                      ) and v_new = v_line.qty_sent
  );
end
$function$;
