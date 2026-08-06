-- Searching and scanning the real catalogue, not the browser's copy.
--
-- pos_catalog ships every in-stock item at a location so the counter can
-- keep scanning with the network down. That copy is also what search and
-- scan were reading, which has two failures at scale: it is expensive to
-- send once the catalogue runs to thousands of SKUs, and anything with
-- no stock AT THIS BRANCH is absent from it entirely -- so a piece that
-- has just sold out here reads back as "no such tag" rather than "none
-- left". The local copy still answers instantly; this backs it.
create or replace function pos_search(
  p_location uuid,
  p_term     text,
  p_limit    integer default 30
)
returns table (
  item_id uuid, barcode text, name text, design_code text,
  category text, qty integer, price_paise bigint, mrp_paise bigint,
  gst_rate numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select i.id, i.barcode, i.name, i.design_code, c.name,
         coalesce(s.qty, 0)::int,
         coalesce(i.selling_price_paise, i.mrp_paise, 0),
         coalesce(i.mrp_paise, 0),
         coalesce(i.gst_rate, 3)
  from items i
  left join categories c on c.id = i.category_id
  left join stock_on_hand s
         on s.item_id = i.id and s.location_id = p_location
  where current_staff_id() is not null
    and coalesce(i.selling_price_paise, i.mrp_paise, 0) > 0
    and i.status <> 'discontinued'
    and (
      i.barcode     ilike '%' || btrim(p_term) || '%'
      or i.name        ilike '%' || btrim(p_term) || '%'
      or i.design_code ilike '%' || btrim(p_term) || '%'
    )
  -- What is on the shelf in front of them first.
  order by (coalesce(s.qty, 0) > 0) desc, i.name
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

do $$
begin
  revoke all on function public.pos_search(uuid, text, integer) from public, anon;
  grant execute on function public.pos_search(uuid, text, integer) to authenticated, service_role;
end $$;

-- A bill claims ONE of the three: a gift, a coupon, or a discount.
--
-- The counter was letting a coupon stack on top of a hand discount,
-- which is the one combination that can quietly hand away more than the
-- floor allows. The UI now refuses to build one, and this refuses to
-- store one. NOT VALID because a bill already in the table breaks it and
-- history is not rewritten -- the rule binds every bill from here on,
-- which is what it is for.
alter table bills
  add constraint bills_one_benefit_only
  check (
    coalesce(coupon_discount_paise, 0) = 0
    or coalesce(manual_discount_paise, 0) + coalesce(scheme_discount_paise, 0) = 0
  ) not valid;
