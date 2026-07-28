-- =====================================================================
-- 0001_foundations.sql
-- Extensions, enums, locations, staff, session helpers, audit log,
-- and the paise allocation function used for landed-cost proration.
--
-- Money is stored as BIGINT paise everywhere. Never float.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- enums

create type staff_role as enum ('owner', 'manager', 'staff');

create type location_kind as enum ('store', 'transit', 'damage');

create type vendor_gst_status as enum ('registered', 'composition', 'unregistered');

create type inward_status as enum ('draft', 'submitted', 'approved', 'rejected');

create type item_status as enum ('pending_pricing', 'active', 'inactive', 'discontinued');

create type stock_reason as enum (
  'migration_opening',
  'inward',
  'sale',
  'sale_return',
  'transfer_out',
  'transfer_in',
  'adjustment',
  'damage',
  'vendor_return',
  'count_variance'
);

create type allocation_basis as enum ('value', 'quantity');

-- ------------------------------------------------------------ locations

create table locations (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  kind          location_kind not null default 'store',
  gstin         text,
  state_code    text not null default '36',
  address       text,
  bill_prefix   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on column locations.state_code is
  'GST state code. 36 = Telangana, 08 = Rajasthan. Drives interstate detection.';
comment on table locations is
  'Physical and virtual stock locations. Transit and damage are virtual: '
  'stock parked there is not saleable but is still accounted for.';

-- ---------------------------------------------------------------- staff

create table staff (
  id                uuid primary key default gen_random_uuid(),
  auth_user_id      uuid unique,
  name              text not null,
  phone             text,
  role              staff_role not null default 'staff',
  home_location_id  uuid references locations(id),
  pin_hash          text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

comment on column staff.auth_user_id is 'Maps to supabase auth.users.id';
comment on column staff.pin_hash is 'Short PIN for fast counter user-switch at POS';

create index staff_auth_user_id_idx on staff (auth_user_id);
create index staff_location_idx on staff (home_location_id);

-- ----------------------------------------------------- session helpers
-- These are used by every RLS policy, so they are STABLE and indexed.
-- In local/test environments auth.uid() may not exist; the wrapper
-- degrades to NULL rather than erroring.

create or replace function current_auth_uid()
returns uuid
language plpgsql
stable
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

create or replace function current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from staff
  where auth_user_id = current_auth_uid() and active
  limit 1
$$;

create or replace function current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role from staff
  where auth_user_id = current_auth_uid() and active
  limit 1
$$;

create or replace function my_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select home_location_id from staff
  where auth_user_id = current_auth_uid() and active
  limit 1
$$;

create or replace function is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_staff_role() = 'owner', false)
$$;

create or replace function is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_staff_role() in ('owner', 'manager'), false)
$$;

-- ------------------------------------------------------------ audit log

create table audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

create index audit_log_table_row_idx on audit_log (table_name, row_id);
create index audit_log_changed_at_idx on audit_log (changed_at desc);

create or replace function audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (table_name, row_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    current_staff_id()
  );
  return coalesce(new, old);
end
$$;

-- ------------------------------------------- landed cost allocation
-- Largest-remainder allocation. Guarantees sum(result) = p_total exactly,
-- so prorated freight never drifts by a paisa across many lines.

create or replace function allocate_paise(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
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

  -- No usable weights: split evenly, remainder to the earliest lines.
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

comment on function allocate_paise is
  'Largest-remainder proration. sum(result) is always exactly p_total.';
