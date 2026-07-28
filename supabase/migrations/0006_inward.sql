-- =====================================================================
-- 0005_inward.sql
-- Material inward. No PO required.
--
-- Flow:
--   DRAFT      staff opens against a vendor, adds items, attaches the
--              vendor invoice photo. Items exist but are pending_pricing
--              and cannot be billed.
--   SUBMITTED  staff done. Nothing has hit the stock ledger yet.
--   APPROVED   owner enters rates, confirms MRP, accepts. Only then does
--              stock post and items go active.
--   REJECTED   back to draft with a note. Nothing posts.
--
-- Pricing authority never leaves the owner. Staff never sees cost.
-- =====================================================================

create sequence inward_doc_seq start 1;

create table inwards (
  id                  uuid primary key default gen_random_uuid(),
  doc_no              text not null unique,
  location_id         uuid not null references locations(id),
  vendor_id           uuid not null references vendors(id),
  status              inward_status not null default 'draft',

  vendor_invoice_no   text,
  vendor_invoice_date date,
  notes               text,

  created_by          uuid not null references staff(id),
  created_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  approved_by         uuid references staff(id),
  approved_at         timestamptz,
  rejected_reason     text,
  rejected_at         timestamptz,

  idempotency_key     uuid unique
);

create index inwards_status_idx   on inwards (status, location_id);
create index inwards_vendor_idx   on inwards (vendor_id, created_at desc);
create index inwards_location_idx on inwards (location_id, created_at desc);

create or replace function next_inward_doc_no(p_location uuid)
returns text
language sql
volatile
set search_path = public
as $$
  select coalesce((select code from locations where id = p_location), 'XX')
         || '-IN-' || lpad(nextval('inward_doc_seq')::text, 6, '0')
$$;

create trigger inwards_audit_trg
  after insert or update or delete on inwards
  for each row execute function audit_trigger();

-- ------------------------------------------------- lines (staff visible)

create table inward_lines (
  id          uuid primary key default gen_random_uuid(),
  inward_id   uuid not null references inwards(id) on delete cascade,
  item_id     uuid not null references items(id),
  qty         integer not null check (qty > 0),
  qty_short   integer not null default 0 check (qty_short >= 0),
  line_no     int,
  note        text,
  created_by  uuid references staff(id),
  created_at  timestamptz not null default now(),

  -- THE rule, enforced by the database rather than by the UI.
  -- An item belongs to exactly one inward, forever. A design received
  -- again next month is a new SKU with a new barcode, never a quantity
  -- top-up on this one. Two pieces that look identical are not, and
  -- fungible quantities would hide plating, finish and substitution
  -- differences that matter in jewellery.
  --
  -- Side effect: item cost is fixed for the item's lifetime, so stock
  -- valuation is exact with no FIFO or weighted-average logic anywhere.
  constraint one_inward_per_item unique (item_id)
);

comment on column inward_lines.qty_short is
  'Invoice says 12, carton had 10 -> qty 10, qty_short 2. The claim is '
  'recorded without stock that never existed ever entering the ledger. '
  'This is NOT a vendor return.';

create index inward_lines_inward_idx on inward_lines (inward_id, line_no);
create index inward_lines_item_idx on inward_lines (item_id);

-- --------------------------------------------------- costs (owner only)

create table inward_header_costs (
  inward_id             uuid primary key references inwards(id) on delete cascade,
  tax_treatment         vendor_gst_status not null,
  is_interstate         boolean not null default false,
  itc_eligible          boolean not null default false,
  invoice_taxable_paise bigint not null default 0,
  invoice_tax_paise     bigint not null default 0,
  invoice_total_paise   bigint not null default 0
);

comment on column inward_header_costs.itc_eligible is
  'True only for registered vendors. Decides whether purchase GST is '
  'excluded from item cost (recoverable) or loaded into it.';

create table inward_line_costs (
  inward_line_id          uuid primary key references inward_lines(id) on delete cascade,
  rate_paise              bigint not null check (rate_paise >= 0),
  gst_rate                numeric(5,2) not null default 0,
  taxable_paise           bigint not null default 0,
  cgst_paise              bigint not null default 0,
  sgst_paise              bigint not null default 0,
  igst_paise              bigint not null default 0,
  allocated_addl_paise    bigint not null default 0,
  landed_unit_cost_paise  bigint not null default 0,
  -- Exact unit cost carried at sub-paisa precision. Integer division
  -- of a lot total across its units loses up to a paisa per SKU, which
  -- compounds across thousands of SKUs and quietly overstates margin.
  -- numeric is exact decimal, not floating point.
  landed_unit_cost_exact  numeric(18,6) not null default 0
);

create table inward_additional_costs (
  id                uuid primary key default gen_random_uuid(),
  inward_id         uuid not null references inwards(id) on delete cascade,
  cost_type         text not null check (
                      cost_type in ('freight', 'packing', 'hamali',
                                    'courier', 'insurance', 'other')),
  amount_paise      bigint not null check (amount_paise >= 0),
  gst_paise         bigint not null default 0 check (gst_paise >= 0),
  gst_itc_eligible  boolean not null default false,
  basis             allocation_basis not null default 'value',
  note              text
);

comment on table inward_additional_costs is
  'Prorated across lines by value or quantity using largest-remainder '
  'allocation, so the split always sums back to the exact amount. '
  'If the GST on freight is itself credit-eligible it is excluded from cost. '
  'Freight from a GTA may attract reverse charge; confirm with your CA.';

create index inward_addl_costs_idx on inward_additional_costs (inward_id);

-- ----------------------------------------------------------- attachments

create table inward_attachments (
  id            uuid primary key default gen_random_uuid(),
  inward_id     uuid not null references inwards(id) on delete cascade,
  storage_path  text not null,
  kind          text not null default 'invoice' check (kind in ('invoice', 'other')),
  uploaded_by   uuid references staff(id),
  created_at    timestamptz not null default now()
);

comment on table inward_attachments is
  'Since staff never enters rates, the invoice photo is the only source '
  'of cost data. An inward cannot be submitted without one.';

create index inward_attachments_idx on inward_attachments (inward_id);

-- ================================================================ submit

create or replace function submit_inward(p_inward uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v inwards%rowtype;
begin
  select * into v from inwards where id = p_inward for update;
  if not found then
    raise exception 'Inward % not found', p_inward;
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

-- ================================================================ reject

create or replace function reject_inward(p_inward uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'Only the owner can reject an inward';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A rejection reason is required';
  end if;

  update inwards
  set status = 'draft',
      rejected_reason = p_reason,
      rejected_at = now(),
      submitted_at = null
  where id = p_inward and status = 'submitted';

  if not found then
    raise exception 'Inward % is not awaiting approval', p_inward;
  end if;
end
$$;

-- =============================================================== approve
-- Everything below happens in one transaction: tax computation, freight
-- proration, cost history, item activation, stock posting.

create or replace function approve_inward(p_inward uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inw     inwards%rowtype;
  v_hdr     inward_header_costs%rowtype;
  v_vendor  vendors%rowtype;
  v_loc     locations%rowtype;
  v_ids     uuid[];
  v_weights bigint[];
  v_alloc   bigint[];
  r         record;
  i         int;
begin
  if not is_owner() then
    raise exception 'Only the owner can approve an inward';
  end if;

  select * into v_inw from inwards where id = p_inward for update;
  if not found then
    raise exception 'Inward % not found', p_inward;
  end if;

  if v_inw.status <> 'submitted' then
    raise exception 'Inward must be submitted before approval (currently %)', v_inw.status;
  end if;

  select * into v_vendor from vendors where id = v_inw.vendor_id;
  select * into v_loc    from locations where id = v_inw.location_id;

  -- Tax treatment is derived from the vendor, never hand-picked.
  insert into inward_header_costs (inward_id, tax_treatment, is_interstate, itc_eligible)
  values (
    p_inward,
    v_vendor.gst_status,
    coalesce(v_vendor.state_code, v_loc.state_code) is distinct from v_loc.state_code,
    v_vendor.gst_status = 'registered'
  )
  on conflict (inward_id) do update
    set tax_treatment = excluded.tax_treatment,
        is_interstate = excluded.is_interstate,
        itc_eligible  = excluded.itc_eligible;

  select * into v_hdr from inward_header_costs where inward_id = p_inward;

  -- Guard rails.
  if exists (
    select 1 from inward_lines l
    left join inward_line_costs c on c.inward_line_id = l.id
    where l.inward_id = p_inward and c.inward_line_id is null
  ) then
    raise exception 'Every line needs a purchase rate before approval';
  end if;

  if exists (
    select 1 from inward_lines l
    join items it on it.id = l.item_id
    where l.inward_id = p_inward
      and (it.mrp_paise is null or it.selling_price_paise is null)
  ) then
    raise exception 'Every item needs MRP and selling price before approval';
  end if;

  -- ---- per line tax --------------------------------------------------
  -- Unregistered and composition vendors produce zero tax. That is the
  -- whole point of the vendor flag.
  update inward_line_costs c
  set taxable_paise = c.rate_paise * l.qty,
      cgst_paise = case
        when v_hdr.tax_treatment = 'registered' and not v_hdr.is_interstate
        then round(c.rate_paise::numeric * l.qty * c.gst_rate / 200.0)
        else 0 end,
      sgst_paise = case
        when v_hdr.tax_treatment = 'registered' and not v_hdr.is_interstate
        then round(c.rate_paise::numeric * l.qty * c.gst_rate / 200.0)
        else 0 end,
      igst_paise = case
        when v_hdr.tax_treatment = 'registered' and v_hdr.is_interstate
        then round(c.rate_paise::numeric * l.qty * c.gst_rate / 100.0)
        else 0 end,
      allocated_addl_paise = 0
  from inward_lines l
  where l.id = c.inward_line_id and l.inward_id = p_inward;

  -- ---- prorate additional costs -------------------------------------
  -- Each cost row allocates on its own basis, accumulating per line.
  v_ids := array(
    select l.id from inward_lines l
    where l.inward_id = p_inward
    order by l.line_no nulls last, l.id
  );

  for r in
    select * from inward_additional_costs where inward_id = p_inward
  loop
    if r.basis = 'quantity' then
      v_weights := array(
        select l.qty::bigint from inward_lines l
        where l.inward_id = p_inward
        order by l.line_no nulls last, l.id
      );
    else
      v_weights := array(
        select c.taxable_paise
        from inward_lines l
        join inward_line_costs c on c.inward_line_id = l.id
        where l.inward_id = p_inward
        order by l.line_no nulls last, l.id
      );
    end if;

    v_alloc := allocate_paise(
      r.amount_paise + case when r.gst_itc_eligible then 0 else r.gst_paise end,
      v_weights
    );

    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      update inward_line_costs
      set allocated_addl_paise = allocated_addl_paise + v_alloc[i]
      where inward_line_id = v_ids[i];
    end loop;
  end loop;

  -- ---- landed unit cost ----------------------------------------------
  -- Registered vendor: GST excluded, it is recoverable and is not a cost.
  -- Otherwise: whole amount is cost.
  update inward_line_costs c
  set landed_unit_cost_exact = (
        (case when v_hdr.itc_eligible
              then c.taxable_paise
              else c.taxable_paise + c.cgst_paise + c.sgst_paise + c.igst_paise
         end)
        + c.allocated_addl_paise
      )::numeric / l.qty,
      landed_unit_cost_paise = round((
        (case when v_hdr.itc_eligible
              then c.taxable_paise
              else c.taxable_paise + c.cgst_paise + c.sgst_paise + c.igst_paise
         end)
        + c.allocated_addl_paise
      )::numeric / l.qty)
  from inward_lines l
  where l.id = c.inward_line_id and l.inward_id = p_inward;

  -- ---- header totals --------------------------------------------------
  update inward_header_costs h
  set invoice_taxable_paise = t.taxable,
      invoice_tax_paise     = t.tax,
      invoice_total_paise   = t.taxable + t.tax
  from (
    select coalesce(sum(c.taxable_paise), 0) as taxable,
           coalesce(sum(c.cgst_paise + c.sgst_paise + c.igst_paise), 0) as tax
    from inward_lines l
    join inward_line_costs c on c.inward_line_id = l.id
    where l.inward_id = p_inward
  ) t
  where h.inward_id = p_inward;

  -- ---- cost history ----------------------------------------------------
  insert into item_costs (item_id, purchase_rate_paise, landed_cost_paise,
                          landed_cost_exact, source_inward_id)
  select l.item_id, c.rate_paise, c.landed_unit_cost_paise,
         c.landed_unit_cost_exact, p_inward
  from inward_lines l
  join inward_line_costs c on c.inward_line_id = l.id
  where l.inward_id = p_inward;

  -- ---- activate items --------------------------------------------------
  update items
  set status = 'active', updated_at = now()
  where id in (select item_id from inward_lines where inward_id = p_inward)
    and status = 'pending_pricing';

  -- ---- post stock ------------------------------------------------------
  insert into stock_ledger (item_id, location_id, qty_delta, reason, ref_type, ref_id, created_by)
  select l.item_id, v_inw.location_id, l.qty, 'inward', 'inward', p_inward, current_staff_id()
  from inward_lines l
  where l.inward_id = p_inward;

  update inwards
  set status = 'approved',
      approved_by = current_staff_id(),
      approved_at = now()
  where id = p_inward;
end
$$;

comment on function approve_inward is
  'The pricing gate. Nothing becomes sellable until the owner approves.';
