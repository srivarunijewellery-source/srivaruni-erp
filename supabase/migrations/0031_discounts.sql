-- =====================================================================
-- 0031_discounts.sql   (supabase version 20260729173755)
-- Recovered from the remote migration history.
-- =====================================================================

create type discount_scope as enum ('selection', 'invoice');
create type discount_value_kind as enum ('percent', 'amount');

-- Global controls. These are the part that has to exist BEFORE a cart
-- screen does, because a discount policy retrofitted onto a live till is
-- a policy nobody follows.
create table discount_settings (
  id                        boolean primary key default true,
  max_percent_staff_bps     integer not null default 500,
  max_percent_manager_bps   integer not null default 1000,
  max_percent_owner_bps     integer not null default 5000,
  max_campaign_days         integer not null default 60,
  allow_stacking            boolean not null default false,
  never_below_cost          boolean not null default true,
  min_margin_bps            integer not null default 2000,
  require_reason_above_bps  integer not null default 1500,
  require_approval_above_bps integer not null default 2500,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references staff(id),
  constraint discount_settings_singleton_ck check (id),
  constraint discount_settings_ladder_ck check (
    max_percent_staff_bps <= max_percent_manager_bps
    and max_percent_manager_bps <= max_percent_owner_bps
    and max_percent_owner_bps <= 10000
  ),
  constraint discount_settings_margin_ck check (min_margin_bps between 0 and 9000),
  constraint discount_settings_days_ck check (max_campaign_days between 1 and 400)
);

comment on column discount_settings.min_margin_bps is
  'The hard floor. No discount may take a line below this margin against its landed cost, whoever authorises it. This is the setting that stops a festival campaign quietly selling stock at a loss.';

insert into discount_settings (id) values (true);

create table discount_schemes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  scope              discount_scope not null,
  value_kind         discount_value_kind not null,
  value_bps          integer,
  value_paise        bigint,
  starts_on          date not null,
  ends_on            date not null,
  active             boolean not null default true,
  priority           integer not null default 100,
  stackable          boolean not null default false,
  min_bill_paise     bigint not null default 0,
  max_discount_paise bigint,
  location_ids       uuid[],
  note               text,
  created_at         timestamptz not null default now(),
  created_by         uuid references staff(id),
  constraint discount_schemes_window_ck check (ends_on >= starts_on),
  constraint discount_schemes_value_ck check (
       (value_kind = 'percent' and value_bps  is not null and value_bps between 1 and 10000
        and value_paise is null)
    or (value_kind = 'amount'  and value_paise is not null and value_paise > 0
        and value_bps is null)
  )
);

comment on column discount_schemes.location_ids is
  'Null means every store. An array restricts the scheme, so Boduppal can run an opening offer Zaheerabad does not.';
comment on column discount_schemes.stackable is
  'Whether this may combine with another matching scheme. Honoured only when discount_settings.allow_stacking is also on, so stacking can be killed globally without editing every campaign.';

create index discount_schemes_window_idx
  on discount_schemes (starts_on, ends_on) where active;

-- Targeting. Within one row every non-null column must match; across
-- rows it is an OR. A scheme with no target rows applies to everything.
create table discount_targets (
  id           uuid primary key default gen_random_uuid(),
  scheme_id    uuid not null references discount_schemes(id) on delete cascade,
  category_id  uuid references categories(id) on delete cascade,
  item_type_id uuid references item_types(id) on delete cascade,
  vendor_id    uuid references vendors(id)    on delete cascade,
  item_id      uuid references items(id)      on delete cascade,
  constraint discount_targets_something_ck check (
    num_nonnulls(category_id, item_type_id, vendor_id, item_id) >= 1
  )
);

create index discount_targets_scheme_idx on discount_targets (scheme_id);

-- Guardrails enforced where they cannot be bypassed by a client.
create or replace function discount_schemes_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare s discount_settings%rowtype;
begin
  select * into s from discount_settings ds where ds.id;

  if new.value_kind = 'percent' and new.value_bps > s.max_percent_owner_bps then
    raise exception 'Discount of %.2f%% exceeds the ceiling of %.2f%% set in discount settings.',
      new.value_bps / 100.0, s.max_percent_owner_bps / 100.0;
  end if;

  if (new.ends_on - new.starts_on) + 1 > s.max_campaign_days then
    raise exception 'Campaign runs % days; the limit is % days.',
      (new.ends_on - new.starts_on) + 1, s.max_campaign_days;
  end if;

  if new.scope = 'invoice' and exists (
    select 1 from discount_targets dt where dt.scheme_id = new.id
  ) then
    raise exception 'An invoice-level scheme applies to the whole bill and cannot carry product targets.';
  end if;

  return new;
end $$;

create trigger discount_schemes_guard_trg
  before insert or update on discount_schemes
  for each row execute function discount_schemes_guard();

-- Does this scheme cover this item?
create or replace function discount_covers_item(p_scheme uuid, p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from discount_targets t where t.scheme_id = p_scheme)
      or exists (
        select 1
        from discount_targets t
        join items i on i.id = p_item
        where t.scheme_id = p_scheme
          and (t.category_id  is null or t.category_id  = i.category_id)
          and (t.item_type_id is null or t.item_type_id = i.item_type_id)
          and (t.vendor_id    is null or t.vendor_id    = i.vendor_id)
          and (t.item_id      is null or t.item_id      = i.id)
      );
$$;

alter table discount_settings enable row level security;
alter table discount_schemes  enable row level security;
alter table discount_targets  enable row level security;

create policy discount_settings_owner on discount_settings
  for all using (is_owner()) with check (is_owner());
create policy discount_schemes_owner_write on discount_schemes
  for all using (is_owner()) with check (is_owner());
create policy discount_targets_owner_write on discount_targets
  for all using (is_owner()) with check (is_owner());

grant select, update on discount_settings to authenticated;
grant select, insert, update, delete on discount_schemes to authenticated;
grant select, insert, update, delete on discount_targets to authenticated;
revoke execute on function discount_covers_item(uuid, uuid) from public;
grant execute on function discount_covers_item(uuid, uuid) to authenticated;
