create or replace function public.stock_not_in_transfer(p_location uuid DEFAULT NULL::uuid, p_categories text[] DEFAULT NULL::text[], p_styles text[] DEFAULT NULL::text[], p_category text DEFAULT NULL::text, p_style text DEFAULT NULL::text)
 RETURNS TABLE(item_id uuid, barcode text, name text, category text, style text, photo_path text, selling_price_paise bigint, qty bigint, location_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- The counterpart to the drill-down: after seeing what IS moving, the
  -- next question is always what is not, and therefore what could still
  -- be sent.
  select i.id, i.barcode, i.name, c.name, coalesce(st.value, 'Not set'),
         (select p.storage_path from item_photos p
           where p.item_id = i.id order by p.is_primary desc, p.sort_order limit 1),
         coalesce(i.selling_price_paise, 0), sb.qty::bigint, l.code
  from stock_balances sb
  join items i on i.id = sb.item_id
  join locations l on l.id = sb.location_id
  join categories c on c.id = i.category_id
  left join attribute_options st on st.id = i.stone_id
  where sb.qty > 0
    and (p_location is null or sb.location_id = p_location)
    and (p_categories is null or c.name = any(p_categories))
    and (p_styles is null or coalesce(st.value,'Not set') = any(p_styles))
    and (p_category is null or c.name = p_category)
    and (p_style is null or coalesce(st.value,'Not set') = p_style)
    and (is_owner() or sb.location_id = my_location_id())
    and not exists (
      select 1 from transfer_lines tl
      join transfers t on t.id = tl.transfer_id
      where tl.item_id = i.id
        and t.from_location_id = sb.location_id
        and t.status in ('requested','picking','picked','approved','dispatched')
    )
  -- Barcode descending: newest tag first, the same order every other
  -- item list uses. created_at was standing in for this, but the
  -- migration stamped thousands of pieces with the import date.
  -- is_test leads only to sink the UAT pieces, whose TEST- codes would
  -- otherwise sort above every SV.
  order by i.is_test, i.barcode desc, l.code;
$function$;
