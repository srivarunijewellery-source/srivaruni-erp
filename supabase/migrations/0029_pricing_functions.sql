-- =====================================================================
-- 0029_pricing_functions.sql   (supabase version 20260729173602)
-- Recovered from the remote migration history.
-- =====================================================================

-- Date validation for the suffix glued onto a design code.
-- Stable, not immutable: the plausibility window moves with the calendar.
create or replace function sv_try_date(p text)
returns date language plpgsql stable as $$
declare dd int; mm int; yy int;
begin
  if p ~ '^\d{8}$' then
    dd := substr(p,1,2)::int; mm := substr(p,3,2)::int; yy := substr(p,5,4)::int;
  elsif p ~ '^\d{7}$' then
    dd := substr(p,1,1)::int; mm := substr(p,2,2)::int; yy := substr(p,4,4)::int;
  else
    return null;
  end if;
  if mm < 1 or mm > 12 or dd < 1 or dd > 31 then return null; end if;
  if yy < 2015 or yy > extract(year from current_date)::int + 1 then return null; end if;
  begin
    return make_date(yy, mm, dd);
  exception when others then
    return null;
  end;
end $$;

comment on function sv_try_date is
  'Parses DDMMYYYY or DMMYYYY, rejecting anything outside a plausible trading window. The window is what disambiguates a 7-digit suffix from an 8-digit one in most titles.';

-- Splits "Antique Choker 34329072026" into code 343 and date 29-07-2026.
--
-- Both readings can be legal: stripping 8 digits gives code 343 with
-- 29/07/2026, stripping 7 gives code 3432 with 9/07/2026. Both are real
-- dates. Rather than silently pick one and be wrong by a factor of ten
-- on the rate, this reports the ambiguity and hands both readings back
-- for a human to glance at.
create or replace function parse_design_code(p_title text, p_has_date boolean default true)
returns table (
  code text, code_numeric bigint, date_digits text, parsed_date date,
  ambiguous boolean, alt_code text, alt_date date
) language plpgsql stable as $$
declare
  v_digits text;
  n int;
  d8 date; d7 date;
  c8 text; c7 text;
begin
  v_digits := (regexp_match(coalesce(p_title,''), '(\d+)\s*$'))[1];
  if v_digits is null then return; end if;

  if not p_has_date then
    return query select v_digits, v_digits::bigint, null::text, null::date,
                        false, null::text, null::date;
    return;
  end if;

  n := length(v_digits);

  if n > 8 then
    d8 := sv_try_date(right(v_digits, 8));
    c8 := left(v_digits, n - 8);
  end if;
  if n > 7 then
    d7 := sv_try_date(right(v_digits, 7));
    c7 := left(v_digits, n - 7);
  end if;

  if d8 is not null then
    return query select c8, c8::bigint, right(v_digits,8), d8,
                        (d7 is not null and c7 is distinct from c8),
                        case when d7 is not null then c7 end, d7;
  elsif d7 is not null then
    return query select c7, c7::bigint, right(v_digits,7), d7,
                        false, null::text, null::date;
  else
    -- No valid date suffix. Treat the whole run as the code rather than
    -- returning nothing, so a mistyped date still yields a usable rate.
    return query select v_digits, v_digits::bigint, null::text, null::date,
                        false, null::text, null::date;
  end if;
end $$;

-- The vendor rate implied by a product title, in paise.
create or replace function suggest_rate_from_title(p_vendor uuid, p_title text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v vendors%rowtype; p record;
begin
  select * into v from vendors where id = p_vendor;
  if not found or v.pricing_mode <> 'code_multiple' or v.code_multiple is null then
    return null;
  end if;
  select * into p from parse_design_code(p_title, v.code_has_date_suffix) limit 1;
  if p.code_numeric is null then return null; end if;
  return round(p.code_numeric * v.code_multiple * 100);
end $$;

-- Snap a price onto the retail grid.
create or replace function sv_round_price(p_paise bigint, p_mode text default null)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  s pricing_settings%rowtype;
  v_mode text; v_block bigint; v_cand bigint; v_best bigint;
  v_cands bigint[] := '{}';
  b bigint; e integer;
begin
  if p_paise is null or p_paise <= 0 then return null; end if;
  select * into s from pricing_settings where id;
  v_mode := coalesce(p_mode, s.round_mode);
  v_block := (p_paise / 10000) * 10000;

  foreach b in array array[v_block-20000, v_block-10000, v_block, v_block+10000, v_block+20000] loop
    if b < 0 then continue; end if;
    v_cand := b + s.high_ending_paise;
    if v_cand >= s.grid_switch_paise then v_cands := v_cands || v_cand; end if;
    foreach e in array s.low_endings_paise loop
      v_cand := b + e;
      if v_cand > 0 and v_cand < s.grid_switch_paise then v_cands := v_cands || v_cand; end if;
    end loop;
  end loop;

  if array_length(v_cands,1) is null then return p_paise; end if;

  if v_mode = 'up' then
    select min(c) into v_best from unnest(v_cands) c where c >= p_paise;
    if v_best is null then select max(c) into v_best from unnest(v_cands) c; end if;
  else
    select c into v_best from unnest(v_cands) c order by abs(c - p_paise), c limit 1;
  end if;
  return v_best;
end $$;

comment on function sv_round_price is
  'Snaps to the retail grid: ends in 60 above the switch, in 25/45/75/95 below it. Candidates are filtered by which side of the switch they land on, not which side the input did, so a price near 1000 rupees cannot round onto the wrong grid.';

-- Grid points strictly inside a range. Used to keep a recommendation in
-- band when the naive nearest snap would push it out.
create or replace function sv_grid_points(p_min bigint, p_max bigint)
returns setof bigint language plpgsql stable security definer set search_path = public as $$
declare s pricing_settings%rowtype; b bigint; e integer; c bigint;
begin
  select * into s from pricing_settings where id;
  if p_min is null or p_max is null or p_max < p_min then return; end if;
  if (p_max - p_min) / 10000 > 2000 then return; end if;
  b := (p_min / 10000) * 10000;
  while b <= p_max + 10000 loop
    c := b + s.high_ending_paise;
    if c >= s.grid_switch_paise and c between p_min and p_max then return next c; end if;
    foreach e in array s.low_endings_paise loop
      c := b + e;
      if c < s.grid_switch_paise and c between p_min and p_max then return next c; end if;
    end loop;
    b := b + 10000;
  end loop;
end $$;

-- The rule that governs an item, most specific wins.
create or replace function match_pricing_rule(p_item uuid)
returns table (rule_id uuid, rule_name text, band_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.band_id
  from items i
  join pricing_rules r on r.active
   and (r.vendor_id    is null or r.vendor_id    = i.vendor_id)
   and (r.category_id  is null or r.category_id  = i.category_id)
   and (r.item_type_id is null or r.item_type_id = i.item_type_id)
  where i.id = p_item
  order by r.specificity desc, r.created_at desc
  limit 1;
$$;

-- The recommendation engine.
create or replace function recommend_price(
  p_item uuid,
  p_band uuid default null,
  p_landed bigint default null
)
returns table (
  landed_cost_paise bigint, band_id uuid, band_label text,
  lo_bps int, hi_bps int, target_bps int,
  rule_id uuid, rule_name text,
  mrp_min_paise bigint, mrp_max_paise bigint,
  ideal_mrp_paise bigint, recommended_mrp_paise bigint,
  achieved_margin_bps int, in_band boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  s pricing_settings%rowtype;
  v_landed bigint; v_band uuid; v_rule record; bnd price_bands%rowtype;
  v_target int; v_ideal bigint; v_min bigint; v_max bigint;
  v_rec bigint; v_margin int; v_in boolean;
begin
  select * into s from pricing_settings where id;

  v_landed := coalesce(p_landed,
    (select landed_cost_paise from item_latest_cost where item_id = p_item));
  if v_landed is null or v_landed <= 0 then return; end if;

  select * into v_rule from match_pricing_rule(p_item);
  v_band := coalesce(p_band, v_rule.band_id, s.default_band_id);
  if v_band is null then return; end if;

  select * into bnd from price_bands where id = v_band;
  if not found then return; end if;

  v_target := greatest(bnd.lo_bps,
                least(bnd.hi_bps, (bnd.lo_bps + bnd.hi_bps) / 2 + s.target_nudge_bps));

  v_min   := ceil (v_landed::numeric * 10000 / (10000 - bnd.lo_bps));
  v_max   := floor(v_landed::numeric * 10000 / (10000 - bnd.hi_bps));
  v_ideal := round(v_landed::numeric * 10000 / (10000 - v_target));

  v_rec := sv_round_price(v_ideal);

  -- Snapping can walk the price out of the band it was chosen from. When
  -- it does, take the nearest grid point that is still inside.
  if v_rec is null or v_rec < v_min or v_rec > v_max then
    select g into v_rec from sv_grid_points(v_min, v_max) g
    order by abs(g - v_ideal), g limit 1;
    if v_rec is null then v_rec := sv_round_price(v_ideal); end if;
  end if;

  if v_rec is null or v_rec <= 0 then return; end if;

  v_margin := round((v_rec - v_landed)::numeric * 10000 / v_rec);
  v_in     := v_margin between bnd.lo_bps and bnd.hi_bps;

  return query select
    v_landed, bnd.id, bnd.label, bnd.lo_bps, bnd.hi_bps, v_target,
    v_rule.rule_id, v_rule.rule_name,
    v_min, v_max, v_ideal, v_rec, v_margin, v_in;
end $$;

comment on function recommend_price is
  'Target is the band midpoint plus the configured nudge, then snapped to the retail grid, then pulled back inside the band if the snap escaped it. Reports the margin actually achieved, which is never exactly the target and should not pretend to be.';

-- Same thing from an inward line, using that document's landed cost
-- rather than the item's last known one.
create or replace function recommend_price_for_line(p_line uuid, p_band uuid default null)
returns table (
  landed_cost_paise bigint, band_id uuid, band_label text,
  lo_bps int, hi_bps int, target_bps int,
  rule_id uuid, rule_name text,
  mrp_min_paise bigint, mrp_max_paise bigint,
  ideal_mrp_paise bigint, recommended_mrp_paise bigint,
  achieved_margin_bps int, in_band boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_item uuid; v_landed bigint;
begin
  select l.item_id, c.landed_unit_cost_paise into v_item, v_landed
  from inward_lines l
  left join inward_line_costs c on c.inward_line_id = l.id
  where l.id = p_line;
  if v_item is null then return; end if;
  return query select * from recommend_price(v_item, p_band, nullif(v_landed, 0));
end $$;

revoke execute on function sv_try_date(text) from public;
revoke execute on function parse_design_code(text, boolean) from public;
revoke execute on function suggest_rate_from_title(uuid, text) from public;
revoke execute on function sv_round_price(bigint, text) from public;
revoke execute on function sv_grid_points(bigint, bigint) from public;
revoke execute on function match_pricing_rule(uuid) from public;
revoke execute on function recommend_price(uuid, uuid, bigint) from public;
revoke execute on function recommend_price_for_line(uuid, uuid) from public;

grant execute on function sv_try_date(text) to authenticated;
grant execute on function parse_design_code(text, boolean) to authenticated;
grant execute on function suggest_rate_from_title(uuid, text) to authenticated;
grant execute on function sv_round_price(bigint, text) to authenticated;
grant execute on function sv_grid_points(bigint, bigint) to authenticated;
grant execute on function match_pricing_rule(uuid) to authenticated;
grant execute on function recommend_price(uuid, uuid, bigint) to authenticated;
grant execute on function recommend_price_for_line(uuid, uuid) to authenticated;
