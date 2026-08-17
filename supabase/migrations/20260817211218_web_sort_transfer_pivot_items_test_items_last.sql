create or replace function public.transfer_pivot_items(p_category text DEFAULT NULL::text, p_style text DEFAULT NULL::text, p_stages text[] DEFAULT NULL::text[], p_from_location uuid DEFAULT NULL::uuid, p_to_location uuid DEFAULT NULL::uuid, p_min_qty integer DEFAULT NULL::integer, p_categories text[] DEFAULT NULL::text[], p_styles text[] DEFAULT NULL::text[])
 RETURNS TABLE(item_id uuid, barcode text, name text, category text, style text, photo_path text, selling_price_paise bigint, qty bigint, stage text, doc_no text, from_code text, to_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    i.id, i.barcode, i.name, c.name, coalesce(st.value, 'Not set'),
    (select p.storage_path from item_photos p
      where p.item_id = i.id order by p.is_primary desc, p.sort_order limit 1),
    coalesce(i.selling_price_paise, 0),
    (case t.status
       when 'requested' then tl.qty_requested
       when 'picking'   then tl.qty_picked
       when 'picked'    then tl.qty_picked
       else tl.qty_sent end)::bigint,
    t.status::text, t.doc_no, lf.code, lt.code
  from transfers t
  join transfer_lines tl on tl.transfer_id = t.id
  join items i on i.id = tl.item_id
  join categories c on c.id = i.category_id
  join locations lf on lf.id = t.from_location_id
  join locations lt on lt.id = t.to_location_id
  left join attribute_options st on st.id = i.stone_id
  where t.status in ('requested','picking','picked','approved','dispatched')
    and (p_stages is null or t.status::text = any(p_stages))
    and (p_from_location is null or t.from_location_id = p_from_location)
    and (p_to_location is null or t.to_location_id = p_to_location)
    -- The chips that are ticked.
    and (p_categories is null or c.name = any(p_categories))
    and (p_styles is null or coalesce(st.value,'Not set') = any(p_styles))
    -- The one cell that was clicked, within them.
    and (p_category is null or c.name = p_category)
    and (p_style is null or coalesce(st.value,'Not set') = p_style)
    and (case t.status
           when 'requested' then tl.qty_requested
           when 'picking'   then tl.qty_picked
           when 'picked'    then tl.qty_picked
           else tl.qty_sent end) > 0
    and (is_owner() or t.from_location_id = my_location_id()
                    or t.to_location_id = my_location_id())
    and (p_min_qty is null or exists (
      select 1 from transfer_pivot(p_stages, p_from_location, p_to_location,
                                   array[c.name], array[coalesce(st.value,'Not set')],
                                   p_min_qty)))
  -- Barcode descending, then the document, so one item appearing on two
  -- open transfers stays together instead of interleaving.
  order by i.is_test, i.barcode desc, t.doc_no;
$function$;
