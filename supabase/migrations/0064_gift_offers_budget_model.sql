-- =====================================================================
-- 0064_gift_offers_budget_model.sql
--
-- Corrects the stacking rule in 0063.
--
-- 0063 treated thresholds as INDEPENDENT: every offer the bill cleared
-- was earned once. That was wrong. The bill is a BUDGET that gifts
-- consume, and an offer can be earned repeatedly:
--
--   50,000 against a 10,000 offer -> 5 awards
--   50,000 against a  5,000 offer -> 10 awards
--   15,000 against both           -> one of each, spending 15,000
--   50,000 -> 5 gold + 1 silver   -> REFUSED, that needs 55,000
--
-- Three functions, one rule:
--   evaluate_gift_offers   ceiling per offer, if the whole bill went to it
--   allocate_gift_offers   a suggested combination, dearest gift first
--   validate_gift_selection  checks a hand-picked mix against the budget
-- =====================================================================

drop function if exists public.evaluate_gift_offers(bigint, uuid, date);

create or replace function public.evaluate_gift_offers(
  p_bill_paise bigint, p_location uuid default null, p_on date default null)
returns table (
  offer_id uuid, name text, threshold_paise bigint,
  item_id uuid, item_name text, barcode text,
  qty_per_award int, max_awards int, max_item_qty int)
language sql stable security invoker set search_path = public
as $function$
  -- max_awards is what this offer alone could yield if the whole bill
  -- went to it. Offers are NOT independent: these counts cannot all be
  -- claimed together, because they draw on the same budget.
  select g.id, g.name, g.threshold_paise, g.item_id, i.name, i.barcode, g.qty,
         (p_bill_paise / g.threshold_paise)::int,
         ((p_bill_paise / g.threshold_paise) * g.qty)::int
  from gift_offers g
  join items i on i.id = g.item_id
  where g.active
    and p_bill_paise >= g.threshold_paise
    and coalesce(p_on, current_date) between g.starts_on and g.ends_on
    and (cardinality(g.location_ids) = 0 or p_location is null
         or p_location = any(g.location_ids))
  order by g.threshold_paise desc;
$function$;

-- Spends the budget on the highest thresholds first: 15,000 gives one of
-- each rather than three of the 5,000, because the dearer gift is the
-- better one to earn and the remainder still buys the smaller.
create or replace function public.allocate_gift_offers(
  p_bill_paise bigint, p_location uuid default null, p_on date default null)
returns table (
  offer_id uuid, name text, item_id uuid, item_name text,
  awards int, item_qty int, spent_paise bigint)
language plpgsql stable security invoker set search_path = public
as $function$
declare
  r record; v_budget bigint := p_bill_paise; v_awards int;
begin
  for r in
    select g.id, g.name, g.threshold_paise, g.item_id, g.qty, i.name as item_name
    from gift_offers g join items i on i.id = g.item_id
    where g.active
      and coalesce(p_on, current_date) between g.starts_on and g.ends_on
      and (cardinality(g.location_ids) = 0 or p_location is null
           or p_location = any(g.location_ids))
    order by g.threshold_paise desc
  loop
    v_awards := (v_budget / r.threshold_paise)::int;
    if v_awards > 0 then
      v_budget := v_budget - (v_awards::bigint * r.threshold_paise);
      offer_id := r.id; name := r.name; item_id := r.item_id;
      item_name := r.item_name; awards := v_awards;
      item_qty := v_awards * r.qty;
      spent_paise := v_awards::bigint * r.threshold_paise;
      return next;
    end if;
  end loop;
end
$function$;

-- Staff may want a different mix than the suggestion. The rule lives here
-- rather than being re-derived on the billing screen.
create or replace function public.validate_gift_selection(
  p_bill_paise bigint, p_selection jsonb)
returns table (allowed boolean, spent_paise bigint, reason text)
language sql stable security invoker set search_path = public
as $function$
  with picks as (
    select (e ->> 'offer_id')::uuid as offer_id, (e ->> 'awards')::int as awards
    from jsonb_array_elements(coalesce(p_selection, '[]'::jsonb)) e
  ),
  cost as (
    select coalesce(sum(g.threshold_paise * p.awards), 0)::bigint as total
    from picks p join gift_offers g on g.id = p.offer_id
  )
  select cost.total <= p_bill_paise, cost.total,
    case when cost.total <= p_bill_paise then null
    else 'Those gifts need a bill of at least ' ||
         to_char(cost.total / 100.0, 'FM9,99,99,999') || ' but this bill is ' ||
         to_char(p_bill_paise / 100.0, 'FM9,99,99,999') end
  from cost;
$function$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in ('evaluate_gift_offers','allocate_gift_offers','validate_gift_selection')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
