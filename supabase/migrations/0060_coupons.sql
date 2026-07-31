-- =====================================================================
-- 0060_coupons.sql
--
-- Terms live on the batch, codes live on the coupon. 200 Diwali coupons
-- share one set of terms; storing "20% off, min 5000, valid till 15 Nov"
-- on all 200 rows means 200 places for them to drift apart. The batch is
-- the offer; a coupon is one numbered instance of it.
--
-- Redemption is deliberately only a status here. Actually consuming a
-- coupon against a bill belongs with billing, which does not exist yet --
-- so nothing in this migration pretends to price anything.
-- =====================================================================

create table if not exists coupon_batches (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  prefix              text not null,
  discount_kind       text not null check (discount_kind in ('percent', 'amount')),
  discount_bps        int,
  discount_paise      bigint,
  min_purchase_paise  bigint not null default 0,
  valid_from          date not null,
  valid_to            date not null,
  start_number        int not null,
  count_issued        int not null,
  notes               text,
  created_by          uuid references staff(id),
  created_at          timestamptz not null default now(),
  constraint coupon_batch_dates check (valid_to >= valid_from),
  constraint coupon_batch_min   check (min_purchase_paise >= 0),
  constraint coupon_batch_count check (count_issued between 1 and 2000),
  constraint coupon_batch_start check (start_number >= 0),
  -- Exactly one value, matching the kind: prevents a percent coupon that
  -- silently carries a rupee amount nobody reads.
  constraint coupon_batch_value check (
    (discount_kind = 'percent' and discount_bps between 1 and 10000 and discount_paise is null)
    or
    (discount_kind = 'amount'  and discount_paise > 0 and discount_bps is null)
  )
);

create table if not exists coupons (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references coupon_batches(id) on delete cascade,
  code          text not null unique,
  serial        int not null,
  status        text not null default 'available'
                check (status in ('available', 'assigned', 'redeemed', 'void')),
  customer_id   uuid references customers(id),
  assigned_at   timestamptz,
  assigned_by   uuid references staff(id),
  redeemed_at   timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now(),
  unique (batch_id, serial),
  -- Status and its evidence cannot disagree.
  constraint coupon_assigned_has_customer check (
    (status in ('assigned', 'redeemed')) = (customer_id is not null)
  )
);

create index if not exists coupons_batch_idx    on coupons (batch_id);
create index if not exists coupons_customer_idx on coupons (customer_id) where customer_id is not null;
create index if not exists coupons_status_idx   on coupons (status);

alter table coupon_batches enable row level security;
alter table coupons        enable row level security;

drop policy if exists coupon_batches_read on coupon_batches;
create policy coupon_batches_read on coupon_batches
  for select using (current_staff_id() is not null);
drop policy if exists coupons_read on coupons;
create policy coupons_read on coupons
  for select using (current_staff_id() is not null);

create or replace view public.coupon_batch_summary as
select
  b.id, b.name, b.prefix, b.discount_kind, b.discount_bps, b.discount_paise,
  b.min_purchase_paise, b.valid_from, b.valid_to, b.start_number,
  b.count_issued, b.notes, b.created_at,
  count(c.id)                                              as total,
  count(*) filter (where c.status = 'available')::int      as available,
  count(*) filter (where c.status = 'assigned')::int       as assigned,
  count(*) filter (where c.status = 'redeemed')::int       as redeemed,
  count(*) filter (where c.status = 'void')::int           as voided,
  -- Expiry is derived, never stored: a status column would need a nightly
  -- job to stay honest, and would be wrong in between.
  (b.valid_to < current_date)                              as expired,
  (current_date between b.valid_from and b.valid_to)       as live
from coupon_batches b
left join coupons c on c.batch_id = b.id
group by b.id;
