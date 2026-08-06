-- One source of truth for what should physically be in the till.
--
-- Every column is alias-qualified. session_id, location_id, terminal and
-- status are all OUT parameter names AND real columns on the tables
-- below; an unqualified reference silently resolves to the parameter,
-- which is null, and Postgres raises "column reference is ambiguous".

create or replace function register_drawer(p_session uuid)
returns table (
  session_id           uuid,
  terminal             text,
  location_id          uuid,
  location_name        text,
  status               text,
  opened_at            timestamptz,
  opening_float_paise  bigint,
  bills                integer,
  sales_paise          bigint,
  cash_sales_paise     bigint,
  card_paise           bigint,
  upi_paise            bigint,
  other_paise          bigint,
  pay_in_paise         bigint,
  pay_out_paise        bigint,
  expense_paise        bigint,
  expected_paise       bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if current_staff_id() is null then
    raise exception 'Not signed in.';
  end if;

  return query
  select r.id, r.terminal, r.location_id, l.name, r.status, r.opened_at,
         r.opening_float_paise,
         coalesce(b.n_bills, 0),
         coalesce(b.sales, 0),
         coalesce(p.cash, 0),
         coalesce(p.card, 0),
         coalesce(p.upi, 0),
         coalesce(p.other, 0),
         coalesce(m.pay_in, 0),
         coalesce(m.pay_out, 0),
         coalesce(m.expense, 0),
         -- The float, plus cash taken over the counter, plus anything
         -- paid in, less anything taken out or spent. Card and UPI never
         -- touch the drawer.
         (r.opening_float_paise + coalesce(p.cash, 0)
          + coalesce(m.pay_in, 0) - coalesce(m.pay_out, 0)
          - coalesce(m.expense, 0))::bigint
  from register_sessions r
  join locations l on l.id = r.location_id
  left join lateral (
    select count(*)::int n_bills, coalesce(sum(b2.total_paise), 0)::bigint sales
    from bills b2
    where b2.session_id = r.id and b2.status = 'final'
  ) b on true
  left join lateral (
    select
      coalesce(sum(bp.amount_paise) filter (where bp.method = 'cash'), 0)::bigint cash,
      coalesce(sum(bp.amount_paise) filter (where bp.method = 'card'), 0)::bigint card,
      coalesce(sum(bp.amount_paise) filter (where bp.method = 'upi'),  0)::bigint upi,
      coalesce(sum(bp.amount_paise) filter (where bp.method not in ('cash','card','upi')), 0)::bigint other
    from bill_payments bp
    join bills bb on bb.id = bp.bill_id
    where bb.session_id = r.id and bb.status = 'final'
  ) p on true
  left join lateral (
    select
      coalesce(sum(cm.amount_paise) filter (where cm.kind = 'pay_in'),  0)::bigint pay_in,
      coalesce(sum(cm.amount_paise) filter (where cm.kind = 'pay_out'), 0)::bigint pay_out,
      coalesce(sum(cm.amount_paise) filter (where cm.kind = 'expense'), 0)::bigint expense
    from register_cash_movements cm
    where cm.session_id = r.id
  ) m on true
  where r.id = p_session;
end $$;

-- Money in or out of the till that is not a sale.
--
-- record_expense is owner-only, which is right for the office and wrong
-- for a counter: the person holding the tea receipt is whoever is on
-- shift. This is the counter's door into the same books.
create or replace function register_cash_movement(
  p_session uuid,
  p_kind    text,
  p_amount_paise bigint,
  p_reason  text default null,
  p_account uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s      register_sessions%rowtype;
  v_id     uuid;
  v_jid    uuid;
  v_code   text;
  v_no     text;
  v_seq    int;
  v_eid    uuid;
  v_drawer jsonb;
begin
  if current_staff_id() is null then
    raise exception 'Not signed in.';
  end if;
  if not (has_permission('pos.sell') or is_manager_or_above()) then
    raise exception 'You cannot move cash in this drawer.';
  end if;
  if p_kind not in ('pay_in','pay_out','expense') then
    raise exception 'Unknown kind of cash movement.';
  end if;
  if coalesce(p_amount_paise, 0) <= 0 then
    raise exception 'Enter an amount.';
  end if;

  select * into v_s from register_sessions where id = p_session for update;
  if not found then raise exception 'No such register session.'; end if;
  if v_s.status <> 'open' then
    raise exception 'That register is closed. Cash cannot be moved in or out of it.';
  end if;

  -- An expense is real money leaving the business, so it has to land in
  -- the books. A pay-in or pay-out only moves cash between the drawer
  -- and the safe: the same asset account either side, so there is
  -- nothing to post and posting it would clutter the journal with
  -- self-cancelling pairs.
  if p_kind = 'expense' then
    if p_account is null then
      select id into p_account from ledger_accounts where system_key = 'misc_expense';
    end if;
    select code into v_code from ledger_accounts
     where id = p_account and kind = 'expense' and active;
    if v_code is null then
      raise exception 'Pick a valid expense category.';
    end if;

    select coalesce(max(substring(expense_no from '[0-9]+$')::int), 0) + 1
      into v_seq
    from expenses where expense_no like 'EXP/' || to_char(current_date, 'YYMM') || '/%';
    v_no := 'EXP/' || to_char(current_date, 'YYMM') || '/' || lpad(v_seq::text, 4, '0');

    insert into expenses (expense_no, expense_date, account_id, location_id,
                          payee, amount_paise, tax_paise, itc_eligible,
                          total_paise, method, note, status, created_by)
    values (v_no, current_date, p_account, v_s.location_id,
            null, p_amount_paise, 0, false,
            p_amount_paise, 'cash',
            coalesce(p_reason, 'Counter petty cash'), 'paid', current_staff_id())
    returning id into v_eid;

    v_jid := post_journal(
      jsonb_build_array(
        jsonb_build_object('account', v_code, 'debit', p_amount_paise, 'note', v_no),
        jsonb_build_object('account', 'cash', 'credit', p_amount_paise,
                           'note', coalesce(p_reason, 'Counter petty cash'))),
      'Counter expense ' || v_no, current_date, 'expense', v_eid,
      v_s.location_id, true);

    update expenses set journal_id = v_jid where id = v_eid;
  end if;

  insert into register_cash_movements (session_id, location_id, kind,
                                       amount_paise, reason, account_id,
                                       journal_id, created_by)
  values (p_session, v_s.location_id, p_kind, p_amount_paise,
          nullif(btrim(coalesce(p_reason, '')), ''), p_account, v_jid,
          current_staff_id())
  returning id into v_id;

  select to_jsonb(d) into v_drawer from register_drawer(p_session) d;
  return jsonb_build_object('id', v_id, 'drawer', v_drawer);
end $$;

create or replace function session_cash_movements(p_session uuid)
returns table (
  id uuid, kind text, amount_paise bigint, reason text,
  account_name text, staff_name text, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id, m.kind, m.amount_paise, m.reason, a.name, s.name, m.created_at
  from register_cash_movements m
  left join ledger_accounts a on a.id = m.account_id
  left join staff s on s.id = m.created_by
  where m.session_id = p_session
    and current_staff_id() is not null
  order by m.created_at desc;
$$;
