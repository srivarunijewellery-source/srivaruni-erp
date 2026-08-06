-- The drawer and the day's takings are two different numbers, and until
-- now only one of them existed. Change gets brought from the safe, notes
-- get lifted out to bank, and someone buys packing tape out of the till.
-- None of that is revenue, all of it changes what should be sitting in
-- the drawer at close, and none of it could be recorded -- so every
-- close produced a variance that was really just missing bookkeeping.
--
-- Append-only, like the stock ledger and the money history. A mistake is
-- corrected with an opposite entry, never an edit.

alter table register_sessions
  add column if not exists open_denominations  jsonb,
  add column if not exists close_denominations jsonb;

create table if not exists register_cash_movements (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references register_sessions(id),
  location_id  uuid not null references locations(id),
  -- pay_in  : money put into the drawer (change float, top-up from the safe)
  -- pay_out : money taken out of the drawer (banked, moved to the safe)
  -- expense : petty cash spent out of the drawer, which hits the books
  kind         text not null check (kind in ('pay_in','pay_out','expense')),
  amount_paise bigint not null check (amount_paise > 0),
  reason       text,
  account_id   uuid references ledger_accounts(id),
  journal_id   uuid references journals(id),
  created_by   uuid references staff(id),
  created_at   timestamptz not null default now()
);

create index if not exists register_cash_movements_session_idx
  on register_cash_movements (session_id, created_at);

alter table register_cash_movements enable row level security;

create policy register_cash_movements_read on register_cash_movements
  for select using (current_staff_id() is not null);
