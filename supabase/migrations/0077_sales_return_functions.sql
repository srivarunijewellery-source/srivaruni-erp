-- Taking a return, and spending the credit it produces.
--
-- The refund is what was actually CHARGED for the piece, not its tag
-- price: a line carried its share of every discount on the bill, so
-- refunding the tag price would lose money on every return against a
-- discounted bill.
--
-- 'sale_return' is an existing stock_reason label -- the ledger has
-- always had a slot for this.
create or replace function record_sales_return(
  p_bill    uuid,
  p_lines   jsonb,          -- [{bill_line_id, item_id, qty, restock, reason}]
  p_reason  text default null,
  p_note    text default null,
  p_session uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_b        bills%rowtype;
  v_ret      uuid;
  v_no       text;
  v_seq      int;
  v_line     jsonb;
  v_bl       bill_lines%rowtype;
  v_qty      int;
  v_already  int;
  v_unit     bigint;
  v_gross    bigint := 0;
  v_taxable  bigint := 0;
  v_tax      bigint := 0;
  v_ltotal   bigint;
  v_ltax     bigint;
  v_cn       uuid;
  v_cn_no    text;
  v_taxacc   text;
  v_jid      uuid;
begin
  if current_staff_id() is null then raise exception 'Not signed in.'; end if;
  if not (has_permission('pos.sell') or is_manager_or_above()) then
    raise exception 'You cannot take a return.';
  end if;

  select * into v_b from bills where id = p_bill for update;
  if not found then raise exception 'No such bill.'; end if;
  if v_b.status <> 'final' then
    raise exception 'Only a completed bill can be returned against.';
  end if;
  if v_b.customer_id is null then
    raise exception 'This bill has no customer, so there is nobody to hold the credit. Add the customer to the bill first.';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Nothing to return.';
  end if;

  select coalesce(max(substring(return_no from '[0-9]+$')::int), 0) + 1 into v_seq
  from sales_returns where return_no like 'RET/' || to_char(current_date, 'YYMM') || '/%';
  v_no := 'RET/' || to_char(current_date, 'YYMM') || '/' || lpad(v_seq::text, 4, '0');

  insert into sales_returns (return_no, bill_id, customer_id, location_id,
                             session_id, reason, note, created_by)
  values (v_no, p_bill, v_b.customer_id, v_b.location_id,
          p_session, p_reason, p_note, current_staff_id())
  returning id into v_ret;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_bl from bill_lines
     where id = (v_line->>'bill_line_id')::uuid and bill_id = p_bill;
    if not found then raise exception 'That line is not on this bill.'; end if;

    v_qty := greatest(0, coalesce((v_line->>'qty')::int, 0));
    if v_qty = 0 then continue; end if;

    -- A piece can only come back once, across every earlier return.
    select coalesce(sum(rl.qty), 0) into v_already
    from sales_return_lines rl
    where rl.bill_line_id = v_bl.id;

    if v_qty > v_bl.qty - v_already then
      raise exception 'Only % of that line is left to return.', v_bl.qty - v_already;
    end if;

    v_unit := case when v_bl.qty > 0
                   then round(v_bl.line_total_paise::numeric / v_bl.qty)
                   else 0 end;
    v_ltotal := v_unit * v_qty;

    -- Prices are GST-inclusive, so the tax comes back out of the total.
    v_ltax := round(v_ltotal::numeric * v_bl.gst_rate / (100 + v_bl.gst_rate));

    insert into sales_return_lines (return_id, bill_line_id, item_id, qty,
                                    unit_price_paise, line_total_paise,
                                    gst_rate, restock, reason)
    values (v_ret, v_bl.id, v_bl.item_id, v_qty, v_unit, v_ltotal,
            v_bl.gst_rate, coalesce((v_line->>'restock')::boolean, true),
            v_line->>'reason');

    v_gross   := v_gross + v_ltotal;
    v_tax     := v_tax + v_ltax;
    v_taxable := v_taxable + (v_ltotal - v_ltax);
  end loop;

  if v_gross = 0 then raise exception 'Nothing to return.'; end if;

  update sales_returns
     set gross_paise = v_gross, taxable_paise = v_taxable,
         cgst_paise = case when v_b.is_interstate then 0 else v_tax / 2 end,
         sgst_paise = case when v_b.is_interstate then 0 else v_tax - (v_tax / 2) end,
         igst_paise = case when v_b.is_interstate then v_tax else 0 end,
         total_paise = v_gross
   where id = v_ret;

  insert into stock_ledger (item_id, location_id, qty_delta, reason,
                            ref_type, ref_id, created_by, note)
  select rl.item_id, v_b.location_id, rl.qty, 'sale_return'::stock_reason,
         'sales_return', v_ret, current_staff_id(), rl.reason
  from sales_return_lines rl
  where rl.return_id = v_ret and rl.restock;

  select coalesce(max(substring(note_no from '[0-9]+$')::int), 0) + 1 into v_seq
  from customer_credit_notes where note_no like 'CN/' || to_char(current_date, 'YYMM') || '/%';
  v_cn_no := 'CN/' || to_char(current_date, 'YYMM') || '/' || lpad(v_seq::text, 4, '0');

  insert into customer_credit_notes (note_no, customer_id, source_return_id,
                                     amount_paise, valid_until, note, created_by)
  values (v_cn_no, v_b.customer_id, v_ret, v_gross,
          current_date + 365, 'Return against ' || v_b.bill_no, current_staff_id())
  returning id into v_cn;

  -- Reverse the sale and park the money as a liability: we owe them
  -- goods, not cash, until the credit is spent.
  v_taxacc := case when v_b.is_interstate then 'igst_output' else 'gst_output' end;
  begin
    v_jid := post_journal(
      jsonb_build_array(
        jsonb_build_object('account', 'sales', 'debit', v_taxable,
                           'customer_id', v_b.customer_id),
        jsonb_build_object('account', v_taxacc, 'debit', v_tax),
        jsonb_build_object('account', 'customer_credit', 'credit', v_gross,
                           'customer_id', v_b.customer_id, 'note', v_cn_no)),
      'Sales return ' || v_no, current_date, 'sales_return', v_ret,
      v_b.location_id, true);
    update sales_returns set journal_id = v_jid where id = v_ret;
  exception when others then
    raise warning 'Return % did not post to the books: %', v_no, sqlerrm;
  end;

  return jsonb_build_object(
    'return_id', v_ret, 'return_no', v_no,
    'credit_note_id', v_cn, 'credit_note_no', v_cn_no,
    'amount_paise', v_gross, 'tax_paise', v_tax);
end $$;

create or replace view customer_credit_balances
with (security_invoker = true) as
select n.id as credit_note_id, n.note_no, n.customer_id,
       c.name as customer_name, c.phone as customer_phone,
       n.amount_paise,
       coalesce(a.spent, 0)::bigint                    as spent_paise,
       (n.amount_paise - coalesce(a.spent, 0))::bigint as balance_paise,
       n.valid_until, n.created_at, n.void_at, n.source_return_id,
       r.return_no,
       (n.void_at is null
        and (n.valid_until is null or n.valid_until >= current_date)
        and n.amount_paise - coalesce(a.spent, 0) > 0) as usable
from customer_credit_notes n
join customers c on c.id = n.customer_id
left join sales_returns r on r.id = n.source_return_id
left join lateral (
  select sum(al.amount_paise) spent
  from customer_credit_allocations al
  where al.credit_note_id = n.id
) a on true;

create or replace function customer_credits(p_customer uuid)
returns table (
  credit_note_id uuid, note_no text, amount_paise bigint,
  spent_paise bigint, balance_paise bigint, valid_until date,
  return_no text, created_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select b.credit_note_id, b.note_no, b.amount_paise, b.spent_paise,
         b.balance_paise, b.valid_until, b.return_no, b.created_at
  from customer_credit_balances b
  where b.customer_id = p_customer and b.usable
    and current_staff_id() is not null
  order by b.created_at;
$$;

-- Spending a credit settles the receivable the bill created out of the
-- liability booked when the goods came back, never out of cash.
create or replace function redeem_customer_credit(p_bill uuid, p_amount bigint)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_b bills%rowtype; v_left bigint := p_amount; v_take bigint;
  v_n record; v_used jsonb := '[]'::jsonb; v_jid uuid;
begin
  if current_staff_id() is null then raise exception 'Not signed in.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nothing to redeem.'; end if;

  select * into v_b from bills where id = p_bill for update;
  if not found then raise exception 'No such bill.'; end if;
  if v_b.customer_id is null then
    raise exception 'A credit note belongs to a customer, and this bill has none.';
  end if;

  -- Oldest note first, so nothing sits until it expires.
  for v_n in
    select credit_note_id, note_no, balance_paise
    from customer_credit_balances
    where customer_id = v_b.customer_id and usable
    order by created_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_n.balance_paise);
    insert into customer_credit_allocations (credit_note_id, bill_id, amount_paise, created_by)
    values (v_n.credit_note_id, p_bill, v_take, current_staff_id());
    v_used := v_used || jsonb_build_object('note_no', v_n.note_no, 'amount_paise', v_take);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'That customer only has % of credit left.', fmt_paise(p_amount - v_left);
  end if;

  insert into bill_payments (bill_id, method, amount_paise, reference)
  values (p_bill, 'store_credit', p_amount,
          (select string_agg(e->>'note_no', ', ') from jsonb_array_elements(v_used) e));

  begin
    v_jid := post_journal(
      jsonb_build_array(
        jsonb_build_object('account', 'customer_credit', 'debit', p_amount,
                           'customer_id', v_b.customer_id),
        jsonb_build_object('account', 'receivable', 'credit', p_amount,
                           'customer_id', v_b.customer_id,
                           'note', 'Credit spent on ' || v_b.bill_no)),
      'Credit redeemed on ' || v_b.bill_no, current_date,
      'credit_redeem', p_bill, v_b.location_id, true);
  exception when others then
    raise warning 'Credit redemption on % did not post: %', v_b.bill_no, sqlerrm;
  end;

  return jsonb_build_object('redeemed_paise', p_amount, 'notes', v_used);
end $$;

create or replace function bill_for_return(p_bill uuid)
returns table (
  bill_line_id uuid, item_id uuid, item_name text, barcode text,
  qty integer, returned_qty integer, returnable_qty integer,
  unit_price_paise bigint, line_total_paise bigint, gst_rate numeric
)
language sql stable security definer set search_path to 'public'
as $$
  select bl.id, bl.item_id, i.name, i.barcode, bl.qty,
         coalesce(r.returned, 0)::int,
         (bl.qty - coalesce(r.returned, 0))::int,
         case when bl.qty > 0
              then round(bl.line_total_paise::numeric / bl.qty)::bigint
              else 0 end,
         bl.line_total_paise, bl.gst_rate
  from bill_lines bl
  join items i on i.id = bl.item_id
  left join lateral (
    select sum(rl.qty) returned from sales_return_lines rl
    where rl.bill_line_id = bl.id
  ) r on true
  where bl.bill_id = p_bill and current_staff_id() is not null
  order by bl.line_no;
$$;

-- Renaming a piece at pricing time: the first moment anyone looks
-- properly at a new item, and where vendor shorthand gets noticed. The
-- old name is already on printed bills, so the change is recorded.
create or replace function rename_item(p_item uuid, p_name text)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_old text; v_new text := btrim(coalesce(p_name, ''));
begin
  if not (has_permission('pricing.manage') or has_permission('catalog.manage')) then
    raise exception 'You cannot rename items.';
  end if;
  if length(v_new) < 2 then raise exception 'Give the item a name.'; end if;
  if length(v_new) > 120 then raise exception 'That name is too long.'; end if;

  select name into v_old from items where id = p_item;
  if v_old is null then raise exception 'No such item.'; end if;
  if v_old = v_new then return v_new; end if;

  update items set name = v_new where id = p_item;

  insert into audit_log (table_name, row_id, action, old_data, new_data, changed_by)
  values ('items', p_item, 'rename',
          jsonb_build_object('name', v_old), jsonb_build_object('name', v_new),
          current_staff_id());

  return v_new;
end $$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'record_sales_return(uuid, jsonb, text, text, uuid)',
    'redeem_customer_credit(uuid, bigint)',
    'customer_credits(uuid)',
    'bill_for_return(uuid)',
    'rename_item(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end $$;
