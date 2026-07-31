-- =====================================================================
-- 0048_reject_reopens_for_pick.sql
--
-- "Send back" was terminal -- a rejected transfer had to be recreated
-- from scratch. It is now a bounce, not an ending: the box is sent back
-- to a fresh pick cycle at the SAME document, lines intact. It only ever
-- fires at 'picked' (nothing has touched the ledger yet at that point,
-- so there is nothing to reverse), and reopens the document at
-- 'requested' with pick state reset. rejected_reason is kept and shown
-- on the pick screen so staff know why they're re-picking.
-- =====================================================================

create or replace function public.reject_transfer(p_transfer uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  t transfers%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can send a box back';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  if t.status <> 'picked' then
    raise exception 'Only a packed box awaiting approval can be sent back (currently %)', t.status;
  end if;

  update transfer_lines
  set qty_picked = 0, qty_sent = qty_requested, qty_received = null
  where transfer_id = p_transfer;

  update transfers
  set status = 'requested',
      picking_by = null, picking_at = null,
      picked_by = null, picked_at = null, pick_note = null,
      rejected_by = current_staff_id(), rejected_at = now(), rejected_reason = p_reason
  where id = p_transfer;
end
$function$;
