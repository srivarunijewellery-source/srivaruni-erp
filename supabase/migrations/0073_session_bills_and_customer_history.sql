-- Bills rung on ONE session.
--
-- Staff have no route to the Sales screen and should not: it shows every
-- branch and every day. What they need is narrow -- find the bill from
-- twenty minutes ago and print it again because the printer chewed the
-- first one. Scoping to the session means closing the register takes the
-- list away with it.
create or replace function session_bills(p_session uuid)
returns table (
  bill_id uuid, bill_no text, rung_at timestamptz, status text,
  customer_name text, customer_phone text, sold_by_name text,
  items integer, total_paise bigint, payment_mode text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, b.bill_no, coalesce(b.finalised_at, b.rung_at, b.created_at),
         b.status, c.name, c.phone, s.name,
         (select coalesce(sum(qty), 0)::int from bill_lines where bill_id = b.id),
         b.total_paise, b.payment_mode
  from bills b
  left join customers c on c.id = b.customer_id
  left join staff s     on s.id = b.sold_by
  where b.session_id = p_session
    and b.status in ('final','cancelled')
    and current_staff_id() is not null
  order by coalesce(b.finalised_at, b.rung_at, b.created_at) desc;
$$;

-- Item-level purchase history. "What did she buy last time" is the
-- question actually asked at the counter, and a list of bill totals
-- cannot answer it.
create or replace function customer_items(p_customer uuid, p_limit integer default 200)
returns table (
  bill_id uuid, bill_no text, bill_date date, bill_status text,
  location_code text, item_id uuid, item_name text, barcode text,
  category text, qty integer, unit_price_paise bigint,
  discount_paise bigint, line_total_paise bigint, sold_by_name text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.id, b.bill_no, b.bill_date, b.status, l.code,
         i.id, i.name, i.barcode, c.name,
         bl.qty, bl.unit_price_paise, bl.discount_paise, bl.line_total_paise,
         s.name
  from bill_lines bl
  join bills b       on b.id = bl.bill_id
  join items i       on i.id = bl.item_id
  left join categories c on c.id = i.category_id
  left join locations  l on l.id = b.location_id
  left join staff      s on s.id = coalesce(bl.sold_by, b.sold_by)
  where b.customer_id = p_customer
    and b.status in ('final','cancelled')
    and current_staff_id() is not null
  order by b.bill_date desc, b.finalised_at desc nulls last, bl.line_no
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

create or replace function customer_summary(p_customer uuid)
returns table (
  bills integer, pieces integer, spent_paise bigint,
  first_visit date, last_visit date, avg_bill_paise bigint,
  favourite_category text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    count(*)::int,
    coalesce((select sum(bl.qty)::int from bill_lines bl join bills b2 on b2.id = bl.bill_id
              where b2.customer_id = p_customer and b2.status = 'final'), 0),
    coalesce(sum(b.total_paise), 0)::bigint,
    min(b.bill_date),
    max(b.bill_date),
    case when count(*) = 0 then 0
         else round(coalesce(sum(b.total_paise), 0)::numeric / count(*))::bigint end,
    (select c.name
       from bill_lines bl
       join bills b3 on b3.id = bl.bill_id
       join items i on i.id = bl.item_id
       left join categories c on c.id = i.category_id
      where b3.customer_id = p_customer and b3.status = 'final' and c.name is not null
      group by c.name
      order by sum(bl.qty) desc
      limit 1)
  from bills b
  where b.customer_id = p_customer and b.status = 'final'
    and current_staff_id() is not null;
$$;
