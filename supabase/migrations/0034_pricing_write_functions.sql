-- =====================================================================
-- 0034_pricing_write_functions.sql   (supabase version 20260729174335)
-- Recovered from the remote migration history.
-- =====================================================================

-- Writing a price goes through here rather than a bare UPDATE, so the
-- history row records WHY it changed. The trigger reads sv.price_source
-- from the session; setting it inside the same function is the only way
-- to guarantee the two stay together.
create or replace function set_item_price(
  p_item    uuid,
  p_mrp     bigint,
  p_selling bigint default null,
  p_band    uuid   default null,
  p_source  text   default 'manual',
  p_note    text   default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_selling bigint;
begin
  if not is_owner() then
    raise exception 'Only the owner can set prices.';
  end if;
  if p_mrp is null or p_mrp <= 0 then
    raise exception 'MRP must be a positive amount.';
  end if;

  -- Selling defaults to MRP: they are equal on almost everything here,
  -- and a blank field means "same", not "zero".
  v_selling := coalesce(p_selling, p_mrp);
  if v_selling > p_mrp then
    raise exception 'Selling price % is above the MRP %. MRP is the ceiling.',
      v_selling / 100.0, p_mrp / 100.0;
  end if;

  perform set_config('sv.price_source', p_source, true);

  update items
     set mrp_paise = p_mrp,
         selling_price_paise = v_selling,
         updated_at = now()
   where id = p_item;

  if p_band is not null or p_note is not null then
    update item_price_history
       set band_id = coalesce(p_band, band_id),
           note    = coalesce(p_note, note)
     where id = (select max(id) from item_price_history where item_id = p_item);
  end if;
end $$;

-- item_price_history is append-only by trigger, which the line above
-- would trip. Allow the band and note to be stamped onto the row this
-- same statement just created, and nothing else.
create or replace function item_price_history_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.item_id             is not distinct from old.item_id
     and new.mrp_paise           is not distinct from old.mrp_paise
     and new.selling_price_paise is not distinct from old.selling_price_paise
     and new.landed_cost_paise   is not distinct from old.landed_cost_paise
     and new.margin_bps          is not distinct from old.margin_bps
     and new.source              is not distinct from old.source
     and new.changed_at          is not distinct from old.changed_at
     and old.band_id is null then
    return new;
  end if;
  raise exception 'item_price_history is append only.';
end $$;

-- One click on the pricing screen: price every selected item at whatever
-- its governing rule says. Returns what it did so the screen can report
-- the ones it could not price rather than silently skipping them.
create or replace function apply_pricing_rules(p_items uuid[])
returns table (item_id uuid, mrp_paise bigint, margin_bps int, applied boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; r record;
begin
  if not is_owner() then
    raise exception 'Only the owner can set prices.';
  end if;

  foreach v_id in array coalesce(p_items, '{}') loop
    select * into r from recommend_price(v_id, null, null);

    if r.recommended_mrp_paise is null then
      return query select v_id, null::bigint, null::int, false,
        'No landed cost yet, or no rule and no default band.';
    else
      perform set_item_price(v_id, r.recommended_mrp_paise, r.recommended_mrp_paise,
                             r.band_id, 'rule_apply', r.rule_name);
      return query select v_id, r.recommended_mrp_paise, r.achieved_margin_bps, true,
        coalesce(r.rule_name, 'Default band');
    end if;
  end loop;
end $$;

revoke execute on function set_item_price(uuid, bigint, bigint, uuid, text, text) from public;
revoke execute on function apply_pricing_rules(uuid[]) from public;
grant execute on function set_item_price(uuid, bigint, bigint, uuid, text, text) to authenticated;
grant execute on function apply_pricing_rules(uuid[]) to authenticated;
