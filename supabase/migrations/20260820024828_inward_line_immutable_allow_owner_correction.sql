create or replace function public.trg_inward_line_immutable_after_approval()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_status text;
begin
  select status into v_status from inwards
   where id = coalesce(new.inward_id, old.inward_id);

  if v_status <> 'approved' then
    return coalesce(new, old);
  end if;

  if TG_OP = 'DELETE' then
    raise exception 'Inward % is approved - its lines cannot be removed. Use a stock adjustment.',
      (select doc_no from inwards where id = old.inward_id);
  end if;

  -- One sanctioned way through, and only one.
  --
  -- correct_approved_inward_qty sets this flag for the length of its own
  -- transaction, immediately after it has moved the stock to match. The
  -- point of this trigger was never that an approved quantity is sacred
  -- -- it is that changing the paperwork WITHOUT changing the stock
  -- leaves the shelf, the ledger and the books disagreeing, and nothing
  -- afterwards can tell you which of the three was right.
  --
  -- A bare UPDATE still cannot set this flag by accident: it is
  -- transaction-scoped and set inside a SECURITY DEFINER function that
  -- checks ownership, refuses to drive stock negative, writes an
  -- adjustment document, and recomputes costs before it gets here.
  if TG_OP = 'UPDATE'
     and new.qty is distinct from old.qty
     and coalesce(current_setting('app.correcting_approved_inward', true), 'off') <> 'on'
  then
    raise exception
      'Inward % is approved: % pieces were already taken into stock and posted to the books. Use "Correct quantity", which adjusts the stock at the same time.',
      (select doc_no from inwards where id = new.inward_id), old.qty;
  end if;

  -- Moving a line to another document after approval would strand the
  -- ledger entry that points at this one.
  if TG_OP = 'UPDATE' and new.inward_id is distinct from old.inward_id then
    raise exception 'Approved lines cannot be moved to another inward.';
  end if;

  return new;
end $function$;
