-- =====================================================================
-- 0003_catalog.sql
-- Categories, item types, controlled attribute options, items, photos,
-- barcode generation, and legacy barcode aliases for the Vasy migration.
--
-- Design note: items are FLAT. No product/variant split. Fashion
-- jewellery designs are largely one-off rather than a size/colour
-- matrix, and the inward modal is a single form. A design_code column
-- allows grouping later without a migration.
--
-- Staff cannot create categories, types, or attribute values. Freeform
-- text in those fields is what turns a catalog into garbage.
-- =====================================================================

create table categories (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  hsn                text not null default '7117',
  gst_rate           numeric(5,2) not null default 3.00,
  markup_multiplier  numeric(6,3) not null default 2.500,
  sort_order         int not null default 0,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

comment on column categories.hsn is
  'Default HSN. 7117 is imitation jewellery. Confirm the current rate with your CA.';
comment on column categories.markup_multiplier is
  'MRP auto-suggests as landed cost x this multiplier at approval time, '
  'so pricing 40 lines is a confirm rather than 40 keystrokes.';

create table item_types (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id),
  name         text not null,
  sort_order   int not null default 0,
  active       boolean not null default true,
  unique (category_id, name)
);

-- ---------------------------------------------------- attribute options
-- Composite PK on (attr_key, id) lets item FKs guarantee that a column
-- named colour_id can only ever point at a colour option. Enforced by
-- the database, not by the UI.

create table attribute_options (
  id          uuid not null default gen_random_uuid(),
  attr_key    text not null check (attr_key in ('colour', 'plating', 'stone', 'size')),
  value       text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  primary key (attr_key, id),
  unique (attr_key, value)
);

create unique index attribute_options_id_uq on attribute_options (id);

-- --------------------------------------------------------- barcodes

-- Continues the live Vasy series rather than starting a parallel one.
-- Vasy's highest issued code is SV16691, so new items begin at SV16692.
-- The older SRIVARU##### series is closed and simply migrates as-is.
create sequence item_barcode_seq start 16692;

create or replace function next_barcode()
returns text
language plpgsql
volatile
as $$
declare
  v bigint;
begin
  v := nextval('item_barcode_seq');
  -- lpad TRUNCATES when the value is wider than the pad width, so
  -- lpad('100000', 5, '0') would silently return '10000' and collide.
  -- Guard the rollover past SV99999 explicitly.
  return 'SV' || case when v < 100000 then lpad(v::text, 5, '0') else v::text end;
end
$$;

comment on function next_barcode is
  'Server-side generation so both stores can create items concurrently '
  'with no collision. Continues the Vasy SV##### series from SV16692. '
  'Code128 encodes this fine.';

-- ------------------------------------------------------------- items

create table items (
  id              uuid primary key default gen_random_uuid(),
  barcode         text not null unique default next_barcode(),
  name            text not null,
  category_id     uuid not null references categories(id),
  item_type_id    uuid references item_types(id),

  -- Controlled attributes. The *_key columns are pinned by CHECK and
  -- participate in the composite FK so a wrong-typed option is impossible.
  colour_id       uuid,
  colour_key      text not null default 'colour'  check (colour_key = 'colour'),
  plating_id      uuid,
  plating_key     text not null default 'plating' check (plating_key = 'plating'),
  stone_id        uuid,
  stone_key       text not null default 'stone'   check (stone_key = 'stone'),
  size_id         uuid,
  size_key        text not null default 'size'    check (size_key = 'size'),

  hsn                  text,
  gst_rate             numeric(5,2),

  -- Set by the owner at inward approval. Never by staff.
  mrp_paise            bigint check (mrp_paise is null or mrp_paise >= 0),
  selling_price_paise  bigint check (selling_price_paise is null or selling_price_paise >= 0),

  status          item_status not null default 'pending_pricing',
  design_code     text,
  vendor_id       uuid references vendors(id),
  legacy_barcode  text,
  legacy_id       text,
  created_by      uuid references staff(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (colour_key,  colour_id)  references attribute_options (attr_key, id),
  foreign key (plating_key, plating_id) references attribute_options (attr_key, id),
  foreign key (stone_key,   stone_id)   references attribute_options (attr_key, id),
  foreign key (size_key,    size_id)    references attribute_options (attr_key, id),

  -- An item can never go saleable without a price.
  constraint item_active_needs_price check (
    status <> 'active'
    or (mrp_paise is not null and selling_price_paise is not null)
  )
);

comment on column items.status is
  'pending_pricing -> created by staff at inward, NOT billable. '
  'active -> priced and approved by owner, billable.';

comment on column items.design_code is
  'Reserved and left NULL in v1. Every inward creates a fresh SKU, so '
  'there is nothing to group by yet. The v2 matching feature (same '
  'vendor, name and photos) populates this retroactively to enable '
  'cross-lot sell-through analysis. Do not have staff fill it.';

create index items_name_trgm     on items using gin (name gin_trgm_ops);
create index items_category_idx  on items (category_id);
create index items_type_idx      on items (item_type_id);
create index items_status_idx    on items (status);
create index items_vendor_idx    on items (vendor_id);
create index items_legacy_idx    on items (legacy_barcode) where legacy_barcode is not null;

-- Inherit HSN and GST rate from the category unless explicitly overridden.
create or replace function items_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c categories%rowtype;
begin
  if new.hsn is null or new.gst_rate is null then
    select * into c from categories where id = new.category_id;
    new.hsn      := coalesce(new.hsn, c.hsn);
    new.gst_rate := coalesce(new.gst_rate, c.gst_rate);
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger items_defaults_trg
  before insert or update on items
  for each row execute function items_defaults();

create trigger items_audit_trg
  after insert or update or delete on items
  for each row execute function audit_trigger();

-- ------------------------------------------------------- item photos

create table item_photos (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  storage_path  text not null,
  thumb_path    text,
  width         int,
  height        int,
  bytes         int,
  is_primary    boolean not null default false,
  sort_order    int not null default 0,
  uploaded_by   uuid references staff(id),
  created_at    timestamptz not null default now()
);

comment on table item_photos is
  'Paths into Supabase Storage. Compress client-side before upload and '
  'upload async so staff never wait on the network mid-inward.';

create index item_photos_item_idx on item_photos (item_id, sort_order);
create unique index item_photos_one_primary on item_photos (item_id) where is_primary;

-- ---------------------------------------------------- legacy barcodes
-- If Vasy issued piece-level barcodes, many old codes collapse onto one
-- SKU here. Tagged stock already on the shelf must still scan.

create table barcode_aliases (
  barcode     text primary key,
  item_id     uuid not null references items(id) on delete cascade,
  source      text not null default 'vasy',
  created_at  timestamptz not null default now()
);

create index barcode_aliases_item_idx on barcode_aliases (item_id);

create or replace function resolve_barcode(p_code text)
returns uuid
language sql
stable
set search_path = public
as $$
  select id from items where barcode = p_code
  union all
  select item_id from barcode_aliases where barcode = p_code
  limit 1
$$;

comment on function resolve_barcode is
  'Single scan entry point. Checks live barcodes first, then legacy aliases.';
