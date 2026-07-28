-- =====================================================================
-- 0011_hardening.sql
-- Fixes found by the Supabase security advisor after the first push.
--
-- The serious one: dispatch_transfer and receive_transfer are SECURITY
-- DEFINER, so they BYPASS RLS, and neither carried an authorization
-- check. Anyone holding a transfer UUID, including an unauthenticated
-- anon caller hitting /rest/v1/rpc/, could move stock between stores.
-- submit_inward had the same shape.
--
-- Rule going forward: every SECURITY DEFINER function states its own
-- authorization in its first statement. RLS on the underlying tables
-- does not protect it, because that is precisely what DEFINER skips.
-- =====================================================================

-- ---------------------------------------------- 1. view leak (ERROR)
-- Missing security_invoker meant this view ran as its owner and would
-- have exposed owner-only staging data to any reader.
create or replace view unmapped_legacy_categories
with (security_invoker = true) as
select s.category as legacy_value, count(*) as rows
from staging_vasy_products s
left join legacy_category_map m on m.legacy_value = s.category
where m.legacy_value is null and s.category is not null and s.category <> ''
group by s.category
order by rows desc;

-- ------------------------------------------ 2. pin mutable search_path

create or replace function current_auth_uid()
returns uuid
language plpgsql stable set search_path = public
as $$
declare
  v uuid;
begin
  begin
    execute 'select auth.uid()' into v;
  exception when others then
    v := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  end;
  return v;
end
$$;

create or replace function stock_ledger_immutable()
returns trigger
language plpgsql set search_path = public
as $$
begin
  raise exception 'stock_ledger is append only. Post a reversing entry instead.';
end
$$;

create or replace function vendors_set_state_code()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.gstin is not null and length(new.gstin) >= 2 then
    new.state_code := left(new.gstin, 2);
  end if;
  new.updated_at := now();
  return new;
end
$$;

create or replace function next_barcode()
returns text
language plpgsql volatile set search_path = public
as $$
declare
  v bigint;
begin
  v := nextval('item_barcode_seq');
  return 'SV' || case when v < 100000 then lpad(v::text, 5, '0') else v::text end;
end
$$;

create or replace function allocate_paise(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql immutable set search_path = public
as $$
declare
  n         int := coalesce(array_length(p_weights, 1), 0);
  total_w   numeric := 0;
  result    bigint[] := '{}';
  rem       numeric[] := '{}';
  used      boolean[] := '{}';
  assigned  bigint := 0;
  leftover  bigint;
  exact     numeric;
  best      numeric;
  best_i    int;
  i         int;
  w         numeric;
begin
  if n = 0 or p_total is null then
    return '{}';
  end if;

  for i in 1 .. n loop
    total_w := total_w + greatest(coalesce(p_weights[i], 0), 0);
  end loop;

  if total_w = 0 then
    for i in 1 .. n loop
      result[i] := p_total / n;
    end loop;
    leftover := p_total - (p_total / n) * n;
    for i in 1 .. leftover loop
      result[i] := result[i] + 1;
    end loop;
    return result;
  end if;

  for i in 1 .. n loop
    w        := greatest(coalesce(p_weights[i], 0), 0);
    exact    := (p_total::numeric * w) / total_w;
    result[i] := floor(exact)::bigint;
    rem[i]    := exact - floor(exact);
    used[i]   := false;
    assigned  := assigned + result[i];
  end loop;

  leftover := p_total - assigned;

  while leftover > 0 loop
    best := -1;
    best_i := null;
    for i in 1 .. n loop
      if not used[i] and rem[i] > best then
        best := rem[i];
        best_i := i;
      end if;
    end loop;

    if best_i is null then
      result[1] := result[1] + leftover;
      leftover := 0;
    else
      result[best_i] := result[best_i] + 1;
      used[best_i] := true;
      leftover := leftover - 1;
    end if;
  end loop;

  return result;
end
$$;

-- ==================== 3. authorization inside DEFINER functions ======

create or replace function submit_inward(p_inward uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v inwards%rowtype;
begin
  select * into v from inwards where id = p_inward for update;
  if not found then
    raise exception 'Inward % not found', p_inward;
  end if;

  -- DEFINER bypasses RLS, so the location check must happen here.
  if current_staff_id() is null then
    raise exception 'Not authenticated';
  end if;
  if not is_owner() and v.location_id is distinct from my_location_id() then
    raise exception 'You can only submit inwards at your own location';
  end if;

  if v.status <> 'draft' then
    raise exception 'Only a draft inward can be submitted (currently %)', v.status;
  end if;
  if not exists (select 1 from inward_lines where inward_id = p_inward) then
    raise exception 'Cannot submit an inward with no lines';
  end if;
  if not exists (
    select 1 from inward_attachments
    where inward_id = p_inward and kind = 'invoice'
  ) then
    raise exception 'Attach a photo of the vendor invoice before submitting';
  end if;

  update inwards
  set status = 'submitted', submitted_at = now()
  where id = p_inward;
end
$$;

create or replace function dispatch_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t transfers%rowtype;
  v_transit uuid;
begin
  -- Stock movement between stores is a manager-and-above action.
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can dispatch a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  if not is_owner() and t.from_location_id is distinct from my_location_id() then
    raise exception 'You can only dispatch from your own location';
  end if;

  if t.status <> 'draft' then
    raise exception 'Transfer is already %', t.status;
  end if;

  v_transit := coalesce(
    t.transit_location_id,
    (select id from locations where kind = 'transit' and active order by code limit 1)
  );
  if v_transit is null then
    raise exception 'No transit location configured';
  end if;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.from_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, v_transit, l.qty_sent, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  update transfers
  set status = 'dispatched',
      transit_location_id = v_transit,
      dispatched_by = current_staff_id(),
      dispatched_at = now()
  where id = p_transfer;
end
$$;

create or replace function receive_transfer(p_transfer uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t transfers%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can receive a transfer';
  end if;

  select * into t from transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer % not found', p_transfer; end if;

  -- The receiving store confirms receipt, not the sending one. This is
  -- what makes a loss in transit attributable to a specific leg.
  if not is_owner() and t.to_location_id is distinct from my_location_id() then
    raise exception 'You can only receive a transfer at your own location';
  end if;

  if t.status <> 'dispatched' then
    raise exception 'Transfer must be dispatched before receipt (currently %)', t.status;
  end if;

  update transfer_lines set qty_received = qty_sent
  where transfer_id = p_transfer and qty_received is null;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.transit_location_id, -l.qty_sent, 'transfer_out', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, t.to_location_id, l.qty_received, 'transfer_in', 'transfer', p_transfer, current_staff_id()
  from transfer_lines l where l.transfer_id = p_transfer and l.qty_received > 0;

  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by, note)
  select l.item_id, t.transit_location_id, (l.qty_sent - l.qty_received), 'count_variance',
         'transfer', p_transfer, current_staff_id(), 'Short received in transit'
  from transfer_lines l
  where l.transfer_id = p_transfer and l.qty_received < l.qty_sent;

  update transfers
  set status = 'received', received_by = current_staff_id(), received_at = now()
  where id = p_transfer;
end
$$;

-- ============================ 4. execute grants ======================
-- anon is unauthenticated. It has no business calling any of this.
-- Trigger functions are never called directly; PostgreSQL checks trigger
-- privileges at CREATE TRIGGER time, not on each fire, so revoking
-- EXECUTE does not break them.

do $$
begin
  -- PostgreSQL grants EXECUTE on every new function to PUBLIC by default,
  -- and every role inherits that. Revoking from anon and authenticated
  -- alone changes nothing; PUBLIC has to go first.
  execute 'revoke execute on all functions in schema public from public';

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on all functions in schema public to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on all functions in schema public from authenticated';

    -- RLS helpers: policy expressions are evaluated as the querying
    -- role, so these must remain executable or every policy fails.
    execute 'grant execute on function current_auth_uid()        to authenticated';
    execute 'grant execute on function current_staff_id()        to authenticated';
    execute 'grant execute on function current_staff_role()      to authenticated';
    execute 'grant execute on function my_location_id()          to authenticated';
    execute 'grant execute on function is_owner()                to authenticated';
    execute 'grant execute on function is_manager_or_above()     to authenticated';

    -- Business RPCs the app actually calls.
    execute 'grant execute on function submit_inward(uuid)              to authenticated';
    execute 'grant execute on function approve_inward(uuid)             to authenticated';
    execute 'grant execute on function reject_inward(uuid, text)        to authenticated';
    execute 'grant execute on function dispatch_transfer(uuid)          to authenticated';
    execute 'grant execute on function receive_transfer(uuid)           to authenticated';
    execute 'grant execute on function approve_vendor_return(uuid)      to authenticated';
    execute 'grant execute on function approve_adjustment(uuid)         to authenticated';
    execute 'grant execute on function next_inward_doc_no(uuid)         to authenticated';
    execute 'grant execute on function next_barcode()                   to authenticated';
    execute 'grant execute on function resolve_barcode(text)            to authenticated';
    execute 'grant execute on function resolve_legacy_category(text)    to authenticated';
    execute 'grant execute on function allocate_paise(bigint, bigint[]) to authenticated';
  end if;
end
$$;

-- Note on the remaining pg_trgm advisor warning: the extension stays in
-- public deliberately. Moving it would require every gin_trgm_ops index
-- (items, vendors, customers) to resolve the operator class through a
-- different schema, and a broken trigram index costs more than this
-- warning is worth. authenticated has no CREATE on public, so the
-- function-shadowing risk the lint guards against does not apply.
