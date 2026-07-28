-- =====================================================================
-- 0004_costs.sql
-- Cost lives in its own tables, never as columns on items.
--
-- Reason: Supabase RLS is row-level, not column-level. You cannot hide
-- a cost column from a role. Separating the table means a staff session
-- gets zero rows, so cost never crosses the wire at all. Hiding it in
-- the UI is not protection; anyone can open dev tools.
--
-- Side benefit: full cost history, which you want anyway because Jaipur
-- rates move.
-- =====================================================================

create table item_costs (
  id                   uuid primary key default gen_random_uuid(),
  item_id              uuid not null references items(id) on delete cascade,
  effective_from       timestamptz not null default now(),

  -- Vendor rate per unit, on the cost basis appropriate to the vendor:
  -- registered   -> ex-GST (input credit is recoverable, not a cost)
  -- unregistered -> full invoice amount
  purchase_rate_paise  bigint not null check (purchase_rate_paise >= 0),

  -- purchase basis + prorated share of freight, packing, hamali, courier
  landed_cost_paise    bigint not null check (landed_cost_paise >= 0),

  -- Exact, for valuation. landed_cost_paise is the rounded display value.
  landed_cost_exact    numeric(18,6) not null default 0,

  source_inward_id     uuid,
  note                 text,
  created_at           timestamptz not null default now()
);

create index item_costs_item_idx on item_costs (item_id, effective_from desc);
create index item_costs_source_idx on item_costs (source_inward_id);

-- Most recent cost per item. Used to prefill rates on repeat purchases
-- so the owner only types rates for genuinely new items.
-- security_invoker is essential: without it the view runs as its owner
-- and would leak cost straight past the RLS policy on item_costs.
create or replace view item_latest_cost
with (security_invoker = true) as
select distinct on (item_id)
  item_id,
  purchase_rate_paise,
  landed_cost_paise,
  landed_cost_exact,
  effective_from,
  source_inward_id
from item_costs
order by item_id, effective_from desc, created_at desc;

comment on view item_latest_cost is
  'Prefill source for the approval screen. Owner-only via RLS on item_costs.';
