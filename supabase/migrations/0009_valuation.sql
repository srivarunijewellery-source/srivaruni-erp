-- =====================================================================
-- 0009_valuation.sql
-- Stock valuation and aging.
--
-- These are exact, not estimated. Because an item belongs to exactly one
-- inward at exactly one rate, every unit of a SKU has one unambiguous
-- landed cost. No FIFO, no weighted average, no costing engine.
--
-- Owner only: both views are security_invoker and read through
-- item_latest_cost, which sits behind the owner-only policy on
-- item_costs. A staff session gets zero rows.
-- =====================================================================

create or replace view stock_valuation
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

comment on view stock_valuation is
  'Exact stock value at cost and at retail, per SKU per location.';

-- Dead stock. With lot-level SKUs, age is unambiguous: the item was
-- created at intake and has existed only since then.
create or replace view dead_stock
with (security_invoker = true) as
select *
from stock_valuation
where days_on_hand >= 90
order by days_on_hand desc, cost_value_paise desc;

comment on view dead_stock is
  'Ninety days and older, worst first. Cross-lot design performance is '
  'not answerable in v1 by design; that arrives with v2 grouping.';

-- Vendor quality signal. Reason codes on returns are what make this
-- answerable at all.
create or replace view vendor_return_summary
with (security_invoker = true) as
select
  v.id                            as vendor_id,
  v.name                          as vendor,
  l.reason,
  count(*)                        as line_count,
  sum(l.qty)                      as qty_returned
from vendor_returns r
join vendors v            on v.id = r.vendor_id
join vendor_return_lines l on l.vendor_return_id = r.id
where r.status = 'approved'
group by v.id, v.name, l.reason;
