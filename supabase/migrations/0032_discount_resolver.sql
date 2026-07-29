-- =====================================================================
-- 0032_discount_resolver.sql
--
-- Consolidates three remote revisions of resolve_discounts:
--   20260729173856  discount_resolver
--   20260729174008  discount_resolver_manual_split
--   20260729180313  discount_resolver_no_cost_leak
-- Each was a CREATE OR REPLACE of the same function, so only the final
-- body is needed to rebuild. The intermediate revisions remain in the
-- remote migration history for audit.
--
-- The last revision closed a cost leak. The payload returned both
-- subtotal_paise and floor_headroom_paise, and headroom is
-- subtotal - floor_total, so any caller could recover the basket's cost
-- floor by subtraction; floor_unit is landed cost scaled by
-- min_margin_bps, so landed cost then inverts out in one step. Verified
-- against live data: a staff-role call on an item costing 60.00 returned
-- a headroom resolving the floor to 75.00, and 75 x 0.80 is the cost
-- exactly. The field is now owner-gated.
--
-- This is the single entry point the POS will call. It is SECURITY
-- DEFINER so it can read owner-only cost tables to enforce the margin
-- floor WITHOUT the caller ever seeing a cost.
-- =====================================================================

create or replace function public.resolve_discounts(
  p_lines        jsonb,
  p_location     uuid       default null,
  p_on           date       default null,
  p_role         staff_role default null,
  p_manual_bps   integer    default null,
  p_manual_paise bigint     default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $fn$
declare
  s             discount_settings%rowtype;
  v_on          date;
  v_role        staff_role;
  v_role_cap    integer;
  v_lines       jsonb;
  v_gross       bigint;
  v_line_disc   bigint;
  v_floor_total bigint;
  v_subtotal    bigint;
  v_inv_id      uuid;
  v_inv_name    text;
  v_inv_cap     bigint;
  v_inv_disc    bigint := 0;
  v_manual      bigint := 0;
  v_manual_bps  integer := 0;
  v_headroom    bigint;
  v_total_disc  bigint;
  v_eff_bps     integer;
  v_role_capped boolean := false;
  v_notes       text[] := '{}';
begin
  select * into s from discount_settings ds where ds.id;
  v_on   := coalesce(p_on, current_date);
  v_role := coalesce(p_role, current_staff_role(), 'staff'::staff_role);
  v_role_cap := case v_role
                  when 'owner'   then s.max_percent_owner_bps
                  when 'manager' then s.max_percent_manager_bps
                  else s.max_percent_staff_bps
                end;

  with ln as (
    select (l->>'item_id')::uuid            as item_id,
           coalesce((l->>'qty')::int, 1)    as qty,
           (l->>'unit_price_paise')::bigint as unit_price_paise,
           ord::int                         as idx
    from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) with ordinality as t(l, ord)
  ),
  enriched as (
    select ln.*, i.name as item_name,
           coalesce(ilc.landed_cost_paise, 0) as landed_paise,
           ln.qty * ln.unit_price_paise       as gross_paise
    from ln
    join items i on i.id = ln.item_id
    left join item_latest_cost ilc on ilc.item_id = ln.item_id
  ),
  picked as (
    select e.*, sch.id as scheme_id, sch.name as scheme_name,
           sch.value_kind, sch.value_bps, sch.value_paise, sch.max_discount_paise
    from enriched e
    left join lateral (
      select ds.* from discount_schemes ds
      where ds.active and ds.scope = 'selection'
        and v_on between ds.starts_on and ds.ends_on
        and (ds.location_ids is null or p_location is null
             or p_location = any (ds.location_ids))
        and discount_covers_item(ds.id, e.item_id)
      order by ds.priority desc,
               (case when ds.value_kind = 'percent'
                     then e.gross_paise * ds.value_bps / 10000
                     else ds.value_paise * e.qty end) desc,
               ds.created_at
      limit 1
    ) sch on true
  ),
  computed as (
    select p.*,
      case
        when p.scheme_id is null then 0::bigint
        when p.value_kind = 'percent'
          then floor(p.gross_paise::numeric * p.value_bps / 10000)::bigint
        else least(p.value_paise * p.qty, p.gross_paise)
      end as raw_discount,
      greatest(
        case when s.never_below_cost then p.landed_paise else 0 end,
        case when s.min_margin_bps > 0 and p.landed_paise > 0
             then ceil(p.landed_paise::numeric * 10000 / (10000 - s.min_margin_bps))::bigint
             else 0 end
      ) as floor_unit
    from picked p
  ),
  applied as (
    select c.*,
      least(
        least(c.raw_discount, coalesce(c.max_discount_paise, c.raw_discount)),
        greatest(c.gross_paise - c.floor_unit * c.qty, 0)
      ) as discount_paise,
      least(c.raw_discount, coalesce(c.max_discount_paise, c.raw_discount)) as capped_discount,
      greatest(c.gross_paise - c.floor_unit * c.qty, 0)                     as allowed_discount
    from computed c
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'idx', a.idx, 'item_id', a.item_id, 'item_name', a.item_name,
      'qty', a.qty, 'unit_price_paise', a.unit_price_paise,
      'gross_paise', a.gross_paise,
      'scheme_id', a.scheme_id, 'scheme_name', a.scheme_name,
      'discount_paise', a.discount_paise,
      'net_paise', a.gross_paise - a.discount_paise,
      'capped', a.raw_discount > a.capped_discount,
      -- A boolean, deliberately. It says the floor bound this line; it
      -- does not say where the floor is.
      'floor_blocked', a.capped_discount > a.allowed_discount
    ) order by a.idx), '[]'::jsonb),
    coalesce(sum(a.gross_paise), 0),
    coalesce(sum(a.discount_paise), 0),
    coalesce(sum(a.floor_unit * a.qty), 0)
  into v_lines, v_gross, v_line_disc, v_floor_total
  from applied a;

  v_subtotal := v_gross - v_line_disc;

  select ds.id, ds.name, ds.max_discount_paise,
         case when ds.value_kind = 'percent'
              then floor(v_subtotal::numeric * ds.value_bps / 10000)::bigint
              else least(ds.value_paise, v_subtotal) end
    into v_inv_id, v_inv_name, v_inv_cap, v_inv_disc
  from discount_schemes ds
  where ds.active and ds.scope = 'invoice'
    and v_on between ds.starts_on and ds.ends_on
    and (ds.location_ids is null or p_location is null
         or p_location = any (ds.location_ids))
    and v_subtotal >= ds.min_bill_paise
  order by ds.priority desc, ds.created_at
  limit 1;

  v_inv_disc := coalesce(v_inv_disc, 0);
  if v_inv_cap is not null then v_inv_disc := least(v_inv_disc, v_inv_cap); end if;

  v_headroom := greatest(v_subtotal - v_floor_total, 0);
  if v_inv_disc > v_headroom then
    v_inv_disc := v_headroom;
    v_notes := v_notes || 'Bill offer trimmed to hold the margin floor.';
  end if;

  -- Manual discount, on top, and this is the one the role ceiling binds.
  if p_manual_bps is not null or p_manual_paise is not null then
    v_manual := coalesce(
      p_manual_paise,
      floor((v_subtotal - v_inv_disc)::numeric * p_manual_bps / 10000)::bigint
    );
    v_manual := greatest(v_manual, 0);

    v_manual_bps := case when v_gross > 0
                         then ceil(v_manual::numeric * 10000 / v_gross)::int else 0 end;

    if v_manual_bps > v_role_cap then
      v_manual := floor(v_gross::numeric * v_role_cap / 10000)::bigint;
      v_role_capped := true;
      v_notes := v_notes || format('Manual discount trimmed to the %s ceiling of %s%%.',
                                   v_role, round(v_role_cap / 100.0, 2));
    end if;

    if v_manual > v_headroom - v_inv_disc then
      v_manual := greatest(v_headroom - v_inv_disc, 0);
      v_notes := v_notes || 'Manual discount trimmed to hold the margin floor.';
    end if;

    v_manual_bps := case when v_gross > 0
                         then floor(v_manual::numeric * 10000 / v_gross)::int else 0 end;
  end if;

  v_total_disc := v_line_disc + v_inv_disc + v_manual;
  v_eff_bps := case when v_gross > 0
                    then floor(v_total_disc::numeric * 10000 / v_gross)::int else 0 end;

  return jsonb_build_object(
    'as_of',                   v_on,
    'role',                    v_role,
    'role_cap_bps',            v_role_cap,
    'lines',                   v_lines,
    'gross_paise',             v_gross,
    'line_discount_paise',     v_line_disc,
    'subtotal_paise',          v_subtotal,
    'invoice_scheme_id',       v_inv_id,
    'invoice_scheme_name',     v_inv_name,
    'invoice_discount_paise',  v_inv_disc,
    'manual_discount_paise',   v_manual,
    'manual_discount_bps',     v_manual_bps,
    'total_discount_paise',    v_total_disc,
    'net_paise',               v_gross - v_total_disc,
    'effective_discount_bps',  v_eff_bps,
    -- Owner only. subtotal - headroom is the cost floor, and the floor
    -- divided by (1 - min_margin) is the landed cost. Everyone else gets
    -- null plus the notes, which is all the POS needs to explain itself.
    'floor_headroom_paise',    case when is_owner()
                                    then to_jsonb(v_headroom)
                                    else 'null'::jsonb end,
    'role_capped',             v_role_capped,
    -- Reason and approval hang off the MANUAL portion. A scheduled
    -- campaign was already approved when it was created.
    'requires_reason',         v_manual_bps > s.require_reason_above_bps,
    'requires_approval',       v_manual_bps > s.require_approval_above_bps,
    'notes',                   to_jsonb(v_notes)
  );
end $fn$;

revoke execute on function resolve_discounts(jsonb, uuid, date, staff_role, integer, bigint) from public;
grant  execute on function resolve_discounts(jsonb, uuid, date, staff_role, integer, bigint) to authenticated;
