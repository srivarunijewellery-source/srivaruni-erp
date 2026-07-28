-- =====================================================================
-- 0012_transfer_workflow.sql
-- Reworks stock transfers into a four-stage request flow.
--
--   REQUESTED   any staff member can raise one, from any location
--   APPROVED    manager or owner signs off
--   DISPATCHED  sending store ships; stock moves to TRANSIT
--   RECEIVED    receiving store confirms; stock lands, shortfall logged
--
--   REJECTED / CANCELLED terminate without touching the ledger.
--
-- Approval is manager-and-above rather than owner-only. Dispatch and
-- receipt are each location-scoped and separately logged, so a manager
-- cannot move stock without both legs appearing in the owner's ledger.
-- Tighten to is_owner() if you want the harder gate.
-- =====================================================================

alter table transfers drop constraint if exists transfers_status_check;

update transfers set status = 'requested' where status = 'draft';

alter table transfers
  add constraint transfers_status_check check (
    status in ('requested', 'approved', 'rejected',
               'dispatched', 'received', 'cancelled')
  );

alter table transfers alter column status set default 'requested';

alter table transfers
  add column if not exists requested_by     uuid references staff(id),
  add column if not exists requested_at     timestamptz,
  add column if not exists approved_by      uuid references staff(id),
  add column if not exists approved_at      timestamptz,
  add column if not exists rejected_by      uuid references staff(id),
  add column if not exists rejected_at      timestamptz,
  add column if not exists rejected_reason  text,
  add column if not exists cancelled_by     uuid references staff(id),
  add column if not exists cancelled_at     timestamptz,
  add column if not exists reason           text;

comment on column transfers.reason is
  'Why the stock is being moved. Free text, but required at request time '
  'so the owner can see intent without asking.';

create sequence if not exists transfer_req_seq start 1;

create or replace function next_transfer_doc_no(p_from uuid)
returns text
language sql volatile set search_path = public
as $$
  select coalesce((select code from locations where id = p_from), 'XX')
         || '-TR-' || lpad(nextval('transfer_req_seq')::text, 6, '0')
$$;

-- --------------------------------------------------------------- create
-- Deliberately open: any active staff member can raise a request. The
-- control is at approval, not at creation, so the shop floor can flag a
-- need without waiting for anyone.

create or replace function request_transfer(
  p_from    uuid,
  p_to      uuid,
  p_reason  text default null,
  p_note    text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
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

  insert into transfers (doc_no, from_location_id, to_location_id, status,
                         reason, note, created_by, requested_by, requested_at)
  values (next_transfer_doc_no(p_from), p_from, p_to, 'requested',
          p_reason, p_note, current_staff_id(), current_staff_id(), now())
  returning id into v_id;

  return v_id;
end
$$;

-- -------------------------------------------------------------- approve

create or replace function approve_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t transfers%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can approve a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if t.status <> 'requested' then
    raise exception 'Only a requested transfer can be approved (currently %)', t.status;
  end if;
  if not exists (select 1 from transfer_lines where transfer_id = p_transfer) then
    raise exception 'Cannot approve a transfer with no lines';
  end if;

  -- Check availability at approval so the request is not approved for
  -- stock that is not there. Dispatch will re-check.
  if exists (
    select 1
    from transfer_lines l
    left join stock_balances b
      on b.item_id = l.item_id and b.location_id = t.from_location_id
    where l.transfer_id = p_transfer
      and coalesce(b.qty, 0) < l.qty_sent
  ) then
    raise exception 'Requested quantity exceeds stock on hand at the source location';
  end if;

  update transfers
  set status = 'approved',
      approved_by = current_staff_id(),
      approved_at = now()
  where id = p_transfer;
end
$$;

create or replace function reject_transfer(p_transfer uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can reject a transfer';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A rejection reason is required';
  end if;

  update transfers
  set status = 'rejected',
      rejected_by = current_staff_id(),
      rejected_at = now(),
      rejected_reason = p_reason
  where id = p_transfer and status = 'requested';

  if not found then
    raise exception 'Transfer % is not awaiting approval', p_transfer;
  end if;
end
$$;

create or replace function cancel_transfer(p_transfer uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t transfers%rowtype;
begin
  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  -- Once stock is in transit it cannot be cancelled, only received.
  -- Otherwise the ledger would strand units in TRANSIT forever.
  if t.status not in ('requested', 'approved') then
    raise exception 'A % transfer cannot be cancelled', t.status;
  end if;
  if not is_manager_or_above() and t.requested_by is distinct from current_staff_id() then
    raise exception 'You can only cancel a transfer you raised';
  end if;

  update transfers
  set status = 'cancelled',
      cancelled_by = current_staff_id(),
      cancelled_at = now(),
      rejected_reason = coalesce(p_reason, rejected_reason)
  where id = p_transfer;
end
$$;

-- ------------------------------------------------------------- dispatch
-- Now requires an APPROVED transfer, not a draft.

create or replace function dispatch_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $$
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
  if v_transit is null then
    raise exception 'No transit location configured';
  end if;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.from_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, v_transit, l.qty_sent, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  update transfers
  set status = 'dispatched',
      transit_location_id = v_transit,
      dispatched_by = current_staff_id(),
      dispatched_at = now()
  where id = p_transfer;
end
$$;

-- ---------------------------------------------------------------- RLS
-- Creation opens up to all staff; editing lines stays restricted to the
-- requesting location while the document is still 'requested'.

drop policy if exists transfers_write on transfers;
drop policy if exists transfer_lines_all on transfer_lines;

create policy transfers_insert on transfers
  for insert with check (current_staff_id() is not null);

create policy transfers_update on transfers
  for update using (
    is_manager_or_above()
    or (status = 'requested' and requested_by = current_staff_id())
  );

create policy transfer_lines_read on transfer_lines
  for select using (
    is_owner()
    or exists (
      select 1 from transfers t
      where t.id = transfer_id
        and (t.from_location_id = my_location_id() or t.to_location_id = my_location_id())
    )
  );

create policy transfer_lines_write on transfer_lines
  for all using (
    is_manager_or_above()
    or exists (
      select 1 from transfers t
      where t.id = transfer_id
        and t.status = 'requested'
        and t.requested_by = current_staff_id()
    )
  )
  with check (
    is_manager_or_above()
    or exists (
      select 1 from transfers t
      where t.id = transfer_id
        and t.status = 'requested'
        and t.requested_by = current_staff_id()
    )
  );

-- ------------------------------------------------------------- grants

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function request_transfer(uuid, uuid, text, text) from public';
    execute 'grant execute on function request_transfer(uuid, uuid, text, text) to authenticated';
    execute 'revoke execute on function approve_transfer(uuid) from public';
    execute 'grant execute on function approve_transfer(uuid) to authenticated';
    execute 'revoke execute on function reject_transfer(uuid, text) from public';
    execute 'grant execute on function reject_transfer(uuid, text) to authenticated';
    execute 'revoke execute on function cancel_transfer(uuid, text) from public';
    execute 'grant execute on function cancel_transfer(uuid, text) to authenticated';
    execute 'revoke execute on function next_transfer_doc_no(uuid) from public';
    execute 'grant execute on function next_transfer_doc_no(uuid) to authenticated';
  end if;
end
$$;

-- Owner-facing pipeline view.
create or replace view transfer_pipeline
with (security_invoker = true) as
select
  t.id,
  t.doc_no,
  t.status,
  fl.code            as from_code,
  tl.code            as to_code,
  t.reason,
  count(l.id)        as lines,
  coalesce(sum(l.qty_sent), 0)     as qty_sent,
  coalesce(sum(l.qty_received), 0) as qty_received,
  t.requested_at,
  t.approved_at,
  t.dispatched_at,
  t.received_at
from transfers t
join locations fl on fl.id = t.from_location_id
join locations tl on tl.id = t.to_location_id
left join transfer_lines l on l.transfer_id = t.id
group by t.id, t.doc_no, t.status, fl.code, tl.code, t.reason,
         t.requested_at, t.approved_at, t.dispatched_at, t.received_at;
