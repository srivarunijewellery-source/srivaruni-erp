\set ON_ERROR_STOP on
\pset pager off

\set OWNER '''0a000000-0000-4000-8000-000000000001'''
\set STAFF '''0a000000-0000-4000-8000-000000000002'''

-- The dev seed gives us: owner SB, staff_test, a Zaheerabad manager,
-- one registered Jaipur vendor and one unregistered local vendor.

\echo '=== accounts wired up ==='
select s.name, s.role, l.code as location,
       (s.auth_user_id is not null) as has_login
from staff s left join locations l on l.id = s.home_location_id
order by s.role, s.name;

-- =====================================================================
-- PART 1: staff raises an inward, owner prices and approves it
-- =====================================================================

set request.jwt.claim.sub = :STAFF;

insert into inwards (id, doc_no, location_id, vendor_id, created_by,
                     vendor_invoice_no, vendor_invoice_date)
values ('0e000000-0000-4000-8000-000000000001',
        next_inward_doc_no((select id from locations where code='BOD')),
        (select id from locations where code='BOD'),
        '0c000000-0000-4000-8000-000000000001',
        '0b000000-0000-4000-8000-000000000002',
        'JIH/26/1188', current_date);

-- Staff creates items. No cost anywhere in this insert.
insert into items (id, name, category_id, colour_id, plating_id, created_by)
select v.id, v.nm,
       (select id from categories where name = v.cat),
       (select id from attribute_options where attr_key='colour'  and value='Antique Gold'),
       (select id from attribute_options where attr_key='plating' and value='1 Gram Gold'),
       '0b000000-0000-4000-8000-000000000002'
from (values
  ('0f000000-0000-4000-8000-000000000001'::uuid,'Temple Lakshmi Short Neck Set','Short Neck Set'),
  ('0f000000-0000-4000-8000-000000000002'::uuid,'Antique Jhumka Medium',        'Earrings'),
  ('0f000000-0000-4000-8000-000000000003'::uuid,'Kundan Maang Tikka',           'Maang Tikka'),
  ('0f000000-0000-4000-8000-000000000004'::uuid,'Ruby Bangles Set of 4',        'Bangles'),
  ('0f000000-0000-4000-8000-000000000005'::uuid,'Oxidised Anklet Pair',         'Anklets')
) as v(id, nm, cat);

insert into inward_lines (inward_id, item_id, qty, line_no) values
  ('0e000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000001', 7,1),
  ('0e000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000002',13,2),
  ('0e000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000003', 3,3),
  ('0e000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000004',12,4),
  ('0e000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000005',20,5);

insert into inward_attachments (inward_id, storage_path)
values ('0e000000-0000-4000-8000-000000000001','inwards/jih-1188.jpg');

\echo ''
\echo '--- staff submits (allowed: own location)'
select submit_inward('0e000000-0000-4000-8000-000000000001');

\echo '--- staff CANNOT approve their own inward'
do $$ begin
  perform approve_inward('0e000000-0000-4000-8000-000000000001');
  raise exception 'FAILED: staff approved an inward';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

set request.jwt.claim.sub = :OWNER;

insert into inward_line_costs (inward_line_id, rate_paise, gst_rate)
select l.id,
       case l.line_no when 1 then 45000 when 2 then 12500 when 3 then 33300
                      when 4 then 28000 else 9000 end,
       3.00
from inward_lines l where l.inward_id = '0e000000-0000-4000-8000-000000000001';

insert into inward_additional_costs (inward_id, cost_type, amount_paise, basis) values
  ('0e000000-0000-4000-8000-000000000001','freight',100000,'value'),
  ('0e000000-0000-4000-8000-000000000001','packing',  7777,'quantity');

update items set mrp_paise = 150000, selling_price_paise = 129900
where id in ('0f000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000002',
             '0f000000-0000-4000-8000-000000000003','0f000000-0000-4000-8000-000000000004',
             '0f000000-0000-4000-8000-000000000005');

\echo '--- owner approves: stock posts, items go active'
select approve_inward('0e000000-0000-4000-8000-000000000001');

select i.name, sv.qty, sv.landed_cost_paise, sv.cost_value_paise, sv.retail_value_paise
from stock_valuation sv join items i on i.id = sv.item_id
order by i.name;

\echo '--- freight + packing must total exactly 107777 paise'
select sum(c.allocated_addl_paise) = 107777 as proration_exact
from inward_lines l join inward_line_costs c on c.inward_line_id = l.id
where l.inward_id = '0e000000-0000-4000-8000-000000000001';

-- =====================================================================
-- PART 2: transfer request -> approved -> dispatched -> received
-- =====================================================================

\echo ''
\echo '=== PART 2: transfer workflow ==='

set request.jwt.claim.sub = :STAFF;

\echo '--- any staff member can RAISE a request'
select request_transfer(
  (select id from locations where code='BOD'),
  (select id from locations where code='ZHB'),
  'Zaheerabad opening stock'
) as transfer_id \gset

select doc_no, status, reason from transfers where id = :'transfer_id';

insert into transfer_lines (transfer_id, item_id, qty_sent) values
  (:'transfer_id','0f000000-0000-4000-8000-000000000001',3),
  (:'transfer_id','0f000000-0000-4000-8000-000000000004',5);

\echo '--- staff CANNOT approve'
do $$ begin
  perform approve_transfer(current_setting('my.tid')::uuid);
exception when others then raise notice 'OK: %', sqlerrm;
end $$;
select set_config('my.tid', :'transfer_id', false);
do $$ begin
  perform approve_transfer(current_setting('my.tid')::uuid);
  raise exception 'FAILED: staff approved a transfer';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- cannot dispatch before approval'
set request.jwt.claim.sub = :OWNER;
do $$ begin
  perform dispatch_transfer(current_setting('my.tid')::uuid);
  raise exception 'FAILED: dispatched an unapproved transfer';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- cannot approve more than is on hand'
do $$
declare v uuid;
begin
  v := request_transfer(
    (select id from locations where code='BOD'),
    (select id from locations where code='ZHB'), 'Over-request test');
  insert into transfer_lines (transfer_id, item_id, qty_sent)
  values (v, '0f000000-0000-4000-8000-000000000003', 99);
  perform approve_transfer(v);
  raise exception 'FAILED: approved beyond stock on hand';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- owner approves the real one'
select approve_transfer(:'transfer_id');
select status, (approved_at is not null) as approved from transfers where id = :'transfer_id';

\echo '--- dispatch: stock leaves BOD and sits in TRANSIT'
select dispatch_transfer(:'transfer_id');
select l.code, b.qty
from stock_balances b join locations l on l.id = b.location_id
where b.item_id = '0f000000-0000-4000-8000-000000000004' and b.qty <> 0
order by l.code;

\echo '--- a dispatched transfer can no longer be cancelled'
do $$ begin
  perform cancel_transfer(current_setting('my.tid')::uuid, 'changed mind');
  raise exception 'FAILED: cancelled stock already in transit';
exception when others then raise notice 'OK: %', sqlerrm;
end $$;

\echo '--- receive short: 5 sent, only 4 arrive'
update transfer_lines set qty_received = 4
where transfer_id = :'transfer_id' and item_id = '0f000000-0000-4000-8000-000000000004';

select receive_transfer(:'transfer_id');

select l.code, b.qty
from stock_balances b join locations l on l.id = b.location_id
where b.item_id = '0f000000-0000-4000-8000-000000000004' and b.qty <> 0
order by l.code;

\echo '--- the missing unit is logged, not silently absorbed'
select reason, qty_delta, note
from stock_ledger
where ref_id = :'transfer_id' and reason = 'count_variance';

\echo ''
\echo '=== pipeline ==='
select doc_no, status, from_code, to_code, lines, qty_sent, qty_received
from transfer_pipeline order by requested_at;
