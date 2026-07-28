-- =====================================================================
-- 0014_transit_loss_fix.sql
--
-- Bug found in end-to-end testing: on a short receipt (5 dispatched,
-- 4 arrived) the missing unit was posted BACK into TRANSIT. Transit then
-- held a phantom unit forever, and stock_valuation counted that lost
-- piece as an asset.
--
-- Correct behaviour: TRANSIT always nets to zero once a transfer is
-- received. Everything dispatched either arrives at the destination or
-- is written off to the damage/loss bucket, where it is visible and
-- investigable but not saleable and not valued as good stock.
--
-- Also: stock_on_hand now shows only real stores. Staff asking "do we
-- have this in another colour" should never be offered transit or
-- damaged units.
-- =====================================================================

create or replace function receive_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t transfers%rowtype;
  v_loss uuid;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can receive a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  -- The receiving store confirms receipt, not the sending one. This is
  -- what makes a loss in transit attributable to a specific leg.
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

  if exists (
    select 1 from transfer_lines
    where transfer_id = p_transfer and qty_received > qty_sent
  ) then
    raise exception 'Cannot receive more than was dispatched';
  end if;

  -- Everything leaves transit. Transit nets to zero, always.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.transit_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  -- What actually arrived lands at the destination.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.to_location_id, l.qty_received, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_received > 0;

  -- What did not arrive is a loss, parked in the damage bucket with the
  -- transfer reference so it can be chased with the courier.
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
  select l.item_id, v_loss, (l.qty_sent - l.qty_received), 'count_variance',
         'transfer', p_transfer, current_staff_id(),
         format('Short in transit on %s: sent %s, received %s',
                t.doc_no, l.qty_sent, l.qty_received)
  from transfer_lines l
  where l.transfer_id = p_transfer and l.qty_received < l.qty_sent;

  update transfers
  set status = 'received', received_by = current_staff_id(), received_at = now()
  where id = p_transfer;
end
$$;

-- ------------------------------------------------- saleable stock only

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
where b.qty <> 0
  and loc.kind = 'store'
  and i.status = 'active';

comment on view stock_on_hand is
  'Saleable stock only. Excludes transit and damaged buckets, and items '
  'still awaiting pricing, so the counter is never offered something it '
  'cannot sell.';

-- Valuation keeps every location but now labels the bucket, so damaged
-- and in-transit value can be separated from saleable value.
--
-- CREATE OR REPLACE VIEW can only append columns, never insert one in
-- the middle, so the dependent chain has to be dropped and rebuilt.
drop view if exists dead_stock;
drop view if exists stock_valuation;

create view stock_valuation
with (security_invoker = true) as
select
  i.id                              as item_id,
  i.barcode,
  i.name,
  c.name                            as category,
  t.name                            as item_type,
  v.name                            as vendor,
  loc.code                          as location_code,
  loc.name                          as location_name,
  loc.kind                          as location_kind,
  b.qty,
  ic.landed_cost_paise,
  round(b.qty * ic.landed_cost_exact)::bigint as cost_value_paise,
  i.selling_price_paise,
  b.qty * i.selling_price_paise     as retail_value_paise,
  (b.qty * i.selling_price_paise) - round(b.qty * ic.landed_cost_exact)::bigint
                                    as margin_paise,
  i.created_at                      as intake_at,
  (current_date - i.created_at::date) as days_on_hand
from items i
join categories c        on c.id = i.category_id
left join item_types t   on t.id = i.item_type_id
left join vendors v      on v.id = i.vendor_id
join stock_balances b    on b.item_id = i.id
join locations loc       on loc.id = b.location_id
join item_latest_cost ic on ic.item_id = i.id
where b.qty <> 0;

create view dead_stock
with (security_invoker = true) as
select *
from stock_valuation
where days_on_hand >= 90 and location_kind = 'store'
order by days_on_hand desc, cost_value_paise desc;

-- Anything sitting in transit or written off, for the owner to chase.
create view stock_losses
with (security_invoker = true) as
select location_kind, location_code, count(*) as skus,
       sum(qty) as pieces, sum(cost_value_paise) as cost_value_paise
from stock_valuation
where location_kind <> 'store'
group by location_kind, location_code;

comment on view stock_losses is
  'Transit and damage buckets. Transit should be empty except for '
  'transfers genuinely in flight; anything lingering there is a stuck '
  'document. Damage is real loss awaiting write-off.';
