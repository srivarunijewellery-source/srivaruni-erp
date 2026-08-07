-- Nothing in the offline billing hardening touched the schema -- that
-- work was entirely in the frontend (net.ts, PosScreen.tsx wiring the
-- already-existing offline-store.ts). This migration is price bands
-- only.

-- How many rules and how much price history depend on each band.
--
-- item_price_history is permanent: it is what a piece was actually
-- priced under, not a live configuration. Deleting a band a historical
-- price points at would not just break a foreign key, it would erase
-- what the price meant at the time. "In use" counts history as well as
-- live rules, and history alone is enough to block a delete.
create or replace view price_bands_usage
with (security_invoker = true) as
select b.id,
       (select count(*) from pricing_rules r where r.band_id = b.id)
       + (select count(*) from pricing_settings s where s.default_band_id = b.id)
       as live_uses,
       (select count(*) from item_price_history h where h.band_id = b.id)
       as history_uses
from price_bands b;

create or replace function save_price_band(
  p_id uuid, p_label text, p_lo_bps integer, p_hi_bps integer,
  p_active boolean, p_sort integer default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_label text := btrim(coalesce(p_label, ''));
begin
  if not is_owner() then raise exception 'Only the owner can change pricing bands.'; end if;
  if length(v_label) < 1 then raise exception 'Give the band a label.'; end if;
  if p_lo_bps is null or p_hi_bps is null or p_hi_bps <= p_lo_bps then
    raise exception 'The upper margin must be above the lower one.';
  end if;
  if p_lo_bps < 0 or p_hi_bps > 20000 then
    raise exception 'That margin is out of range.';
  end if;

  if p_id is null then
    insert into price_bands (label, lo_bps, hi_bps, active, sort_order)
    values (v_label, p_lo_bps, p_hi_bps, coalesce(p_active, true),
            coalesce(p_sort, (select coalesce(max(sort_order), 0) + 10 from price_bands)))
    returning id into v_id;
  else
    update price_bands
       set label = v_label, lo_bps = p_lo_bps, hi_bps = p_hi_bps,
           active = coalesce(p_active, active),
           sort_order = coalesce(p_sort, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'No such band.'; end if;
  end if;
  return v_id;
end $$;

-- Deletable only when nothing, past or present, points at it. A band
-- with history behind it is turned off instead: it stops being offered
-- for new pricing, and every price already set under it keeps its
-- meaning.
--
-- RAISE EXCEPTION's placeholder is a bare %, not %s -- caught by running
-- it and reading the actual message, which the first version got wrong
-- ("25-30%s is used by 2 pricing ruless").
create or replace function delete_price_band(p_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_live bigint; v_hist bigint; v_label text;
begin
  if not is_owner() then raise exception 'Only the owner can delete pricing bands.'; end if;

  select u.live_uses, u.history_uses, b.label
    into v_live, v_hist, v_label
  from price_bands_usage u join price_bands b on b.id = u.id
  where u.id = p_id;

  if v_label is null then raise exception 'No such band.'; end if;

  if v_live > 0 then
    raise exception '% is used by % pricing rule% or the default setting. Point those elsewhere first.',
      v_label, v_live, case when v_live = 1 then '' else 's' end;
  end if;
  if v_hist > 0 then
    raise exception '% was used to price % item% in the past. Turn it off instead — the history stays meaningful and it stops being offered on new pricing.',
      v_label, v_hist, case when v_hist = 1 then '' else 's' end;
  end if;

  delete from price_bands where id = p_id;
  return v_label;
end $$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'save_price_band(uuid, text, integer, integer, boolean, integer)',
    'delete_price_band(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end $$;
