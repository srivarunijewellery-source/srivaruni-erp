create table if not exists staff_leave (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  from_date     date not null,
  to_date       date not null,
  kind          text not null default 'casual',
  reason        text,
  status        text not null default 'pending',
  requested_by  uuid references staff(id),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references staff(id),
  decided_at    timestamptz,
  decision_note text,

  constraint leave_kind   check (kind in ('casual','sick','unpaid','comp_off')),
  constraint leave_status check (status in ('pending','approved','rejected','cancelled')),
  constraint leave_dates  check (to_date >= from_date)
);

create index if not exists leave_staff_idx   on staff_leave (staff_id, from_date desc);
create index if not exists leave_pending_idx on staff_leave (from_date) where status = 'pending';

alter table staff_leave enable row level security;

drop policy if exists leave_read on staff_leave;
create policy leave_read on staff_leave
  for select using (
    is_manager_or_above()
    or staff_id = current_staff_id()
  );
