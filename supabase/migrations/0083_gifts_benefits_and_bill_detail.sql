-- ── What was actually given away ─────────────────────────────────────
--
-- gift_offers said what COULD be earned and allocate_gift_offers worked
-- out what a bill qualified for, but nothing recorded what physically
-- left the shop. So gifts could not be reported on, could not be seen
-- against a customer, and -- worse -- the free piece never came off
-- stock, quietly inflating on-hand counts every time one was handed
-- over.
create table if not exists bill_gifts (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references bills(id) on delete cascade,
  offer_id     uuid references gift_offers(id),
  offer_name   text not null,
  item_id      uuid references items(id),
  qty          integer not null check (qty > 0),
  -- What the piece cost us. A gift is a real cost at zero revenue, and
  -- this is the only place it can be measured.
  cost_paise   bigint not null default 0,
  location_id  uuid references locations(id),
  customer_id  uuid references customers(id),
  created_by   uuid references staff(id),
  created_at   timestamptz not null default now()
);

create index if not exists bill_gifts_bill_idx     on bill_gifts (bill_id);
create index if not exists bill_gifts_customer_idx on bill_gifts (customer_id, created_at desc);
create index if not exists bill_gifts_offer_idx    on bill_gifts (offer_id);

alter table bill_gifts enable row level security;
create policy bill_gifts_read on bill_gifts
  for select using (current_staff_id() is not null);

create or replace function record_bill_gifts(p_bill uuid, p_gifts jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_b bills%rowtype; v_g jsonb; v_qty int; v_item uuid;
  v_cost bigint; v_n int := 0;
begin
  if current_staff_id() is null then raise exception 'Not signed in.'; end if;
  if jsonb_array_length(coalesce(p_gifts, '[]'::jsonb)) = 0 then
    return jsonb_build_object('recorded', 0);
  end if;

  select * into v_b from bills where id = p_bill;
  if not found then raise exception 'No such bill.'; end if;

  for v_g in select * from jsonb_array_elements(p_gifts) loop
    v_qty  := greatest(0, coalesce((v_g->>'qty')::int, 0));
    v_item := nullif(v_g->>'item_id', '')::uuid;
    if v_qty = 0 then continue; end if;

    -- Landed cost, read through the owner-only view. A staff session
    -- gets nothing and records zero, which is the right failure: the
    -- gift is still recorded, only its cost is unknown to them.
    select coalesce(landed_cost_paise, 0) into v_cost
    from item_latest_cost where item_id = v_item;

    insert into bill_gifts (bill_id, offer_id, offer_name, item_id, qty,
                            cost_paise, location_id, customer_id, created_by)
    values (p_bill, nullif(v_g->>'offer_id', '')::uuid,
            coalesce(v_g->>'offer_name', 'Gift'), v_item, v_qty,
            coalesce(v_cost, 0) * v_qty, v_b.location_id, v_b.customer_id,
            current_staff_id());

    -- The free piece leaves the shelf like any other.
    if v_item is not null then
      insert into stock_ledger (item_id, location_id, qty_delta, reason,
                                ref_type, ref_id, created_by, note)
      values (v_item, v_b.location_id, -v_qty, 'sale'::stock_reason,
              'bill_gift', p_bill, current_staff_id(),
              'Gift on ' || v_b.bill_no);
    end if;

    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('recorded', v_n);
end $$;

-- Every cut given, across all three families, in one list.
create or replace function dash_benefits_given(
  p_from date, p_to date, p_location uuid default null
)
returns table (
  kind text, name text, bill_id uuid, bill_no text, bill_date date,
  customer_id uuid, customer_name text, customer_phone text,
  location_code text, staff_name text,
  value_paise bigint, cost_paise bigint
)
language sql stable security definer set search_path to 'public'
as $$
  select 'coupon', coalesce(cb.name, c.code), b.id, b.bill_no, b.bill_date,
         b.customer_id, cu.name, cu.phone, l.code, s.name,
         b.coupon_discount_paise, 0::bigint
  from bills b
  join coupons c on c.id = b.coupon_id
  left join coupon_batches cb on cb.id = c.batch_id
  left join customers cu on cu.id = b.customer_id
  left join locations l on l.id = b.location_id
  left join staff s on s.id = b.sold_by
  where b.status = 'final' and b.coupon_id is not null
    and b.bill_date between p_from and p_to
    and (p_location is null or b.location_id = p_location) and is_owner()
  union all
  select 'discount',
         case when coalesce(b.scheme_discount_paise, 0) > 0 then 'Scheme' else 'Manual' end,
         b.id, b.bill_no, b.bill_date,
         b.customer_id, cu.name, cu.phone, l.code, s.name,
         (coalesce(b.manual_discount_paise, 0) + coalesce(b.scheme_discount_paise, 0))::bigint,
         0::bigint
  from bills b
  left join customers cu on cu.id = b.customer_id
  left join locations l on l.id = b.location_id
  left join staff s on s.id = b.sold_by
  where b.status = 'final'
    and coalesce(b.manual_discount_paise, 0) + coalesce(b.scheme_discount_paise, 0) > 0
    and b.bill_date between p_from and p_to
    and (p_location is null or b.location_id = p_location) and is_owner()
  union all
  -- A gift's "value" is what the piece would have sold for; its cost is
  -- what it cost us. Those are very different numbers.
  select 'gift', g.offer_name, b.id, b.bill_no, b.bill_date,
         b.customer_id, cu.name, cu.phone, l.code, s.name,
         (coalesce(i.selling_price_paise, i.mrp_paise, 0) * g.qty)::bigint,
         g.cost_paise
  from bill_gifts g
  join bills b on b.id = g.bill_id
  left join items i on i.id = g.item_id
  left join customers cu on cu.id = b.customer_id
  left join locations l on l.id = b.location_id
  left join staff s on s.id = b.sold_by
  where b.status = 'final'
    and b.bill_date between p_from and p_to
    and (p_location is null or b.location_id = p_location) and is_owner()
  order by 5 desc, 1;
$$;

-- Not owner-gated: the counter should be able to say "you already had
-- the free bangles in June" without opening the books.
create or replace function customer_gifts(p_customer uuid)
returns table (
  bill_id uuid, bill_no text, bill_date date,
  offer_name text, item_name text, qty integer
)
language sql stable security definer set search_path to 'public'
as $$
  select b.id, b.bill_no, b.bill_date, g.offer_name, i.name, g.qty
  from bill_gifts g
  join bills b on b.id = g.bill_id
  left join items i on i.id = g.item_id
  where g.customer_id = p_customer and b.status = 'final'
    and current_staff_id() is not null
  order by b.bill_date desc;
$$;

-- ── One bill, in full ────────────────────────────────────────────────
--
-- Bill numbers were printed all over the app -- sales lists, returns,
-- credit notes, the counter -- and none of them led anywhere, because
-- there was no bill page to lead to.
create or replace function bill_detail(p_bill uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select case when current_staff_id() is null then null else
    jsonb_build_object(
      'bill', (select to_jsonb(x) from (
          select b.id, b.bill_no, b.bill_date, b.status, b.payment_mode,
                 b.gross_paise, b.discount_paise, b.manual_discount_paise,
                 b.scheme_discount_paise, b.coupon_discount_paise,
                 b.taxable_paise, b.cgst_paise, b.sgst_paise, b.igst_paise,
                 b.total_paise, b.is_interstate, b.note, b.edit_reason,
                 b.finalised_at, b.rung_at,
                 b.replaces_bill_id, b.replaced_by_bill_id,
                 (select bill_no from bills p where p.id = b.replaces_bill_id) as replaces_no,
                 (select bill_no from bills n where n.id = b.replaced_by_bill_id) as replaced_by_no,
                 b.customer_id, c.name as customer_name, c.phone as customer_phone,
                 l.code as location_code, l.name as location_name,
                 s.name as sold_by_name,
                 b.session_id, r.status as session_status, r.terminal
          from bills b
          left join customers c on c.id = b.customer_id
          left join locations l on l.id = b.location_id
          left join staff s on s.id = b.sold_by
          left join register_sessions r on r.id = b.session_id
          where b.id = p_bill) x),
      'lines', coalesce((select jsonb_agg(to_jsonb(y) order by y.line_no) from (
          select bl.id, bl.line_no, bl.item_id, i.name as item_name,
                 i.barcode, bl.qty, bl.unit_price_paise,
                 bl.discount_paise, bl.line_total_paise, bl.gst_rate,
                 (select storage_path from item_photos ip where ip.item_id = i.id
                   order by ip.is_primary desc, ip.sort_order limit 1) as photo_path,
                 (select coalesce(sum(rl.qty), 0) from sales_return_lines rl
                   where rl.bill_line_id = bl.id) as returned_qty
          from bill_lines bl join items i on i.id = bl.item_id
          where bl.bill_id = p_bill) y), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(z)) from (
          select bp.method, bp.amount_paise, bp.reference
          from bill_payments bp where bp.bill_id = p_bill) z), '[]'::jsonb),
      'gifts', coalesce((select jsonb_agg(to_jsonb(g)) from (
          select bg.offer_name, bg.qty, it.name as item_name
          from bill_gifts bg left join items it on it.id = bg.item_id
          where bg.bill_id = p_bill) g), '[]'::jsonb),
      'returns', coalesce((select jsonb_agg(to_jsonb(rr)) from (
          select sr.id, sr.return_no, sr.return_date, sr.total_paise,
                 (select note_no from customer_credit_notes cn
                   where cn.source_return_id = sr.id limit 1) as credit_note_no
          from sales_returns sr where sr.bill_id = p_bill) rr), '[]'::jsonb)
    ) end;
$$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'record_bill_gifts(uuid, jsonb)',
    'dash_benefits_given(date, date, uuid)',
    'customer_gifts(uuid)',
    'bill_detail(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end $$;
