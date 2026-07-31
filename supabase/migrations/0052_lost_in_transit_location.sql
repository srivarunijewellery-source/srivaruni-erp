insert into locations (code, name, kind, active)
values ('LST', 'Lost in Transit', 'lost', true)
on conflict (code) do nothing;
