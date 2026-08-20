create or replace function public.set_bill_customer(
  p_bill     uuid,
  p_customer uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_b bills%rowtype;
  v_c customers%rowtype;
begin
  if current_staff_id() is null then
    raise exception 'Not signed in.';
  end if;
  -- Same bar as taking the return itself. Whoever can hand back money
  -- can put a name on the bill it comes off.
  if not (has_permission('pos.sell') or is_manager_or_above()) then
    raise exception 'You cannot change a bill.';
  end if;

  select * into v_b from bills where id = p_bill for update;
  if not found then raise exception 'No such bill.'; end if;
  if v_b.status <> 'final' then
    raise exception 'Only a completed bill can have a customer added.';
  end if;

  -- Fills a blank ONLY. Reassigning a bill that already names someone is
  -- a different act entirely: it moves a purchase history, and any
  -- credit note raised against it, from one person to another. That
  -- needs a deliberate decision by the owner, not a side effect of
  -- someone standing at the counter with a return.
  if v_b.customer_id is not null then
    raise exception 'That bill already belongs to a customer. Changing who a bill belongs to is an owner decision.';
  end if;

  if not (is_owner() or v_b.location_id = my_location_id()) then
    raise exception 'That bill was rung at another branch.';
  end if;

  select * into v_c from customers where id = p_customer;
  if not found then raise exception 'No such customer.'; end if;

  -- edit_reason, not a silent write. A finalised bill that changes
  -- without saying so is worse than one that never changed: the figure
  -- someone reconciled last week still matches, but the document behind
  -- it no longer reads the same, and nothing explains the difference.
  update bills
     set customer_id = p_customer,
         edit_reason = coalesce(edit_reason || ' | ', '')
           || 'Customer ' || coalesce(v_c.name, v_c.phone)
           || ' attached on ' || to_char(now(), 'DD Mon YYYY HH24:MI')
           || ' by ' || coalesce((select name from staff where id = current_staff_id()), 'staff')
           || ' (sold as walk-in; needed for a return or exchange).'
   where id = p_bill;
end
$function$;
