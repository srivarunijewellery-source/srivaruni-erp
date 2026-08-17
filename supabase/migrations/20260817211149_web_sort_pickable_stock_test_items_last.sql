create or replace function public.list_pickable_stock(p_location uuid, p_query text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_item_type text DEFAULT NULL::text, p_plating text DEFAULT NULL::text, p_in_stock_only boolean DEFAULT true, p_min_age_days integer DEFAULT NULL::integer, p_limit integer DEFAULT 60, p_stone text DEFAULT NULL::text, p_qty integer DEFAULT NULL::integer, p_exclude_categories text[] DEFAULT NULL::text[], p_exclude_stones text[] DEFAULT NULL::text[], p_exclude_platings text[] DEFAULT NULL::text[], p_offset integer DEFAULT 0, p_free_only boolean DEFAULT false)
 RETURNS TABLE(item_id uuid, barcode text, name text, category text, item_type text, plating text, stone text, photo_path text, selling_price_paise bigint, qty_available integer, age_days integer, total_count bigint, vendor text, mrp_paise bigint, landed_cost_paise bigint, committed integer, variant text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with matched as (
    -- Ids only. No photo, no ledger, no vendor: this half exists to be
    -- counted and paged, and every column added here is paid for once
    -- per matching row rather than once per displayed row.
    --
    -- barcode and is_test ride along because they are the sort key, and
    -- paging a set means the key has to exist before the LIMIT.
    select i.id, i.barcode, i.is_test,
           coalesce(sb.qty, 0)::int as qty,
           coalesce((
             select sum(case t2.status
                          when 'requested' then tl2.qty_requested
                          when 'picking'   then tl2.qty_picked
                          when 'picked'    then tl2.qty_picked
                          else tl2.qty_sent end)
             from transfer_lines tl2
             join transfers t2 on t2.id = tl2.transfer_id
             where tl2.item_id = i.id
               and t2.from_location_id = p_location
               and t2.status in ('requested','picking','picked','approved','dispatched')
           ), 0)::int as committed
    from items i
    join categories c on c.id = i.category_id
    left join item_types it on it.id = i.item_type_id
    left join attribute_options ao on ao.id = i.plating_id
    left join attribute_options st on st.id = i.stone_id
    left join stock_balances sb on sb.item_id = i.id and sb.location_id = p_location
    where i.status = 'active'
      and (not p_in_stock_only or coalesce(sb.qty, 0) > 0)
      and (p_category is null or c.name = p_category)
      and (p_item_type is null or it.name = p_item_type)
      and (p_plating is null or ao.value = p_plating)
      and (p_stone is null or st.value = p_stone)
      and (p_qty is null or coalesce(sb.qty, 0) >= p_qty)
      and (p_exclude_categories is null or c.name <> all(p_exclude_categories))
      and (p_exclude_stones is null or st.value is null or st.value <> all(p_exclude_stones))
      and (p_exclude_platings is null or ao.value is null or ao.value <> all(p_exclude_platings))
      and (
        p_query is null or trim(p_query) = ''
        or i.barcode ilike '%' || trim(p_query) || '%'
        or i.name    ilike '%' || trim(p_query) || '%'
      )
      -- Age needs the ledger, so it only runs when actually asked for.
      and (p_min_age_days is null or not exists (
        select 1 from stock_ledger sl
        where sl.item_id = i.id and sl.location_id = p_location
          and sl.qty_delta > 0
          and sl.created_at > now() - (p_min_age_days || ' days')::interval
      ))
  ),
  free as (
    select * from matched
    where not p_free_only or qty > committed
  ),
  counted as (select count(*) as n from free),
  page as (
    -- Barcode descending, newest tag first. Codes are issued in
    -- sequence, so this is creation order without depending on
    -- created_at -- which the migration stamped with the import date for
    -- thousands of pieces and is therefore not creation order at all.
    -- Unique, so paging is stable: no row on two pages, none lost.
    --
    -- is_test leads only to sink the five UAT pieces: TEST- sorts above
    -- SV in plain text order, so without this every screen opens on
    -- rehearsal stock.
    select * from free order by is_test, barcode desc
    limit greatest(p_limit, 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select p.id, i.barcode, i.name, c.name, it.name, ao.value, st.value,
         (select ph.storage_path from item_photos ph
            where ph.item_id = p.id
            order by ph.is_primary desc, ph.sort_order limit 1),
         i.selling_price_paise, p.qty,
         (select case when max(sl.created_at) is null then null
                      else floor(extract(epoch from now() - max(sl.created_at)) / 86400)::int end
            from stock_ledger sl
           where sl.item_id = p.id and sl.location_id = p_location and sl.qty_delta > 0),
         (select n from counted),
         v.name, i.mrp_paise, lc.landed_cost_paise, p.committed,
         coalesce(sz.value, col.value)
  from page p
  join items i on i.id = p.id
  join categories c on c.id = i.category_id
  left join item_types it on it.id = i.item_type_id
  left join attribute_options ao on ao.id = i.plating_id
  left join attribute_options st on st.id = i.stone_id
  left join vendor_picklist v on v.id = i.vendor_id
  left join item_latest_cost lc on lc.item_id = p.id
  left join attribute_options sz  on sz.id  = i.size_id
  left join attribute_options col on col.id = i.colour_id
  order by p.is_test, p.barcode desc;
$function$;
