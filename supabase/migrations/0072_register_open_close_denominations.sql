-- Opening and closing now count the drawer denomination by denomination
-- and store the breakdown, so a short drawer can be traced to which pile
-- was miscounted rather than argued about.
--
-- Both functions gain a defaulted parameter, which Postgres treats as a
-- NEW overload rather than a replacement -- the stale signatures are
-- dropped explicitly below, or PostgREST resolution becomes a coin toss.
-- The two-argument open_register, left over from before terminals
-- existed, goes with them.

create or replace function open_register(
  p_location uuid,
  p_float_paise bigint default 0,
  p_terminal text default 'Counter 1'::text,
  p_denoms jsonb default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if current_staff_id() is null then raise exception 'Not signed in.'; end if;

  select id into v_id from register_sessions
   where location_id = p_location
     and terminal = coalesce(nullif(btrim(p_terminal), ''), 'Counter 1')
     and status = 'open';
  if found then return v_id; end if;

  insert into register_sessions (location_id, opened_by, opening_float_paise,
                                 terminal, open_denominations)
  values (p_location, current_staff_id(), coalesce(p_float_paise, 0),
          coalesce(nullif(btrim(p_terminal), ''), 'Counter 1'), p_denoms)
  returning id into v_id;

  return v_id;
end $$;

drop function if exists open_register(uuid, bigint);
drop function if exists open_register(uuid, bigint, text);

-- Expected cash now comes from register_drawer, so pay-ins, pay-outs and
-- counter expenses stop showing up as an unexplained variance.
create or replace function close_register(
  p_session uuid,
  p_counted_paise bigint,
  p_note text default null,
  p_denoms jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s        register_sessions%rowtype;
  v_d        record;
  v_var      bigint;
  v_totals   jsonb;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or the owner can close the register.';
  end if;

  select * into v_s from register_sessions where id = p_session for update;
  if not found then raise exception 'No such register session.'; end if;
  if v_s.status = 'closed' then raise exception 'That register is already closed.'; end if;

  select * into v_d from register_drawer(p_session);

  v_var := coalesce(p_counted_paise, 0) - v_d.expected_paise;

  select jsonb_object_agg(method, total) into v_totals
  from (
    select p.method, sum(p.amount_paise)::bigint total
    from bill_payments p join bills b on b.id = p.bill_id
    where b.session_id = p_session and b.status = 'final'
    group by p.method
  ) t;

  update register_sessions
     set status = 'closed', closed_by = current_staff_id(), closed_at = now(),
         counted_cash_paise = p_counted_paise,
         expected_cash_paise = v_d.expected_paise,
         variance_paise = v_var,
         close_note = p_note,
         close_denominations = p_denoms
   where id = p_session;

  perform queue_event('register.closed',
    jsonb_build_object(
      'location', (select name from locations where id = v_s.location_id),
      'date',     to_char(coalesce(v_s.opened_at, now()), 'DD Mon YYYY'),
      'cash',     fmt_paise(coalesce((v_totals->>'cash')::bigint, 0)),
      'card',     fmt_paise(coalesce((v_totals->>'card')::bigint, 0)),
      'upi',      fmt_paise(coalesce((v_totals->>'upi')::bigint, 0)),
      'total',    fmt_paise(v_d.sales_paise),
      'variance', fmt_paise(v_var)),
    'register', p_session, current_staff_id(), v_s.location_id, null);

  return jsonb_build_object(
    'expected_paise', v_d.expected_paise,
    'counted_paise',  coalesce(p_counted_paise, 0),
    'variance_paise', v_var,
    'sales_paise',    v_d.sales_paise,
    'float_paise',    v_d.opening_float_paise,
    'cash_sales_paise', v_d.cash_sales_paise,
    'pay_in_paise',   v_d.pay_in_paise,
    'pay_out_paise',  v_d.pay_out_paise,
    'expense_paise',  v_d.expense_paise,
    'bills',          v_d.bills,
    'by_method',      coalesce(v_totals, '{}'::jsonb));
end $$;

drop function if exists close_register(uuid, bigint, text);

-- The Sales dashboard reads the same figure, so it has to agree.
create or replace function register_status()
returns table (
  session_id uuid, location_id uuid, location_code text, terminal text,
  opened_by text, opened_at timestamptz, float_paise bigint, bills integer,
  sales_paise bigint, cash_paise bigint, expected_cash_paise bigint
)
language sql
stable
set search_path to 'public'
as $$
  select r.id, r.location_id, l.code, r.terminal, s.name, r.opened_at,
         r.opening_float_paise,
         coalesce(b.bills, 0), coalesce(b.sales, 0),
         coalesce(c.cash, 0),
         (r.opening_float_paise + coalesce(c.cash, 0)
          + coalesce(m.pay_in, 0) - coalesce(m.pay_out, 0)
          - coalesce(m.expense, 0))::bigint
  from register_sessions r
  join locations l on l.id = r.location_id
  left join staff s on s.id = r.opened_by
  left join lateral (
    select count(*)::int bills, coalesce(sum(total_paise), 0)::bigint sales
    from bills where session_id = r.id and status = 'final'
  ) b on true
  left join lateral (
    select coalesce(sum(p.amount_paise), 0)::bigint cash
    from bill_payments p join bills bb on bb.id = p.bill_id
    where bb.session_id = r.id and bb.status = 'final' and p.method = 'cash'
  ) c on true
  left join lateral (
    select
      coalesce(sum(amount_paise) filter (where kind = 'pay_in'),  0)::bigint pay_in,
      coalesce(sum(amount_paise) filter (where kind = 'pay_out'), 0)::bigint pay_out,
      coalesce(sum(amount_paise) filter (where kind = 'expense'), 0)::bigint expense
    from register_cash_movements where session_id = r.id
  ) m on true
  where r.status = 'open'
  order by l.code, r.terminal;
$$;
