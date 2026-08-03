-- Achievement is never stored -- it is read from bills at query time,
-- so a cancelled bill corrects the number rather than leaving a stale
-- total behind.
create table if not exists staff_targets (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid not null references staff(id) on delete cascade,
  period_month   date not null,
  target_paise   bigint not null,
  incentive_bps  int not null default 0,
  note           text,
  created_by     uuid references staff(id),
  created_at     timestamptz not null default now(),

  constraint target_amount    check (target_paise >= 0),
  constraint target_incentive check (incentive_bps between 0 and 10000),
  constraint target_is_month  check (date_trunc('month', period_month)::date = period_month),
  unique (staff_id, period_month)
);

create index if not exists staff_targets_period_idx on staff_targets (period_month desc);

alter table staff_targets enable row level security;

drop policy if exists staff_targets_read on staff_targets;
create policy staff_targets_read on staff_targets
  for select using (is_manager_or_above() or staff_id = current_staff_id());

drop policy if exists staff_targets_write on staff_targets;
create policy staff_targets_write on staff_targets
  for all using (is_owner()) with check (is_owner());
