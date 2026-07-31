-- =====================================================================
-- 0061_coupon_functions.sql  -- generation, assignment, void
-- =====================================================================

create or replace function public.generate_coupon_batch(
  p_name text, p_prefix text, p_kind text,
  p_discount_bps int, p_discount_paise bigint, p_min_purchase_paise bigint,
  p_valid_from date, p_valid_to date,
  p_start_number int, p_count int, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  v_batch uuid; v_prefix text; v_pad int;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can generate coupons';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the batch a name'; end if;

  v_prefix := upper(regexp_replace(coalesce(p_prefix, ''), '[^A-Za-z0-9-]', '', 'g'));
  if v_prefix = '' then
    raise exception 'Give the coupon code a prefix, for example SV-DIWALI';
  end if;

  insert into coupon_batches (
    name, prefix, discount_kind, discount_bps, discount_paise,
    min_purchase_paise, valid_from, valid_to, start_number, count_issued, notes, created_by)
  values (
    trim(p_name), v_prefix, p_kind,
    case when p_kind = 'percent' then p_discount_bps end,
    case when p_kind = 'amount'  then p_discount_paise end,
    coalesce(p_min_purchase_paise, 0), p_valid_from, p_valid_to,
    p_start_number, p_count, nullif(trim(p_notes), ''), current_staff_id())
  returning id into v_batch;

  -- Width fixed by the widest serial in the batch, so codes sort and read
  -- consistently: 200 coupons from 1 give 001..200, not ragged lengths.
  v_pad := greatest(3, length((p_start_number + p_count - 1)::text));

  insert into coupons (batch_id, code, serial)
  select v_batch, v_prefix || '-' || lpad(s::text, v_pad, '0'), s
  from generate_series(p_start_number, p_start_number + p_count - 1) as s;

  return v_batch;
end
$function$;

create or replace function public.assign_coupon(p_coupon uuid, p_customer uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare c coupons%rowtype; b coupon_batches%rowtype;
begin
  if current_staff_id() is null then raise exception 'Not authenticated'; end if;

  select * into c from coupons where id = p_coupon for update;
  if not found then raise exception 'Coupon not found'; end if;
  if c.status = 'redeemed' then raise exception 'That coupon has already been redeemed'; end if;
  if c.status = 'void' then raise exception 'That coupon has been voided'; end if;

  select * into b from coupon_batches where id = c.batch_id;
  if b.valid_to < current_date then
    raise exception 'That coupon expired on %', to_char(b.valid_to, 'DD Mon YYYY');
  end if;
  if not exists (select 1 from customers where id = p_customer) then
    raise exception 'Customer not found';
  end if;

  -- Reassignment while unredeemed is a correction, not a write-off.
  update coupons
  set status = 'assigned', customer_id = p_customer,
      assigned_at = now(), assigned_by = current_staff_id()
  where id = p_coupon;
end
$function$;

create or replace function public.unassign_coupon(p_coupon uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare c coupons%rowtype;
begin
  if current_staff_id() is null then raise exception 'Not authenticated'; end if;
  select * into c from coupons where id = p_coupon for update;
  if not found then raise exception 'Coupon not found'; end if;
  if c.status <> 'assigned' then
    raise exception 'Only an assigned coupon can be taken back (currently %)', c.status;
  end if;

  update coupons
  set status = 'available', customer_id = null, assigned_at = null, assigned_by = null
  where id = p_coupon;
end
$function$;

create or replace function public.void_coupon(p_coupon uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $function$
declare c coupons%rowtype;
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can void a coupon';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for voiding'; end if;

  select * into c from coupons where id = p_coupon for update;
  if not found then raise exception 'Coupon not found'; end if;
  if c.status = 'redeemed' then raise exception 'A redeemed coupon cannot be voided'; end if;

  update coupons
  set status = 'void', void_reason = trim(p_reason),
      customer_id = null, assigned_at = null, assigned_by = null
  where id = p_coupon;
end
$function$;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('generate_coupon_batch','assign_coupon','unassign_coupon','void_coupon')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
