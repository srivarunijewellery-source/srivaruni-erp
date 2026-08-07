-- ── Correcting a bill ────────────────────────────────────────────────
--
-- An edit is a CANCEL and a REISSUE, never an in-place rewrite.
--
-- trg_bill_autopost returns early when a status is unchanged on UPDATE,
-- so editing amounts in place would leave the ledger holding the
-- original figures while the bill showed new ones. Flipping the status
-- to cancelled is what makes the reversing journal post at all. Going
-- back through pos_finalise_bill then means tax, coupons, stock and
-- posting all follow the same rules as any other sale, instead of a
-- second copy of that arithmetic drifting out of step.
alter table bills
  add column if not exists replaced_by_bill_id uuid references bills(id),
  add column if not exists replaces_bill_id    uuid references bills(id),
  add column if not exists edit_reason         text;

create index if not exists bills_replaces_idx on bills (replaces_bill_id)
  where replaces_bill_id is not null;

create or replace function edit_bill(
  p_bill uuid, p_lines jsonb, p_payments jsonb,
  p_customer uuid default null, p_sold_by uuid default null,
  p_manual_discount_paise bigint default 0, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_b bills%rowtype; v_sess register_sessions%rowtype;
  v_new uuid; v_no text;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or the owner can correct a bill.';
  end if;

  select * into v_b from bills where id = p_bill for update;
  if not found then raise exception 'No such bill.'; end if;
  if v_b.status <> 'final' then
    raise exception 'Only a completed bill can be corrected.';
  end if;
  if v_b.replaced_by_bill_id is not null then
    raise exception 'That bill has already been corrected. Edit the replacement instead.';
  end if;

  -- The close is the line. Once a register is closed its drawer has been
  -- counted and its takings reconciled, so changing a bill behind it
  -- would make yesterday's variance a lie.
  if v_b.session_id is null then
    raise exception 'That bill is not attached to a register session and cannot be corrected here.';
  end if;
  select * into v_sess from register_sessions where id = v_b.session_id;
  if v_sess.status <> 'open' then
    raise exception 'That counter has been closed, so its bills are final. Take a return against it instead.';
  end if;

  insert into stock_ledger (item_id, location_id, qty_delta, reason,
                            ref_type, ref_id, created_by, note)
  select bl.item_id, v_b.location_id, bl.qty, 'sale_return'::stock_reason,
         'bill_edit', v_b.id, current_staff_id(), 'Corrected ' || v_b.bill_no
  from bill_lines bl where bl.bill_id = v_b.id;

  update bills
     set status = 'cancelled',
         edit_reason = coalesce(p_reason, 'Corrected at the counter')
   where id = v_b.id;

  v_new := pos_finalise_bill(
    gen_random_uuid(), v_b.location_id, p_lines, p_payments,
    coalesce(p_customer, v_b.customer_id), coalesce(p_sold_by, v_b.sold_by),
    null, coalesce(p_manual_discount_paise, 0), now(), false,
    'Corrects ' || v_b.bill_no, v_b.session_id);

  update bills set replaces_bill_id = v_b.id where id = v_new;
  update bills set replaced_by_bill_id = v_new where id = v_b.id;
  select bill_no into v_no from bills where id = v_new;

  insert into audit_log (table_name, row_id, action, old_data, new_data, changed_by)
  values ('bills', v_b.id, 'edit',
          jsonb_build_object('bill_no', v_b.bill_no, 'total_paise', v_b.total_paise),
          jsonb_build_object('bill_no', v_no, 'reason', p_reason),
          current_staff_id());

  return jsonb_build_object('new_bill_id', v_new, 'new_bill_no', v_no,
                            'cancelled_bill_no', v_b.bill_no);
end $$;

-- ── Owner dashboard ──────────────────────────────────────────────────
--
-- The reference dashboard read a VasyERP export whose interesting
-- dimension was "brand". This system has no brands: the equivalent cuts
-- are category, item type, plating, stone, colour and vendor.
--
-- Cancelled bills are excluded everywhere, which matters more now that
-- correcting a bill creates one -- otherwise a fixed bill counts twice,
-- as the mistake and as the fix.
create or replace function dash_sales_by_period(
  p_from date, p_to date, p_location uuid default null,
  p_grain text default 'month'
)
returns table (
  bucket date, label text, bills integer, qty integer,
  revenue_paise bigint, cost_paise bigint, margin_paise bigint
)
language sql stable security definer set search_path to 'public'
as $$
  select d.bucket,
    to_char(d.bucket,
      case p_grain when 'day' then 'DD Mon' when 'week' then '"w/c" DD Mon'
                   when 'year' then 'YYYY' else 'Mon YY' end),
    count(distinct d.bill_id)::int,
    coalesce(sum(d.qty), 0)::int,
    coalesce(sum(d.line_total_paise), 0)::bigint,
    coalesce(sum(d.cost_paise), 0)::bigint,
    (coalesce(sum(d.line_total_paise), 0) - coalesce(sum(d.cost_paise), 0))::bigint
  from (
    select date_trunc(
             case p_grain when 'day' then 'day' when 'week' then 'week'
                          when 'year' then 'year' else 'month' end,
             b.bill_date)::date as bucket,
           b.id as bill_id, bl.qty, bl.line_total_paise,
           coalesce(c.landed_cost_paise, 0) * bl.qty as cost_paise
    from bills b
    join bill_lines bl on bl.bill_id = b.id
    left join item_latest_cost c on c.item_id = bl.item_id
    where b.status = 'final'
      and b.bill_date between p_from and p_to
      and (p_location is null or b.location_id = p_location)
      and is_owner()
  ) d
  group by d.bucket order by d.bucket;
$$;

create or replace function dash_sales_by_dimension(
  p_from date, p_to date, p_dimension text default 'category',
  p_location uuid default null
)
returns table (
  dimension text, bucket date, label text,
  qty integer, revenue_paise bigint, margin_paise bigint
)
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
      case p_dimension
        when 'category'  then cat.name   when 'item_type' then it.name
        when 'plating'   then pl.value   when 'stone'     then st.value
        when 'colour'    then co.value   when 'vendor'    then v.name
        when 'branch'    then l.name     else cat.name end, 'Unspecified'),
    date_trunc('month', b.bill_date)::date,
    to_char(date_trunc('month', b.bill_date), 'Mon YY'),
    coalesce(sum(bl.qty), 0)::int,
    coalesce(sum(bl.line_total_paise), 0)::bigint,
    (coalesce(sum(bl.line_total_paise), 0)
     - coalesce(sum(coalesce(c.landed_cost_paise, 0) * bl.qty), 0))::bigint
  from bills b
  join bill_lines bl on bl.bill_id = b.id
  join items i on i.id = bl.item_id
  left join categories cat on cat.id = i.category_id
  left join item_types it on it.id = i.item_type_id
  left join attribute_options pl on pl.id = i.plating_id
  left join attribute_options st on st.id = i.stone_id
  left join attribute_options co on co.id = i.colour_id
  left join vendors v on v.id = i.vendor_id
  left join locations l on l.id = b.location_id
  left join item_latest_cost c on c.item_id = bl.item_id
  where b.status = 'final'
    and b.bill_date between p_from and p_to
    and (p_location is null or b.location_id = p_location)
    and is_owner()
  group by 1, 2, 3 order by 1, 2;
$$;

create or replace function dash_expenses_by_month(
  p_from date, p_to date, p_location uuid default null
)
returns table (account text, bucket date, label text, total_paise bigint)
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(a.name, 'Unclassified'),
         date_trunc('month', e.expense_date)::date,
         to_char(date_trunc('month', e.expense_date), 'Mon YY'),
         coalesce(sum(e.total_paise), 0)::bigint
  from expenses e
  left join ledger_accounts a on a.id = e.account_id
  where e.expense_date between p_from and p_to
    and e.status <> 'void'
    and (p_location is null or e.location_id = p_location)
    and is_owner()
  group by 1, 2, 3 order by 1, 2;
$$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'edit_bill(uuid, jsonb, jsonb, uuid, uuid, bigint, text)',
    'dash_sales_by_period(date, date, uuid, text)',
    'dash_sales_by_dimension(date, date, text, uuid)',
    'dash_expenses_by_month(date, date, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end $$;
