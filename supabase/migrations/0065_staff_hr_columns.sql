alter table staff
  add column if not exists employee_code text,
  add column if not exists email         text,
  add column if not exists dob           date,
  add column if not exists joined_on     date,
  add column if not exists exited_on     date,
  add column if not exists exit_reason   text,
  add column if not exists address       text,
  add column if not exists emergency_name  text,
  add column if not exists emergency_phone text,
  add column if not exists notes         text;

create unique index if not exists staff_employee_code_uidx
  on staff (employee_code) where employee_code is not null;

comment on column staff.exited_on is
  'Set instead of deleting. Attendance, sales and pay history stay '
  'attached to the person; active=false hides them from pickers.';
