-- Pay is cost data. It sits in its own table for exactly the reason
-- landed cost does: RLS returns zero rows to anyone but the owner.
-- Append-only by effective date, so a raise in August does not
-- silently rewrite July's payroll.
create table if not exists staff_compensation (
  id                  uuid primary key default gen_random_uuid(),
  staff_id            uuid not null references staff(id) on delete cascade,
  effective_from      date not null,
  monthly_ctc_paise   bigint not null,
  incentive_bps       int not null default 0,
  note                text,
  created_by          uuid references staff(id),
  created_at          timestamptz not null default now(),

  constraint staff_comp_amount    check (monthly_ctc_paise >= 0),
  constraint staff_comp_incentive check (incentive_bps between 0 and 10000),
  unique (staff_id, effective_from)
);

create index if not exists staff_comp_staff_idx
  on staff_compensation (staff_id, effective_from desc);

alter table staff_compensation enable row level security;

drop policy if exists staff_comp_owner on staff_compensation;
create policy staff_comp_owner on staff_compensation
  for all using (is_owner()) with check (is_owner());

comment on table staff_compensation is
  'Owner-only. Append a row to change pay; never update in place.';
