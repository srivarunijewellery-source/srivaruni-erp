-- =====================================================================
-- 0044_transit_views.sql
--
-- Gives in-transit stock a surface of its own.
--
-- The transit bucket is excluded from stock_on_hand by design, so
-- without these views a box on a bus simply looks like stock that
-- vanished. Everything here belongs to NO location and is sellable
-- nowhere until the receiving store confirms.
-- =====================================================================

create or replace view public.stock_in_transit as
select
  t.id                                    as transfer_id,
  t.doc_no,
  i.id                                    as item_id,
  i.barcode,
  i.name                                  as item_name,
  c.name                                  as category,
  it.name                                 as item_type,
  i.selling_price_paise,
  l.qty_sent                              as qty,
  fl.id                                   as from_location_id,
  fl.code                                 as from_code,
  fl.name                                 as from_name,
  tl.id                                   as to_location_id,
  tl.code                                 as to_code,
  tl.name                                 as to_name,
  trn.code                                as holding_code,
  t.courier,
  t.docket_no,
  t.dispatched_at,
  (now() - t.dispatched_at)               as age,
  floor(extract(epoch from now() - t.dispatched_at) / 86400)::int as days_in_transit,
  null::uuid                              as location_id,
  'in_transit'::text                      as allocation
from transfers t
join transfer_lines l on l.transfer_id = t.id and l.qty_sent > 0
join items i          on i.id = l.item_id
join categories c     on c.id = i.category_id
left join item_types it on it.id = i.item_type_id
join locations fl     on fl.id = t.from_location_id
join locations tl     on tl.id = t.to_location_id
left join locations trn on trn.id = t.transit_location_id
where t.status = 'dispatched';

comment on view public.stock_in_transit is
  'Units that have left the sending store but have not been received anywhere. '
  'location_id is deliberately NULL: this stock belongs to no store, is not '
  'sellable, and is excluded from stock_on_hand. It is a transient state that '
  'nets to zero the moment the transfer is received.';

create or replace view public.transit_summary as
select
  t.id                                 as transfer_id,
  t.doc_no,
  fl.code                              as from_code,
  tl.code                              as to_code,
  count(l.id)                          as lines,
  coalesce(sum(l.qty_sent), 0)::int    as qty_in_transit,
  coalesce(sum(l.qty_sent * i.selling_price_paise), 0)::bigint as value_paise,
  t.courier,
  t.docket_no,
  t.dispatched_at,
  floor(extract(epoch from now() - t.dispatched_at) / 86400)::int as days_in_transit,
  case when now() - t.dispatched_at > interval '3 days' then true else false end as overdue
from transfers t
join transfer_lines l on l.transfer_id = t.id and l.qty_sent > 0
join items i          on i.id = l.item_id
join locations fl     on fl.id = t.from_location_id
join locations tl     on tl.id = t.to_location_id
where t.status = 'dispatched'
group by t.id, t.doc_no, fl.code, tl.code, t.courier, t.docket_no, t.dispatched_at;

comment on view public.transit_summary is
  'One row per box currently on the road. Drives the In Transit dashboard card.';

-- A standing invariant, not a report. Transit must always be explained by
-- an open transfer; anything else means units are stranded, which is the
-- bug class that cost us a phantom unit during end-to-end testing.
create or replace view public.transit_reconciliation as
with ledger as (
  select b.item_id, sum(b.qty)::int as qty_in_bucket
  from stock_balances b
  join locations loc on loc.id = b.location_id
  where loc.kind = 'transit' and b.qty <> 0
  group by b.item_id
),
expected as (
  select l.item_id, sum(l.qty_sent)::int as qty_expected
  from transfers t
  join transfer_lines l on l.transfer_id = t.id and l.qty_sent > 0
  where t.status = 'dispatched'
  group by l.item_id
)
select
  coalesce(le.item_id, e.item_id)          as item_id,
  i.barcode,
  i.name                                   as item_name,
  coalesce(le.qty_in_bucket, 0)            as qty_in_bucket,
  coalesce(e.qty_expected, 0)              as qty_expected,
  coalesce(le.qty_in_bucket, 0) - coalesce(e.qty_expected, 0) as stranded
from ledger le
full join expected e on e.item_id = le.item_id
join items i on i.id = coalesce(le.item_id, e.item_id)
where coalesce(le.qty_in_bucket, 0) <> coalesce(e.qty_expected, 0);

comment on view public.transit_reconciliation is
  'Should always be empty. Any row means units are stranded in the transit '
  'bucket with no open transfer explaining them, or vice versa.';
