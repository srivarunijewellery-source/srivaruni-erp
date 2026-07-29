-- =====================================================================
-- 0028_pricing_foundations.sql   (supabase version 20260729173443)
-- Recovered from the remote migration history.
-- =====================================================================

create type vendor_pricing_mode as enum ('code_multiple', 'serial_list', 'manual');

alter table vendors
  add column pricing_mode        vendor_pricing_mode not null default 'manual',
  add column code_multiple       numeric(10,3),
  add column code_has_date_suffix boolean not null default true,
  add column pricing_note        text;

comment on column vendors.code_multiple is
  'Multiply the design code by this to get the vendor rate in rupees. Numeric rather than integer because a vendor quoting x8.5 is not a schema migration.';
comment on column vendors.code_has_date_suffix is
  'True when the title is code + DDMMYYYY (or DMMYYYY for a single-digit day). False when the raw code stands alone.';

alter table vendors add constraint vendors_code_multiple_ck check (
  pricing_mode <> 'code_multiple'
  or (code_multiple is not null and code_multiple > 0)
);

create table price_bands (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,
  lo_bps      integer not null,
  hi_bps      integer not null,
  sort_order  integer not null,
  active      boolean not null default true,
  constraint price_bands_range_ck check (lo_bps >= 0 and hi_bps > lo_bps and hi_bps < 10000)
);

comment on table price_bands is 'Margin bands as basis points on the tag price. 50-55% is (5000, 5500).';

insert into price_bands (label, lo_bps, hi_bps, sort_order) values
  ('25 – 30%', 2500, 3000, 10),
  ('30 – 35%', 3000, 3500, 20),
  ('35 – 40%', 3500, 4000, 30),
  ('40 – 45%', 4000, 4500, 40),
  ('45 – 50%', 4500, 5000, 50),
  ('50 – 55%', 5000, 5500, 60),
  ('55 – 60%', 5500, 6000, 70),
  ('60 – 65%', 6000, 6500, 80),
  ('65 – 70%', 6500, 7000, 90);

create table pricing_settings (
  id                   boolean primary key default true,
  target_nudge_bps     integer not null default 0,
  round_mode           text    not null default 'nearest',
  grid_switch_paise    bigint  not null default 100000,
  high_ending_paise    integer not null default 6000,
  low_endings_paise    integer[] not null default '{2500,4500,7500,9500}',
  margin_includes_gst  boolean not null default true,
  default_band_id      uuid references price_bands(id),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references staff(id),
  constraint pricing_settings_singleton_ck check (id),
  constraint pricing_settings_nudge_ck check (target_nudge_bps between -200 and 200),
  constraint pricing_settings_round_ck check (round_mode in ('nearest', 'up'))
);

comment on column pricing_settings.target_nudge_bps is
  'Shifts the recommendation off the band midpoint. Zero means aim dead centre: a 50-55% band targets 52.5%. Capped at two points either way because a larger nudge means the wrong band was chosen.';
comment on column pricing_settings.grid_switch_paise is
  'Above this, prices end in 60. Below it, in 25 / 45 / 75 / 95. Default 100000 paise = 1000 rupees.';
comment on column pricing_settings.margin_includes_gst is
  'True: margin is measured against the tag price the customer pays, GST included.';

insert into pricing_settings (id, default_band_id)
  select true, id from price_bands where label = '50 – 55%';

create table pricing_rules (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  vendor_id     uuid references vendors(id)    on delete cascade,
  category_id   uuid references categories(id) on delete cascade,
  item_type_id  uuid references item_types(id) on delete cascade,
  band_id       uuid not null references price_bands(id),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references staff(id),
  specificity   integer generated always as (
      (case when vendor_id    is not null then 4 else 0 end)
    + (case when item_type_id is not null then 2 else 0 end)
    + (case when category_id  is not null then 1 else 0 end)
  ) stored
);

create unique index pricing_rules_scope_uk on pricing_rules (
  coalesce(vendor_id,    '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(category_id,  '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(item_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where active;

create index pricing_rules_lookup_idx on pricing_rules (specificity desc) where active;

create table item_price_history (
  id                  bigint generated always as identity primary key,
  item_id             uuid not null references items(id) on delete cascade,
  mrp_paise           bigint,
  selling_price_paise bigint,
  landed_cost_paise   bigint,
  band_id             uuid references price_bands(id),
  margin_bps          integer,
  source              text not null,
  note                text,
  changed_by          uuid references staff(id),
  changed_at          timestamptz not null default now(),
  constraint item_price_history_source_ck check (
    source in ('inward_pricing','manual','rule_apply','bulk_reprice','import','legacy')
  )
);

create index item_price_history_item_idx on item_price_history (item_id, changed_at desc);

create or replace function item_price_history_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'item_price_history is append only.';
end
$$;

create trigger item_price_history_immutable_trg
  before update or delete on item_price_history
  for each row execute function item_price_history_immutable();

create or replace function items_log_price_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_landed bigint;
  v_margin integer;
begin
  if tg_op = 'UPDATE'
     and new.mrp_paise is not distinct from old.mrp_paise
     and new.selling_price_paise is not distinct from old.selling_price_paise then
    return new;
  end if;

  if new.mrp_paise is null and new.selling_price_paise is null then
    return new;
  end if;

  select landed_cost_paise into v_landed from item_latest_cost where item_id = new.id;

  if v_landed is not null and new.mrp_paise is not null and new.mrp_paise > 0 then
    v_margin := round((new.mrp_paise - v_landed)::numeric * 10000 / new.mrp_paise);
  end if;

  insert into item_price_history (
    item_id, mrp_paise, selling_price_paise, landed_cost_paise,
    margin_bps, source, changed_by
  ) values (
    new.id, new.mrp_paise, new.selling_price_paise, v_landed, v_margin,
    coalesce(current_setting('sv.price_source', true), 'manual'),
    current_staff_id()
  );

  return new;
end
$$;

create trigger items_log_price_change_trg
  after insert or update of mrp_paise, selling_price_paise on items
  for each row execute function items_log_price_change();

alter table price_bands         enable row level security;
alter table pricing_settings    enable row level security;
alter table pricing_rules       enable row level security;
alter table item_price_history  enable row level security;

create policy price_bands_read on price_bands
  for select using (current_staff_id() is not null);
create policy price_bands_write on price_bands
  for all using (is_owner()) with check (is_owner());
create policy pricing_settings_owner on pricing_settings
  for all using (is_owner()) with check (is_owner());
create policy pricing_rules_owner on pricing_rules
  for all using (is_owner()) with check (is_owner());
create policy item_price_history_owner on item_price_history
  for select using (is_owner());

grant select on price_bands to authenticated;
grant select, insert, update, delete on pricing_rules to authenticated;
grant select, update on pricing_settings to authenticated;
grant select on item_price_history to authenticated;
