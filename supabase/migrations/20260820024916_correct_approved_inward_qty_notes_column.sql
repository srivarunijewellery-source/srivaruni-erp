create or replace function public.correct_approved_inward_qty(
  p_line    uuid,
  p_new_qty integer,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_line   inward_lines%rowtype;
  v_iw     inwards%rowtype;
  v_item   items%rowtype;
  v_delta  int;
  v_onhand int;
begin
  if not is_owner() then
    raise exception 'Only the owner can correct an approved document.';
  end if;
  if p_new_qty < 1 then
    raise exception 'Quantity must be at least 1. To remove a line entirely, use a stock adjustment.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why the quantity is changing -- this is the only explanation the ledger will carry.';
  end if;

  select * into v_line from inward_lines where id = p_line for update;
  if not found then raise exception 'That line could not be found.'; end if;

  select * into v_iw from inwards where id = v_line.inward_id;
  select * into v_item from items where id = v_line.item_id;

  v_delta := p_new_qty - v_line.qty;
  if v_delta = 0 then
    return jsonb_build_object('changed', false, 'delta', 0);
  end if;

  -- A draft or submitted document needs none of this: the plain edit
  -- still works there and nothing has reached stock yet.
  if v_iw.status <> 'approved' then
    raise exception 'This document is %, not approved. Edit the line directly.', v_iw.status;
  end if;

  -- Removing pieces that are no longer on the shelf would drive the
  -- balance negative, which means they were sold or transferred and the
  -- correction is not a correction at all -- it is a different event
  -- that needs its own document.
  select coalesce(qty, 0) into v_onhand
  from stock_balances
  where item_id = v_line.item_id and location_id = v_iw.location_id;
  v_onhand := coalesce(v_onhand, 0);

  if v_delta < 0 and v_onhand + v_delta < 0 then
    raise exception
      'Only % of % are still at this branch, so % cannot be taken back. The rest have moved or been sold -- record that separately.',
      v_onhand, v_item.barcode, abs(v_delta);
  end if;

  -- The stock half goes through adjust_item_qty rather than a hand
  -- written ledger row: it already allocates an adjustment document
  -- number, stamps who and when, and writes the ledger entry. Two ways
  -- of moving stock is one too many.
  perform adjust_item_qty(
    v_line.item_id,
    v_iw.location_id,
    v_onhand + v_delta,
    'count_variance'
  );

  -- Now the document itself. The immutability trigger is deliberately
  -- bypassed HERE and nowhere else: it exists to stop a bare UPDATE
  -- leaving stock and paperwork disagreeing, and by this point the stock
  -- side has already moved. The flag is transaction-scoped, so it cannot
  -- leak into another statement.
  perform set_config('app.correcting_approved_inward', 'on', true);
  update inward_lines set qty = p_new_qty where id = p_line;
  perform set_config('app.correcting_approved_inward', 'off', true);

  -- Rate is per piece, but the bill discount, the freight share and the
  -- landed unit cost are all functions of quantity, so every one of them
  -- is stale now.
  perform compute_inward_costs(v_line.inward_id);

  update inwards
     set notes = coalesce(notes || ' | ', '')
       || v_item.barcode || ' ' || v_line.qty || ' -> ' || p_new_qty
       || ' on ' || to_char(now(), 'DD Mon YYYY')
       || ' by ' || coalesce((select name from staff where id = current_staff_id()), 'owner')
       || ': ' || btrim(p_reason)
   where id = v_line.inward_id;

  return jsonb_build_object(
    'changed', true,
    'barcode', v_item.barcode,
    'doc_no', v_iw.doc_no,
    'was', v_line.qty,
    'now', p_new_qty,
    'delta', v_delta,
    'stock_before', v_onhand,
    'stock_after', v_onhand + v_delta
  );
end $function$;
