-- Photos on the billing screen.
--
-- Ships the storage PATH, not the image bytes -- a few dozen characters
-- per item, picked up by the browser's own image cache the same way
-- product photos already load elsewhere. The offline copy does not get
-- meaningfully heavier; the accuracy gain is that a name like "Antique
-- choker" or a design code stops being the only thing standing between
-- two different pieces at the counter.
--
-- Dropped and recreated rather than CREATE OR REPLACE: adding a column
-- changes the OUT-parameter row type, which Postgres will not allow in
-- place.
drop function if exists pos_catalog(uuid);
drop function if exists pos_search(uuid, text, integer);

create function pos_catalog(p_location uuid)
returns table (
  item_id uuid, barcode text, name text, design_code text,
  category text, qty integer, price_paise bigint, mrp_paise bigint,
  gst_rate numeric, photo_path text
)
language sql stable security definer set search_path to 'public'
as $$
  select i.id, i.barcode, i.name, i.design_code, c.name,
         coalesce(s.qty, 0)::int,
         coalesce(i.selling_price_paise, i.mrp_paise, 0),
         coalesce(i.mrp_paise, 0),
         coalesce(i.gst_rate, 3),
         p.storage_path
  from items i
  left join categories c on c.id = i.category_id
  left join stock_on_hand s
         on s.item_id = i.id and s.location_id = p_location
  left join lateral (
    select storage_path from item_photos
    where item_id = i.id
    order by is_primary desc, sort_order
    limit 1
  ) p on true
  where coalesce(i.selling_price_paise, i.mrp_paise, 0) > 0
    and coalesce(s.qty, 0) > 0
  order by i.name;
$$;

create function pos_search(
  p_location uuid, p_term text, p_limit integer default 30
)
returns table (
  item_id uuid, barcode text, name text, design_code text,
  category text, qty integer, price_paise bigint, mrp_paise bigint,
  gst_rate numeric, photo_path text
)
language sql stable security definer set search_path to 'public'
as $$
  select i.id, i.barcode, i.name, i.design_code, c.name,
         coalesce(s.qty, 0)::int,
         coalesce(i.selling_price_paise, i.mrp_paise, 0),
         coalesce(i.mrp_paise, 0),
         coalesce(i.gst_rate, 3),
         p.storage_path
  from items i
  left join categories c on c.id = i.category_id
  left join stock_on_hand s
         on s.item_id = i.id and s.location_id = p_location
  left join lateral (
    select storage_path from item_photos
    where item_id = i.id
    order by is_primary desc, sort_order
    limit 1
  ) p on true
  where current_staff_id() is not null
    and coalesce(i.selling_price_paise, i.mrp_paise, 0) > 0
    and i.status <> 'discontinued'
    and (
      i.barcode     ilike '%' || btrim(p_term) || '%'
      or i.name        ilike '%' || btrim(p_term) || '%'
      or i.design_code ilike '%' || btrim(p_term) || '%'
    )
  order by (coalesce(s.qty, 0) > 0) desc, i.name
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

do $$
begin
  revoke all on function public.pos_catalog(uuid) from public, anon;
  grant execute on function public.pos_catalog(uuid) to authenticated, service_role;
  revoke all on function public.pos_search(uuid, text, integer) from public, anon;
  grant execute on function public.pos_search(uuid, text, integer) to authenticated, service_role;
end $$;
