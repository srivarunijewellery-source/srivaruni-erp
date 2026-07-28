-- Direct quantity correction from the Products page, and the view behind
-- "add existing item" on an inward.
--
-- adjust_item_qty does NOT write a balance. It raises a real
-- stock_adjustment document, approves it, and lets the existing ledger
-- machinery post the delta, so a correction typed on the catalog screen
-- is as traceable as one raised on the shop floor.

create or replace function adjust_item_qty(
  p_item uuid, p_location uuid, p_new_qty integer, p_reason text
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_current integer;
  v_delta   integer;
  v_doc     uuid;
  v_no      text;
begin
  if not is_owner() then
    raise exception 'Only the owner can adjust stock from the catalog';
  end if;
  if p_new_qty < 0 then
    raise exception 'Quantity cannot be negative';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required for every stock adjustment';
  end if;

  select coalesce(qty, 0) into v_current
  from stock_balances where item_id = p_item and location_id = p_location;

  v_current := coalesce(v_current, 0);
  v_delta := p_new_qty - v_current;
  if v_delta = 0 then return 0; end if;

  v_no := coalesce((select code from locations where id = p_location), 'XX')
          || '-ADJ-' || lpad(nextval('adjustment_doc_seq')::text, 6, '0');

  insert into stock_adjustments (id, doc_no, location_id, kind, status,
                                 reason_note, created_by, approved_by, approved_at)
  values (gen_random_uuid(), v_no, p_location, 'adjustment', 'approved',
          p_reason, current_staff_id(), current_staff_id(), now())
  returning id into v_doc;

  insert into stock_adjustment_lines (adjustment_id, item_id, qty_delta, note)
  values (v_doc, p_item, v_delta, p_reason);

  insert into stock_ledger (item_id, location_id, qty_delta, reason,
                            ref_type, ref_id, created_by, note)
  values (p_item, p_location, v_delta, 'adjustment', 'adjustment', v_doc,
          current_staff_id(), p_reason);

  return v_delta;
end $$;

revoke execute on function adjust_item_qty(uuid, uuid, integer, text) from public, anon;
grant execute on function adjust_item_qty(uuid, uuid, integer, text) to authenticated;

-- Items created but never actually received. one_inward_per_item already
-- keeps genuinely-inwarded items out, so a line that was deleted makes
-- its item selectable again.
create or replace view attachable_items
with (security_invoker = true) as
select i.id, i.barcode, i.name, c.name as category_name, i.category_id, i.created_at
from items i
join categories c on c.id = i.category_id
where i.status = 'pending_pricing'
  and not exists (select 1 from inward_lines l where l.item_id = i.id);
