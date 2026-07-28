-- =====================================================================
-- 0015_vendor_picklist.sql
--
-- Found in RLS smoke testing, not by the type checker: the vendors table
-- is manager-and-above, but the inward flow requires counter staff to
-- pick a vendor when a carton arrives. As written, staff could not
-- record goods received at all.
--
-- Fix: a narrow picklist exposing only what the dropdown needs. This
-- view is deliberately SECURITY DEFINER (the default) so it reads past
-- the RLS policy on vendors. That is safe because the view cannot expose
-- payment terms, GSTIN or the vendor ledger: those columns are not in
-- it. Opening the base table instead would have leaked all three.
-- =====================================================================

create or replace view vendor_picklist as
select v.id, v.name, v.city
from vendors v
where v.active
order by v.name;

comment on view vendor_picklist is
  'Vendor dropdown for the inward form. Id, name and city only. The full '
  'vendors table stays manager-and-above; this view is the one narrow '
  'hole and it exposes nothing commercially sensitive.';

revoke all on vendor_picklist from public, anon;
grant select on vendor_picklist to authenticated;
