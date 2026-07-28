-- =====================================================================
-- 0002_masters.sql
-- Vendors (with GST registration status) and customers.
--
-- Vendor GST status drives PURCHASE-side tax only. It has no bearing on
-- outward GST: you charge GST on every sale regardless of who supplied
-- the goods.
-- =====================================================================

create table vendors (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique,
  name               text not null,
  gst_status         vendor_gst_status not null default 'unregistered',
  gstin              text,
  state_code         text,
  city               text,
  address            text,
  contact_name       text,
  phone              text,
  email              text,
  payment_terms_days int not null default 0,
  legacy_id          text,
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A registered vendor must carry a valid-length GSTIN.
  constraint vendor_registered_needs_gstin check (
    gst_status <> 'registered'
    or (gstin is not null and length(gstin) = 15)
  ),

  -- An unregistered vendor must not carry one. This is the flag that
  -- suppresses all purchase tax downstream.
  constraint vendor_unregistered_has_no_gstin check (
    gst_status <> 'unregistered' or gstin is null
  )
);

comment on column vendors.gst_status is
  'registered   = charges GST, input credit available, cost booked ex-GST. '
  'composition  = bill of supply, no GST, no credit, full amount is cost. '
  'unregistered = no GST at all, full amount is cost.';

comment on column vendors.state_code is
  'Auto-derived from GSTIN when present. Drives IGST vs CGST/SGST. '
  'Jaipur vendors are 08 (Rajasthan) against your 36 (Telangana).';

create index vendors_name_trgm on vendors using gin (name gin_trgm_ops);
create index vendors_active_idx on vendors (active) where active;

-- Derive state code from GSTIN so interstate detection is never hand-keyed.
create or replace function vendors_set_state_code()
returns trigger
language plpgsql
as $$
begin
  if new.gstin is not null and length(new.gstin) >= 2 then
    new.state_code := left(new.gstin, 2);
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger vendors_state_code_trg
  before insert or update on vendors
  for each row execute function vendors_set_state_code();

create trigger vendors_audit_trg
  after insert or update or delete on vendors
  for each row execute function audit_trigger();

-- ------------------------------------------------------------ customers

create table customers (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null unique,
  name         text,
  dob          date,
  anniversary  date,
  gstin        text,
  city         text,
  notes        text,
  legacy_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint customer_phone_shape check (phone ~ '^[0-9]{10,15}$')
);

comment on table customers is
  'Phone-keyed. Name optional so billing is never blocked by data entry. '
  'dob and anniversary feed festival and wedding campaigns later.';

create index customers_name_trgm on customers using gin (name gin_trgm_ops);
