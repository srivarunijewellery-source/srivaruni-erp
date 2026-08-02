-- =====================================================================
-- 0063_gift_offers.sql
--
-- Threshold gifts: give an item away once a bill reaches a value.
--
-- A gift is not a discount. It leaves stock, needs a barcode scanned at
-- the counter, and shows up in the ledger -- so it gets its own table
-- rather than another value_kind on discount_schemes, which only ever
-- moves money.
--
-- STACKING: gifts stack with each other. Gifts as a GROUP are mutually
-- exclusive with coupons and with discount schemes; a bill claims one
-- benefit family. See check_benefit_combination below.
-- =====================================================================

create table if not exists gift_offers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  threshold_paise   bigint not null,
  item_id           uuid not null references items(id),
  qty               int not null default 1,
  starts_on         date not null,
  ends_on           date not null,
  active            boolean not null default true,
  location_ids      uuid[] not null default '{}',   -- empty means every store
  note              text,
  created_by        uuid references staff(id),
  created_at        timestamptz not null default now(),
  constraint gift_offer_threshold check (threshold_paise > 0),
  constraint gift_offer_qty       check (qty between 1 and 20),
  constraint gift_offer_dates     check (ends_on >= starts_on)
);

create index if not exists gift_offers_live_idx on gift_offers (threshold_paise) where active;

alter table gift_offers enable row level security;

drop policy if exists gift_offers_read on gift_offers;
create policy gift_offers_read on gift_offers
  for select using (current_staff_id() is not null);

-- Gifts commit real stock, so writing them is manager-and-above.
drop policy if exists gift_offers_write on gift_offers;
create policy gift_offers_write on gift_offers
  for all using (is_manager_or_above()) with check (is_manager_or_above());

create or replace function public.evaluate_gift_offers(
  p_bill_paise bigint, p_location uuid default null, p_on date default null)
returns table (
  offer_id uuid, name text, threshold_paise bigint,
  item_id uuid, item_name text, barcode text, qty int)
language sql stable security invoker set search_path = public
as $function$
  -- INDEPENDENT thresholds: every offer the bill clears is earned, so a
  -- 5,000 gift and a 10,000 gift are BOTH earned at 10,000 -- the bill is
  -- not "spent" by the first gift it qualifies for.
  --
  -- The alternative reading is cumulative, where the two together need
  -- 15,000 because 5,000 + 10,000 is consumed. That is a different and
  -- more restrictive promise; it is a one-line change here if intended.
  select g.id, g.name, g.threshold_paise, g.item_id, i.name, i.barcode, g.qty
  from gift_offers g
  join items i on i.id = g.item_id
  where g.active
    and p_bill_paise >= g.threshold_paise
    and coalesce(p_on, current_date) between g.starts_on and g.ends_on
    and (cardinality(g.location_ids) = 0 or p_location is null or p_location = any(g.location_ids))
  order by g.threshold_paise;
$function$;

revoke execute on function public.evaluate_gift_offers(bigint, uuid, date) from public, anon;
grant  execute on function public.evaluate_gift_offers(bigint, uuid, date) to authenticated;

-- One place that states which benefits combine, so the billing screen
-- cannot quietly invent its own answer later.
create or replace function public.check_benefit_combination(
  p_has_coupon boolean, p_scheme_count int, p_gift_count int)
returns table (allowed boolean, reason text)
language sql immutable set search_path = public
as $function$
  select
    (p_has_coupon::int + least(p_scheme_count, 1) + least(p_gift_count, 1)) <= 1,
    case
      when (p_has_coupon::int + least(p_scheme_count, 1) + least(p_gift_count, 1)) <= 1 then null
      when p_has_coupon and p_gift_count > 0
        then 'A coupon and a gift cannot both be claimed on one bill'
      when p_has_coupon and p_scheme_count > 0
        then 'A coupon and a discount cannot both be claimed on one bill'
      else 'A discount and a gift cannot both be claimed on one bill'
    end;
$function$;

revoke execute on function public.check_benefit_combination(boolean, int, int) from public, anon;
grant  execute on function public.check_benefit_combination(boolean, int, int) to authenticated;
