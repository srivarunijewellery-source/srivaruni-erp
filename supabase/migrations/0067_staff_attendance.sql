-- One row per person per day. The unique key is the whole design:
-- marking twice corrects the day rather than creating a second truth.
create table if not exists staff_attendance (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  on_date       date not null,
  status        text not null,
  location_id   uuid references locations(id),
  check_in      time,
  check_out     time,
  note          text,
  marked_by     uuid references staff(id),
  marked_at     timestamptz not null default now(),

  constraint attendance_status check (status in
    ('present','half_day','absent','leave','week_off','holiday')),
  constraint attendance_times check (check_out is null or check_in is not null),
  unique (staff_id, on_date)
);

create index if not exists attendance_date_idx     on staff_attendance (on_date desc);
create index if not exists attendance_staff_idx    on staff_attendance (staff_id, on_date desc);
create index if not exists attendance_location_idx on staff_attendance (location_id, on_date desc);

alter table staff_attendance enable row level security;

drop policy if exists attendance_read on staff_attendance;
create policy attendance_read on staff_attendance
  for select using (
    is_manager_or_above()
    or staff_id = current_staff_id()
  );

comment on table staff_attendance is
  'Daily register. Writes go through mark_attendance so the marker and '
  'the time are always recorded; direct writes are not granted.';
