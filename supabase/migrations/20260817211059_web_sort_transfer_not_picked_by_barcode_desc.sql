create or replace function public.transfer_not_picked(p_location uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_style text DEFAULT NULL::text)
 RETURNS TABLE(item_id uuid, barcode text, name text, category text, style text, photo_path text, selling_price_paise bigint, missed integer, on_shelf integer, value_paise bigint, doc_no text, reason text, from_code text, to_code text, picked_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.barcode, i.name, c.name, coalesce(st.value, 'Not set'),
         (select p.storage_path from item_photos p
           where p.item_id = i.id order by p.is_primary desc, p.sort_order limit 1),
         coalesce(i.selling_price_paise, 0),
         (tl.qty_requested - tl.qty_picked)::int,
         sb.qty::int,
         ((tl.qty_requested - tl.qty_picked) * coalesce(i.selling_price_paise, 0))::bigint,
         t.doc_no, coalesce(t.reason, ''), lf.code, lt.code,
         coalesce(t.picked_at, t.requested_at)
  from transfers t
  join transfer_lines tl on tl.transfer_id = t.id
  join items i on i.id = tl.item_id
  join categories c on c.id = i.category_id
  join locations lf on lf.id = t.from_location_id
  join locations lt on lt.id = t.to_location_id
  left join attribute_options st on st.id = i.stone_id
  -- Still on the shelf at the store it was meant to leave. A piece sold
  -- since is not recoverable and is not this report's business.
  join stock_balances sb on sb.item_id = i.id
    and sb.location_id = t.from_location_id and sb.qty > 0
  where t.status in ('picking','picked','approved','dispatched','received')
    and tl.qty_requested > tl.qty_picked
    and (p_location is null or t.from_location_id = p_location)
    and (p_category is null or c.name = p_category)
    and (p_style is null or coalesce(st.value,'Not set') = p_style)
    and (is_owner() or t.from_location_id = my_location_id()
                    or t.to_location_id = my_location_id())
  -- Barcode descending. This list is walked against the shelf, and a
  -- shelf is in code order -- ranking by value made someone criss-cross
  -- the whole rack to tick off six rows.
  order by i.barcode desc, t.doc_no;
$function$;
