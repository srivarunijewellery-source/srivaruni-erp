-- =====================================================================
-- 0043_transfer_lifecycle_rework.sql
--
-- Reworks the existing lifecycle functions around the new pick stage,
-- and closes two security holes found while doing it:
--
--   1. dispatch_transfer gained default arguments, which created a
--      SECOND overload rather than replacing the old one. Every
--      single-argument call would then have failed as ambiguous.
--
--   2. Functions created after the original blanket revoke picked up
--      the default PUBLIC execute grant again, and anon with it. An
--      unauthenticated REST caller could reach the scanning API. Every
--      transfer function is re-locked at the end of this file.
-- =====================================================================

create or replace function public.approve_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can approve a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  -- Approval now sits AFTER picking: the owner signs off on what is
  -- actually in the box, not on what was optimistically requested.
  if t.status <> 'picked' then
    raise exception 'A transfer must be picked before approval (currently %)', t.status;
  end if;
  if not exists (select 1 from transfer_lines where transfer_id = p_transfer and qty_sent > 0) then
    raise exception 'Cannot approve a transfer with nothing picked';
  end if;

  if exists (
    select 1 from transfer_lines l
    left join stock_balances b
      on b.item_id = l.item_id and b.location_id = t.from_location_id
    where l.transfer_id = p_transfer
      and l.qty_sent > 0
      and coalesce(b.qty, 0) < l.qty_sent
  ) then
    raise exception 'Picked quantity exceeds stock on hand at the source location';
  end if;

  update transfers
  set status = 'approved', approved_by = current_staff_id(), approved_at = now()
  where id = p_transfer;
end
$function$;

-- The old single-argument overload must go, or every call is ambiguous.
drop function if exists public.dispatch_transfer(uuid);

create or replace function public.dispatch_transfer(
  p_transfer uuid, p_courier text default null, p_docket text default null)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
  v_transit uuid;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can dispatch a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if not is_owner() and t.from_location_id is distinct from my_location_id() then
    raise exception 'You can only dispatch from your own location';
  end if;
  if t.status <> 'approved' then
    raise exception 'Transfer must be approved before dispatch (currently %)', t.status;
  end if;

  v_transit := coalesce(
    t.transit_location_id,
    (select id from locations where kind = 'transit' and active order by code limit 1)
  );
  if v_transit is null then raise exception 'No transit location configured'; end if;

  -- Stock leaves the sending store the moment the box does. It is no longer
  -- sellable anywhere: it belongs to TRANSIT, which no store can see.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.from_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_sent > 0;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, v_transit, l.qty_sent, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_sent > 0;

  update transfers
  set status = 'dispatched', transit_location_id = v_transit,
      courier = coalesce(nullif(trim(p_courier), ''), courier),
      docket_no = coalesce(nullif(trim(p_docket), ''), docket_no),
      dispatched_by = current_staff_id(), dispatched_at = now()
  where id = p_transfer;
end
$function$;

create or replace function public.cancel_transfer(p_transfer uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  -- Once stock is in transit it cannot be cancelled, only received.
  -- Otherwise the ledger would strand units in TRANSIT forever.
  if t.status not in ('requested', 'picking', 'picked', 'approved') then
    raise exception 'A % transfer cannot be cancelled', t.status;
  end if;
  if not is_manager_or_above() and t.requested_by is distinct from current_staff_id() then
    raise exception 'You can only cancel a transfer you raised';
  end if;

  update transfers
  set status = 'cancelled', cancelled_by = current_staff_id(), cancelled_at = now(),
      rejected_reason = coalesce(p_reason, rejected_reason)
  where id = p_transfer;
end
$function$;

create or replace function public.reject_transfer(p_transfer uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can reject a transfer';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A rejection reason is required';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  -- Review now happens after picking, so a transfer can be sent back either
  -- before anyone walked the rail or after the box was packed. Neither state
  -- has touched the ledger, so nothing needs unwinding.
  if t.status not in ('requested', 'picked') then
    raise exception 'A % transfer cannot be sent back', t.status;
  end if;

  update transfers
  set status = 'rejected',
      rejected_by = current_staff_id(),
      rejected_at = now(),
      rejected_reason = p_reason
  where id = p_transfer;
end
$function$;

-- Postgres grants EXECUTE to PUBLIC on every new function by default, and
-- every role inherits it. A plain revoke from authenticated does nothing.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('request_transfer','set_transfer_line','start_pick','scan_pick',
                        'confirm_pick','approve_transfer','reject_transfer','cancel_transfer',
                        'dispatch_transfer','scan_receive','receive_transfer')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated', r.sig);
  end loop;
end $$;
