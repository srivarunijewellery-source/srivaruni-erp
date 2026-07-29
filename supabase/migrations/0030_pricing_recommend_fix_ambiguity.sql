-- =====================================================================
-- 0030_pricing_recommend_fix_ambiguity.sql  (supabase version 20260729173657)
-- Recovered from the remote migration history.
-- =====================================================================

-- The OUT parameter landed_cost_paise shadowed the column of the same
-- name in item_latest_cost. Qualifying the reference is the fix; the
-- alternative (renaming the OUT parameter) would change the API shape
-- the app codes against for no benefit.
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
  select * into s from pricing_settings ps where ps.id;

  if p_landed is not null then
    v_landed := p_landed;
  else
    select ilc.landed_cost_paise into v_landed
    from item_latest_cost ilc where ilc.item_id = p_item;
  end if;
  if v_landed is null or v_landed <= 0 then return; end if;

  select * into v_rule from match_pricing_rule(p_item);
  v_band := coalesce(p_band, v_rule.band_id, s.default_band_id);
  if v_band is null then return; end if;

  select * into bnd from price_bands pb where pb.id = v_band;
  if not found then return; end if;

  v_target := greatest(bnd.lo_bps,
                least(bnd.hi_bps, (bnd.lo_bps + bnd.hi_bps) / 2 + s.target_nudge_bps));

  v_min   := ceil (v_landed::numeric * 10000 / (10000 - bnd.lo_bps));
  v_max   := floor(v_landed::numeric * 10000 / (10000 - bnd.hi_bps));
  v_ideal := round(v_landed::numeric * 10000 / (10000 - v_target));

  v_rec := sv_round_price(v_ideal);

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
