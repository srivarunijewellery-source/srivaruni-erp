-- =====================================================================
-- 0047_pickable_stock_filters.sql
--
-- Read functions for the request-builder screen: category, item type,
-- plating, "days since this item last arrived at this store", and an
-- in-stock toggle. Both run security invoker (the default), so they
-- execute as the calling user and RLS applies exactly as it would to a
-- hand-written select -- nothing here bypasses row security.
--
-- These are functions rather than plain queries because the age filter
-- needs a lateral join against stock_ledger per row, which is not
-- expressible through the query builder without pulling every ledger
-- row for every item client-side.
-- =====================================================================

create or replace function public.list_pickable_stock(
  p_location uuid,
  p_query text default null,
  p_category text default null,
  p_item_type text default null,
  p_plating text default null,
  p_in_stock_only boolean default true,
  p_min_age_days int default null,
  p_limit int default 200
)
returns table (
  item_id uuid, barcode text, name text, category text, item_type text, plating text,
  photo_path text, selling_price_paise bigint, qty_available int, age_days int
)
language sql stable security invoker set search_path = public
as $function$
  select
    i.id, i.barcode, i.name, c.name, it.name, ao.value,
    (select p.storage_path from item_photos p
       where p.item_id = i.id order by p.is_primary desc, p.sort_order limit 1),
    i.selling_price_paise,
    coalesce(sb.qty, 0)::int,
    case when ag.last_in is null then null
         else floor(extract(epoch from now() - ag.last_in) / 86400)::int end
  from items i
  join categories c on c.id = i.category_id
  left join item_types it on it.id = i.item_type_id
  left join attribute_options ao on ao.id = i.plating_id
  left join stock_balances sb on sb.item_id = i.id and sb.location_id = p_location
  left join lateral (
    select max(sl.created_at) as last_in
    from stock_ledger sl
    where sl.item_id = i.id and sl.location_id = p_location and sl.qty_delta > 0
  ) ag on true
  where i.status = 'active'
    and (not p_in_stock_only or coalesce(sb.qty, 0) > 0)
    and (p_category is null or c.name = p_category)
    and (p_item_type is null or it.name = p_item_type)
    and (p_plating is null or ao.value = p_plating)
    and (p_min_age_days is null or ag.last_in is null
         or now() - ag.last_in >= (p_min_age_days || ' days')::interval)
    and (
      p_query is null or trim(p_query) = ''
      or i.barcode ilike '%' || trim(p_query) || '%'
      or i.name    ilike '%' || trim(p_query) || '%'
    )
  order by i.name
  limit greatest(p_limit, 1);
$function$;

revoke execute on function public.list_pickable_stock(uuid,text,text,text,text,boolean,int,int) from public, anon;
grant  execute on function public.list_pickable_stock(uuid,text,text,text,text,boolean,int,int) to authenticated;

-- Distinct filter options actually present (in stock) at a store, so the
-- dropdown never offers a choice that returns an empty grid.
create or replace function public.list_stock_filter_options(p_location uuid)
returns table (item_types text[], platings text[], categories text[])
language sql stable security invoker set search_path = public
as $function$
  select
    array(select distinct it.name from items i join item_types it on it.id = i.item_type_id
          join stock_balances sb on sb.item_id = i.id and sb.location_id = p_location
          where sb.qty > 0 and it.name is not null order by 1),
    array(select distinct ao.value from items i join attribute_options ao on ao.id = i.plating_id
          join stock_balances sb on sb.item_id = i.id and sb.location_id = p_location
          where sb.qty > 0 and ao.value is not null order by 1),
    array(select distinct c.name from items i join categories c on c.id = i.category_id
          join stock_balances sb on sb.item_id = i.id and sb.location_id = p_location
          where sb.qty > 0 order by 1);
$function$;

revoke execute on function public.list_stock_filter_options(uuid) from public, anon;
grant  execute on function public.list_stock_filter_options(uuid) to authenticated;
