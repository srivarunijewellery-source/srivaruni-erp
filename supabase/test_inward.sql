\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------- setup
insert into staff (id, auth_user_id, name, role, home_location_id)
values (
  '11111111-1111-1111-1111-111111111111',
  '99999999-9999-9999-9999-999999999999',
  'SB (Owner)', 'owner',
  (select id from locations where code = 'BOD')
);

-- Act as the owner for the rest of this script.
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';

select 'is_owner() -> ' || is_owner()::text as check_auth;

-- Two vendors: one Jaipur registered (interstate, IGST, input credit),
-- one local unregistered (no tax at all).
insert into vendors (id, name, gst_status, gstin, city) values
  ('22222222-2222-2222-2222-222222222222', 'Jaipur Wholesaler',  'registered', '08AAACJ1234A1ZQ', 'Jaipur'),
  ('33333333-3333-3333-3333-333333333333', 'Local Supplier',     'unregistered', null, 'Hyderabad');

select name, gst_status, gstin, state_code from vendors order by name;

-- =====================================================================
-- CASE 1: Registered Jaipur vendor. Interstate -> IGST. Cost ex-GST.
-- 3 lines, freight 1000.00 prorated by value.
-- =====================================================================

insert into inwards (id, doc_no, location_id, vendor_id, created_by, vendor_invoice_no, vendor_invoice_date)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        next_inward_doc_no((select id from locations where code='BOD')),
        (select id from locations where code='BOD'),
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'JW/2026/455', current_date);

-- Staff creates items. No cost fields anywhere in this insert.
insert into items (id, name, category_id, colour_id, plating_id, created_by)
select v.id, v.nm,
       (select id from categories where name = v.cat),
       (select id from attribute_options where attr_key='colour'  and value='Antique Gold'),
       (select id from attribute_options where attr_key='plating' and value='1 Gram Gold'),
       '11111111-1111-1111-1111-111111111111'
from (values
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'Temple Short Neck Set Lakshmi', 'Short Neck Set'),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'Antique Earrings Medium',       'Earrings'),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'Kundan Maang Tikka',          'Maang Tikka')
) as v(id, nm, cat);

select barcode, name, status, mrp_paise from items order by barcode;

insert into inward_lines (inward_id, item_id, qty, line_no) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 7,  1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 13, 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 3,  3);

insert into inward_attachments (inward_id, storage_path)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'inwards/jw-455-invoice.jpg');

select submit_inward('aaaaaaaa-0000-0000-0000-000000000001');

-- Owner enters rates at approval. Note the awkward freight figure and
-- prime quantities: this is where naive proration drifts.
insert into inward_line_costs (inward_line_id, rate_paise, gst_rate)
select l.id,
       case l.line_no when 1 then 45000 when 2 then 12500 else 33300 end,
       3.00
from inward_lines l where l.inward_id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into inward_additional_costs (inward_id, cost_type, amount_paise, basis)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'freight', 100000, 'value'),
       ('aaaaaaaa-0000-0000-0000-000000000001', 'packing',   7777, 'quantity');

update items set mrp_paise = 150000, selling_price_paise = 135000
where id in ('bbbbbbbb-0000-0000-0000-000000000001',
             'bbbbbbbb-0000-0000-0000-000000000002',
             'bbbbbbbb-0000-0000-0000-000000000003');

select approve_inward('aaaaaaaa-0000-0000-0000-000000000001');

\echo ''
\echo '=== CASE 1: registered Jaipur vendor (interstate) ==='
select i.name,
       l.qty,
       c.rate_paise,
       c.taxable_paise,
       c.cgst_paise, c.sgst_paise, c.igst_paise,
       c.allocated_addl_paise,
       c.landed_unit_cost_paise
from inward_lines l
join inward_line_costs c on c.inward_line_id = l.id
join items i on i.id = l.item_id
where l.inward_id = 'aaaaaaaa-0000-0000-0000-000000000001'
order by l.line_no;

\echo '--- interstate flag and ITC eligibility'
select tax_treatment, is_interstate, itc_eligible,
       invoice_taxable_paise, invoice_tax_paise, invoice_total_paise
from inward_header_costs where inward_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- proration must sum EXACTLY to 100000 + 7777 = 107777'
select sum(c.allocated_addl_paise) as allocated_total,
       107777 as expected,
       (sum(c.allocated_addl_paise) = 107777) as exact_match
from inward_lines l
join inward_line_costs c on c.inward_line_id = l.id
where l.inward_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- items now active, stock posted'
select i.name, i.status, b.qty, loc.code
from items i
join stock_balances b on b.item_id = i.id
join locations loc on loc.id = b.location_id
where i.id in ('bbbbbbbb-0000-0000-0000-000000000001',
               'bbbbbbbb-0000-0000-0000-000000000002',
               'bbbbbbbb-0000-0000-0000-000000000003')
order by i.name;

-- =====================================================================
-- CASE 2: Unregistered vendor. Zero tax anywhere. Full amount is cost.
-- =====================================================================

insert into inwards (id, doc_no, location_id, vendor_id, created_by, vendor_invoice_no)
values ('aaaaaaaa-0000-0000-0000-000000000002',
        next_inward_doc_no((select id from locations where code='BOD')),
        (select id from locations where code='BOD'),
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        'Cash Bill 12');

insert into items (id, name, category_id, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000004', 'Oxidised Anklet Pair',
        (select id from categories where name='Anklets'),
        '11111111-1111-1111-1111-111111111111');

insert into inward_lines (inward_id, item_id, qty, line_no)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000004', 20, 1);

insert into inward_attachments (inward_id, storage_path)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'inwards/cash-bill-12.jpg');

select submit_inward('aaaaaaaa-0000-0000-0000-000000000002');

insert into inward_line_costs (inward_line_id, rate_paise, gst_rate)
select l.id, 18000, 3.00
from inward_lines l where l.inward_id = 'aaaaaaaa-0000-0000-0000-000000000002';

update items set mrp_paise = 60000, selling_price_paise = 49900
where id = 'bbbbbbbb-0000-0000-0000-000000000004';

select approve_inward('aaaaaaaa-0000-0000-0000-000000000002');

\echo ''
\echo '=== CASE 2: unregistered vendor, tax must be ZERO ==='
select h.tax_treatment, h.itc_eligible, h.invoice_tax_paise,
       c.rate_paise, c.taxable_paise, c.cgst_paise, c.sgst_paise, c.igst_paise,
       c.landed_unit_cost_paise
from inwards i
join inward_header_costs h on h.inward_id = i.id
join inward_lines l on l.inward_id = i.id
join inward_line_costs c on c.inward_line_id = l.id
where i.id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- =====================================================================
-- CASE 3: integrity guards
-- =====================================================================

\echo ''
\echo '=== CASE 3: guards ==='

\echo '--- ledger must reject UPDATE'
do $$
begin
  update stock_ledger set qty_delta = 999 where id = 1;
  raise exception 'FAILED: ledger allowed an update';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- stock must not go negative'
do $$
begin
  insert into stock_ledger (item_id, location_id, qty_delta, reason)
  values ('bbbbbbbb-0000-0000-0000-000000000003',
          (select id from locations where code='BOD'), -500, 'sale');
  raise exception 'FAILED: negative stock allowed';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- an item cannot go active without a price'
do $$
begin
  insert into items (name, category_id, status)
  values ('Unpriced', (select id from categories limit 1), 'active');
  raise exception 'FAILED: unpriced item went active';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- a registered vendor cannot exist without a GSTIN'
do $$
begin
  insert into vendors (name, gst_status) values ('Bad Vendor', 'registered');
  raise exception 'FAILED: registered vendor with no GSTIN';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- a colour_id cannot point at a plating value'
do $$
begin
  insert into items (name, category_id, colour_id)
  values ('Bad Attr', (select id from categories limit 1),
          (select id from attribute_options where attr_key='plating' and value='Rhodium'));
  raise exception 'FAILED: cross-attribute reference allowed';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- cannot submit an inward with no invoice photo'
do $$
declare v uuid;
begin
  insert into inwards (doc_no, location_id, vendor_id, created_by)
  values ('TEST-NOPHOTO', (select id from locations where code='BOD'),
          '33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111')
  returning id into v;
  insert into items (id, name, category_id)
  values ('bbbbbbbb-0000-0000-0000-00000000000f', 'Photo Test',
          (select id from categories where name='Finger Rings'));
  insert into inward_lines (inward_id, item_id, qty)
  values (v, 'bbbbbbbb-0000-0000-0000-00000000000f', 1);
  perform submit_inward(v);
  raise exception 'FAILED: submitted with no invoice photo';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== proration stress: 1 paisa across 37 lines, and 99991 across 7 ==='
select allocate_paise(1, array_fill(100::bigint, array[37])) as one_paisa_37_lines;
select (select sum(x) from unnest(allocate_paise(99991, array[3,1,4,1,5,9,2]::bigint[])) x) as must_be_99991;
select allocate_paise(0, array[5,5]::bigint[]) as zero_total;
select allocate_paise(500, array[0,0,0]::bigint[]) as zero_weights_even_split;

-- =====================================================================
-- CASE 4: the no-reuse rule must be structural, not a UI convention
-- =====================================================================

\echo ''
\echo '=== CASE 4: an item can never be inwarded twice ==='

do $$
declare v uuid;
begin
  insert into inwards (doc_no, location_id, vendor_id, created_by)
  values ('TEST-REUSE', (select id from locations where code='BOD'),
          '33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111')
  returning id into v;

  -- Attempt a quantity top-up on an already-inwarded SKU.
  insert into inward_lines (inward_id, item_id, qty)
  values (v, 'bbbbbbbb-0000-0000-0000-000000000001', 5);

  raise exception 'FAILED: an existing SKU accepted a second inward';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- the same item twice inside one inward is also blocked'
do $$
declare v uuid;
begin
  insert into inwards (doc_no, location_id, vendor_id, created_by)
  values ('TEST-DUPLINE', (select id from locations where code='BOD'),
          '33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111')
  returning id into v;

  insert into items (id, name, category_id)
  values ('bbbbbbbb-0000-0000-0000-000000000009', 'Dup Test',
          (select id from categories where name='Finger Rings'));

  insert into inward_lines (inward_id, item_id, qty)
  values (v, 'bbbbbbbb-0000-0000-0000-000000000009', 2);
  insert into inward_lines (inward_id, item_id, qty)
  values (v, 'bbbbbbbb-0000-0000-0000-000000000009', 3);

  raise exception 'FAILED: duplicate line accepted';
exception when others then
  raise notice 'OK: %', sqlerrm;
end $$;

\echo ''
\echo '=== valuation is exact, no costing method required ==='
select name, category, location_code, qty,
       landed_cost_paise, cost_value_paise, retail_value_paise, margin_paise
from stock_valuation
order by name;

\echo '--- totals'
select count(*) as skus,
       sum(qty) as pieces,
       sum(cost_value_paise) as cost_value_paise,
       sum(retail_value_paise) as retail_value_paise
from stock_valuation;
