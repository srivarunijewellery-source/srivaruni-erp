-- Sales returns and customer credit.
--
-- A return is NOT a negative sale. Money does not come back out of the
-- drawer: the customer gets a credit note they spend next time, which is
-- a liability we carry until they do. The original bill is never
-- rewritten -- the bill is what happened, and editing history so a
-- return looks tidy is how an audit trail rots.

insert into ledger_accounts (code, name, kind, system_key, active)
values ('2400', 'Customer credit notes', 'liability', 'customer_credit', true)
on conflict (code) do nothing;

create table if not exists sales_returns (
  id             uuid primary key default gen_random_uuid(),
  return_no      text not null unique,
  bill_id        uuid not null references bills(id),
  customer_id    uuid references customers(id),
  location_id    uuid not null references locations(id),
  session_id     uuid references register_sessions(id),
  return_date    date not null default current_date,
  gross_paise    bigint not null default 0,
  taxable_paise  bigint not null default 0,
  cgst_paise     bigint not null default 0,
  sgst_paise     bigint not null default 0,
  igst_paise     bigint not null default 0,
  total_paise    bigint not null default 0,
  reason         text,
  note           text,
  journal_id     uuid references journals(id),
  created_by     uuid references staff(id),
  created_at     timestamptz not null default now()
);

create table if not exists sales_return_lines (
  id               uuid primary key default gen_random_uuid(),
  return_id        uuid not null references sales_returns(id) on delete cascade,
  bill_line_id     uuid references bill_lines(id),
  item_id          uuid not null references items(id),
  qty              integer not null check (qty > 0),
  unit_price_paise bigint not null,
  line_total_paise bigint not null,
  gst_rate         numeric not null default 3,
  -- Damaged pieces come back to us but not to the shelf.
  restock          boolean not null default true,
  reason           text
);

create table if not exists customer_credit_notes (
  id               uuid primary key default gen_random_uuid(),
  note_no          text not null unique,
  customer_id      uuid not null references customers(id),
  source_return_id uuid references sales_returns(id),
  amount_paise     bigint not null check (amount_paise > 0),
  valid_until      date,
  note             text,
  created_by       uuid references staff(id),
  created_at       timestamptz not null default now(),
  void_at          timestamptz,
  void_by          uuid references staff(id),
  void_reason      text
);

-- Append-only. A credit is spent in pieces across bills and the balance
-- is the note less what has been allocated, never a mutable column.
create table if not exists customer_credit_allocations (
  id             uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references customer_credit_notes(id),
  bill_id        uuid references bills(id),
  amount_paise   bigint not null check (amount_paise <> 0),
  note           text,
  created_by     uuid references staff(id),
  created_at     timestamptz not null default now()
);

create index if not exists sales_returns_bill_idx      on sales_returns (bill_id);
create index if not exists sales_returns_customer_idx  on sales_returns (customer_id, return_date desc);
create index if not exists sales_return_lines_ret_idx  on sales_return_lines (return_id);
create index if not exists ccn_customer_idx            on customer_credit_notes (customer_id);
create index if not exists cca_note_idx                on customer_credit_allocations (credit_note_id);

alter table sales_returns               enable row level security;
alter table sales_return_lines          enable row level security;
alter table customer_credit_notes       enable row level security;
alter table customer_credit_allocations enable row level security;

create policy sales_returns_read on sales_returns
  for select using (current_staff_id() is not null);
create policy sales_return_lines_read on sales_return_lines
  for select using (current_staff_id() is not null);
create policy customer_credit_notes_read on customer_credit_notes
  for select using (current_staff_id() is not null);
create policy customer_credit_allocations_read on customer_credit_allocations
  for select using (current_staff_id() is not null);
