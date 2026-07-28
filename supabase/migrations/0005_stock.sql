-- =====================================================================
-- 0005_stock.sql
-- The append-only stock ledger, balances, transfers, vendor returns,
-- damage write-offs and adjustments.
--
-- Rule: stock_balances is never written directly. Every movement is a
-- ledger row with a reason code, a reference, a user and a timestamp.
-- The ledger is physically immutable: updates and deletes raise.
-- =====================================================================

create table stock_ledger (
  id               bigint generated always as identity primary key,
  item_id          uuid not null references items(id),
  location_id      uuid not null references locations(id),
  qty_delta        integer not null check (qty_delta <> 0),
  reason           stock_reason not null,
  ref_type         text,
  ref_id           uuid,
  note             text,
  created_by       uuid references staff(id),
  created_at       timestamptz not null default now(),
  idempotency_key  uuid unique
);

comment on table stock_ledger is
  'Append only. Single source of truth for all stock movement. '
  'Opening stock from the Vasy migration enters here as migration_opening, '
  'never as a direct balance write.';

comment on column stock_ledger.idempotency_key is
  'Client-generated UUID per operation. Costs nothing now and is what '
  'lets offline POS be retrofitted later without a rewrite.';

create index stock_ledger_item_loc_idx on stock_ledger (item_id, location_id, created_at desc);
create index stock_ledger_ref_idx      on stock_ledger (ref_type, ref_id);
create index stock_ledger_created_idx  on stock_ledger (created_at desc);
create index stock_ledger_reason_idx   on stock_ledger (reason, created_at desc);

create table stock_balances (
  item_id      uuid not null references items(id),
  location_id  uuid not null references locations(id),
  qty          integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (item_id, location_id)
);

comment on table stock_balances is
  'Derived cache maintained by trigger. Reads never aggregate the ledger, '
  'which is what keeps stock lookup instant at the counter.';

create index stock_balances_location_idx on stock_balances (location_id) where qty <> 0;

-- --------------------------------------------------- append-only guard

create or replace function stock_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_ledger is append only. Post a reversing entry instead.';
end
$$;

create trigger stock_ledger_no_change
  before update or delete on stock_ledger
  for each row execute function stock_ledger_immutable();

-- ------------------------------------------------- balance maintenance

create or replace function stock_ledger_apply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty integer;
begin
  insert into stock_balances (item_id, location_id, qty, updated_at)
  values (new.item_id, new.location_id, new.qty_delta, now())
  on conflict (item_id, location_id)
  do update set qty = stock_balances.qty + excluded.qty, updated_at = now()
  returning qty into v_qty;

  if v_qty < 0 then
    raise exception 'Stock would go negative (item %, location %, resulting qty %)',
      new.item_id, new.location_id, v_qty;
  end if;

  return new;
end
$$;

create trigger stock_ledger_apply_trg
  after insert on stock_ledger
  for each row execute function stock_ledger_apply();

-- ============================================================ transfers
-- Dispatch and receipt are two separate ledger events with a transit
-- location in between, so in-flight stock is visible and any loss is
-- attributable to a specific leg.

create sequence transfer_doc_seq start 1;

create table transfers (
  id                uuid primary key default gen_random_uuid(),
  doc_no            text not null unique,
  from_location_id  uuid not null references locations(id),
  to_location_id    uuid not null references locations(id),
  transit_location_id uuid references locations(id),
  status            text not null default 'draft'
                    check (status in ('draft', 'dispatched', 'received', 'cancelled')),
  courier           text,
  docket_no         text,
  note              text,
  created_by        uuid references staff(id),
  created_at        timestamptz not null default now(),
  dispatched_by     uuid references staff(id),
  dispatched_at     timestamptz,
  received_by       uuid references staff(id),
  received_at       timestamptz,
  check (from_location_id <> to_location_id)
);

create table transfer_lines (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references transfers(id) on delete cascade,
  item_id       uuid not null references items(id),
  qty_sent      integer not null check (qty_sent > 0),
  qty_received  integer check (qty_received >= 0),
  unique (transfer_id, item_id)
);

create index transfers_status_idx on transfers (status, created_at desc);

create or replace function dispatch_transfer(p_transfer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t transfers%rowtype;
  v_transit uuid;
begin
  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if t.status <> 'draft' then
    raise exception 'Transfer is already %', t.status;
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

create or replace function receive_transfer(p_transfer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t transfers%rowtype;
begin
  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;
  if t.status <> 'dispatched' then
    raise exception 'Transfer must be dispatched before receipt (currently %)', t.status;
  end if;

  -- Default received to sent where the receiver did not record a count.
  update transfer_lines set qty_received = qty_sent
  where transfer_id = p_transfer and qty_received is null;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.transit_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.to_location_id, l.qty_received, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_received > 0;

  -- Anything sent but not received is a loss in transit, posted against
  -- transit so it is visible rather than silently absorbed.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
  select l.item_id, t.transit_location_id, (l.qty_sent - l.qty_received), 'count_variance',
         'transfer', p_transfer, current_staff_id(), 'Short received in transit'
  from transfer_lines l
  where l.transfer_id = p_transfer and l.qty_received < l.qty_sent;

  update transfers
  set status = 'received', received_by = current_staff_id(), received_at = now()
  where id = p_transfer;
end
$$;

-- ======================================================= vendor returns

create sequence vendor_return_doc_seq start 1;

create table vendor_returns (
  id           uuid primary key default gen_random_uuid(),
  doc_no       text not null unique,
  vendor_id    uuid not null references vendors(id),
  location_id  uuid not null references locations(id),
  status       text not null default 'draft'
               check (status in ('draft', 'submitted', 'approved', 'rejected')),
  courier      text,
  docket_no    text,
  note         text,
  created_by   uuid references staff(id),
  created_at   timestamptz not null default now(),
  approved_by  uuid references staff(id),
  approved_at  timestamptz
);

create table vendor_return_lines (
  id                uuid primary key default gen_random_uuid(),
  vendor_return_id  uuid not null references vendor_returns(id) on delete cascade,
  item_id           uuid not null references items(id),
  qty               integer not null check (qty > 0),
  reason            text not null check (
                      reason in ('damaged', 'defective', 'wrong_item', 'unsold', 'other')),
  note              text,
  unique (vendor_return_id, item_id, reason)
);

comment on column vendor_return_lines.reason is
  'Per-line reason codes are what make "which vendor sends the most '
  'defective stock" answerable six months from now.';

create or replace function approve_vendor_return(p_doc uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v vendor_returns%rowtype;
begin
  if not is_owner() then
    raise exception 'Only the owner can approve a vendor return';
  end if;

  select * into v from vendor_returns where id = p_doc for update;
  if not found then raise exception 'Vendor return % not found', p_doc; end if;
  if v.status <> 'submitted' then
    raise exception 'Vendor return must be submitted (currently %)', v.status;
  end if;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
  select l.item_id, v.location_id, -l.qty, 'vendor_return', 'vendor_return', p_doc,
         current_staff_id(), l.reason
  from vendor_return_lines l where l.vendor_return_id = p_doc;

  update vendor_returns
  set status = 'approved', approved_by = current_staff_id(), approved_at = now()
  where id = p_doc;
end
$$;

-- ================================= damage write-off and adjustments
-- Internal damage is NOT a vendor return. Nothing goes back to anyone,
-- the stock simply ceases to be saleable. It is also the easiest route
-- for stock to walk out of the store, so it is owner-approved and the
-- reason note is mandatory.

create sequence adjustment_doc_seq start 1;

create table stock_adjustments (
  id           uuid primary key default gen_random_uuid(),
  doc_no       text not null unique,
  location_id  uuid not null references locations(id),
  kind         text not null check (kind in ('damage', 'adjustment', 'count_variance')),
  status       text not null default 'draft'
               check (status in ('draft', 'submitted', 'approved', 'rejected')),
  reason_note  text,
  created_by   uuid references staff(id),
  created_at   timestamptz not null default now(),
  approved_by  uuid references staff(id),
  approved_at  timestamptz
);

create table stock_adjustment_lines (
  id             uuid primary key default gen_random_uuid(),
  adjustment_id  uuid not null references stock_adjustments(id) on delete cascade,
  item_id        uuid not null references items(id),
  qty_delta      integer not null check (qty_delta <> 0),
  note           text,
  unique (adjustment_id, item_id)
);

create or replace function approve_adjustment(p_doc uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v stock_adjustments%rowtype;
  v_damage uuid;
begin
  if not is_owner() then
    raise exception 'Only the owner can approve a stock adjustment';
  end if;

  select * into v from stock_adjustments where id = p_doc for update;
  if not found then raise exception 'Adjustment % not found', p_doc; end if;
  if v.status <> 'submitted' then
    raise exception 'Adjustment must be submitted (currently %)', v.status;
  end if;
  if coalesce(trim(v.reason_note), '') = '' then
    raise exception 'A reason note is required on every adjustment';
  end if;

  if v.kind = 'damage' then
    select id into v_damage from locations where kind = 'damage' and active order by code limit 1;
    if v_damage is null then raise exception 'No damage location configured'; end if;

    -- Out of the store, into the damage bucket. Never simply vanished.
    insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
    select l.item_id, v.location_id, -abs(l.qty_delta), 'damage', 'adjustment', p_doc,
           current_staff_id(), coalesce(l.note, v.reason_note)
    from stock_adjustment_lines l where l.adjustment_id = p_doc;

    insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
    select l.item_id, v_damage, abs(l.qty_delta), 'damage', 'adjustment', p_doc,
           current_staff_id(), coalesce(l.note, v.reason_note)
    from stock_adjustment_lines l where l.adjustment_id = p_doc;
  else
    insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
    select l.item_id, v.location_id, l.qty_delta,
           (case when v.kind = 'count_variance' then 'count_variance' else 'adjustment' end)::stock_reason,
           'adjustment', p_doc, current_staff_id(), coalesce(l.note, v.reason_note)
    from stock_adjustment_lines l where l.adjustment_id = p_doc;
  end if;

  update stock_adjustments
  set status = 'approved', approved_by = current_staff_id(), approved_at = now()
  where id = p_doc;
end
$$;

-- ============================================== stock on hand for staff
-- Fast lookup: "do we have this in another colour". No cost anywhere.

create or replace view stock_on_hand
with (security_invoker = true) as
select
  i.id            as item_id,
  i.barcode,
  i.name,
  c.name          as category,
  t.name          as item_type,
  i.status,
  i.mrp_paise,
  i.selling_price_paise,
  b.location_id,
  loc.code        as location_code,
  loc.name        as location_name,
  b.qty
from items i
join categories c on c.id = i.category_id
left join item_types t on t.id = i.item_type_id
join stock_balances b on b.item_id = i.id
join locations loc on loc.id = b.location_id
where b.qty <> 0;
