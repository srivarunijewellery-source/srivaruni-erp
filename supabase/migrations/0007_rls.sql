-- =====================================================================
-- 0007_rls.sql
-- Row level security.
--
-- Two hard rules:
--   1. Cost never reaches a staff session. Not hidden in the UI, not
--      returned by the API at all.
--   2. Stock never moves except through a security-definer function.
--      Direct inserts into stock_ledger are revoked from staff.
-- =====================================================================

alter table locations               enable row level security;
alter table staff                   enable row level security;
alter table vendors                 enable row level security;
alter table customers               enable row level security;
alter table categories              enable row level security;
alter table item_types              enable row level security;
alter table attribute_options       enable row level security;
alter table items                   enable row level security;
alter table item_photos             enable row level security;
alter table barcode_aliases         enable row level security;
alter table item_costs              enable row level security;
alter table inwards                 enable row level security;
alter table inward_lines            enable row level security;
alter table inward_header_costs     enable row level security;
alter table inward_line_costs       enable row level security;
alter table inward_additional_costs enable row level security;
alter table inward_attachments      enable row level security;
alter table stock_ledger            enable row level security;
alter table stock_balances          enable row level security;
alter table transfers               enable row level security;
alter table transfer_lines          enable row level security;
alter table vendor_returns          enable row level security;
alter table vendor_return_lines     enable row level security;
alter table stock_adjustments       enable row level security;
alter table stock_adjustment_lines  enable row level security;
alter table audit_log               enable row level security;

-- =============================================== reference data (read all)

create policy locations_read on locations
  for select using (current_staff_id() is not null);
create policy locations_write on locations
  for all using (is_owner()) with check (is_owner());

create policy categories_read on categories
  for select using (current_staff_id() is not null);
create policy categories_write on categories
  for all using (is_owner()) with check (is_owner());

create policy item_types_read on item_types
  for select using (current_staff_id() is not null);
create policy item_types_write on item_types
  for all using (is_owner()) with check (is_owner());

-- Staff read attribute values but can never add to the list. This is the
-- single guard that stops the catalog rotting into free text.
create policy attr_read on attribute_options
  for select using (current_staff_id() is not null);
create policy attr_write on attribute_options
  for all using (is_owner()) with check (is_owner());

-- ------------------------------------------------------------- staff

create policy staff_self_read on staff
  for select using (is_manager_or_above() or auth_user_id = current_auth_uid());
create policy staff_owner_write on staff
  for all using (is_owner()) with check (is_owner());

-- ------------------------------------------------------------ vendors
-- Vendor records carry payment terms and ledger context. Manager and
-- above only; a counter staffer has no reason to browse them.

create policy vendors_read on vendors
  for select using (is_manager_or_above());
create policy vendors_write on vendors
  for all using (is_owner()) with check (is_owner());

-- ----------------------------------------------------------- customers

create policy customers_read on customers
  for select using (current_staff_id() is not null);
create policy customers_insert on customers
  for insert with check (current_staff_id() is not null);
create policy customers_update on customers
  for update using (current_staff_id() is not null);

-- ========================================================== COST TABLES
-- Owner only. No read, no write, no exceptions.

create policy item_costs_owner on item_costs
  for all using (is_owner()) with check (is_owner());

create policy inward_header_costs_owner on inward_header_costs
  for all using (is_owner()) with check (is_owner());

create policy inward_line_costs_owner on inward_line_costs
  for all using (is_owner()) with check (is_owner());

create policy inward_addl_costs_owner on inward_additional_costs
  for all using (is_owner()) with check (is_owner());

-- =============================================================== items

create policy items_read on items
  for select using (current_staff_id() is not null);

create policy items_insert on items
  for insert with check (current_staff_id() is not null);

create policy items_update on items
  for update using (current_staff_id() is not null);

-- Column-level protection is not available in RLS, so pricing and status
-- are guarded by trigger instead.
create or replace function items_pricing_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_staff_id() is not null and not is_owner() then
    if new.mrp_paise           is distinct from old.mrp_paise
    or new.selling_price_paise is distinct from old.selling_price_paise
    or new.status              is distinct from old.status
    or new.barcode             is distinct from old.barcode then
      raise exception 'Only the owner can change price, status or barcode';
    end if;
  end if;
  return new;
end
$$;

create trigger items_pricing_guard_trg
  before update on items
  for each row execute function items_pricing_guard();

create policy item_photos_read on item_photos
  for select using (current_staff_id() is not null);
create policy item_photos_write on item_photos
  for all using (current_staff_id() is not null)
  with check (current_staff_id() is not null);

create policy barcode_aliases_read on barcode_aliases
  for select using (current_staff_id() is not null);
create policy barcode_aliases_write on barcode_aliases
  for all using (is_owner()) with check (is_owner());

-- ============================================================= inwards
-- Staff sees only inwards at their own location. Owner sees everything.

create policy inwards_read on inwards
  for select using (is_owner() or location_id = my_location_id());

create policy inwards_insert on inwards
  for insert with check (
    current_staff_id() is not null
    and (is_owner() or location_id = my_location_id())
  );

-- Staff can only edit while the document is still a draft. Once submitted
-- it is out of their hands.
create policy inwards_update on inwards
  for update using (
    is_owner()
    or (location_id = my_location_id() and status = 'draft')
  );

create policy inward_lines_read on inward_lines
  for select using (
    is_owner()
    or exists (select 1 from inwards i
               where i.id = inward_id and i.location_id = my_location_id())
  );

create policy inward_lines_write on inward_lines
  for all using (
    is_owner()
    or exists (select 1 from inwards i
               where i.id = inward_id
                 and i.location_id = my_location_id()
                 and i.status = 'draft')
  )
  with check (
    is_owner()
    or exists (select 1 from inwards i
               where i.id = inward_id
                 and i.location_id = my_location_id()
                 and i.status = 'draft')
  );

create policy inward_attachments_read on inward_attachments
  for select using (
    is_owner()
    or exists (select 1 from inwards i
               where i.id = inward_id and i.location_id = my_location_id())
  );

create policy inward_attachments_write on inward_attachments
  for all using (current_staff_id() is not null)
  with check (current_staff_id() is not null);

-- ======================================================== stock tables
-- Read scoped to location. Writes go through functions only.

create policy stock_ledger_read on stock_ledger
  for select using (is_owner() or location_id = my_location_id());

create policy stock_balances_read on stock_balances
  for select using (is_owner() or location_id = my_location_id());

create policy transfers_read on transfers
  for select using (
    is_owner()
    or from_location_id = my_location_id()
    or to_location_id = my_location_id()
  );
create policy transfers_write on transfers
  for all using (is_manager_or_above()) with check (is_manager_or_above());

create policy transfer_lines_all on transfer_lines
  for all using (is_manager_or_above()) with check (is_manager_or_above());

create policy vendor_returns_read on vendor_returns
  for select using (is_owner() or location_id = my_location_id());
create policy vendor_returns_write on vendor_returns
  for all using (is_manager_or_above()) with check (is_manager_or_above());

create policy vendor_return_lines_all on vendor_return_lines
  for all using (is_manager_or_above()) with check (is_manager_or_above());

create policy adjustments_read on stock_adjustments
  for select using (is_owner() or location_id = my_location_id());
create policy adjustments_write on stock_adjustments
  for all using (is_manager_or_above()) with check (is_manager_or_above());

create policy adjustment_lines_all on stock_adjustment_lines
  for all using (is_manager_or_above()) with check (is_manager_or_above());

-- ---------------------------------------------------------- audit log

create policy audit_log_owner on audit_log
  for select using (is_owner());

-- ============================================================== grants
-- The ledger is written by functions, never by clients. This is what
-- makes "stock cannot leave except through a document" structural
-- rather than a UI convention.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to authenticated';
    execute 'grant select, insert, update on all tables in schema public to authenticated';
    execute 'revoke insert, update, delete on stock_ledger from authenticated';
    execute 'revoke insert, update, delete on stock_balances from authenticated';
    execute 'revoke all on audit_log from authenticated';
    execute 'grant select on audit_log to authenticated';
    execute 'grant usage, select on all sequences in schema public to authenticated';
  end if;
end
$$;
