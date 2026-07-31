-- =====================================================================
-- 0059_label_settings.sql
--
-- Label geometry belongs to the stock on the roll, not to whoever is
-- printing. It lived in component state, so it reset on every refresh
-- and each person had to re-measure. Same singleton shape as
-- pricing_settings / discount_settings: a boolean primary key means the
-- table physically cannot hold a second row.
-- =====================================================================

create table if not exists label_settings (
  id                boolean primary key default true,
  print_area_mm     numeric(5,2) not null default 72,
  fold_at_mm        numeric(5,2) not null default 36,
  gap_mm            numeric(5,2) not null default 2,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references staff(id),
  constraint label_settings_singleton  check (id),
  constraint label_settings_print_area check (print_area_mm between 30 and 100),
  constraint label_settings_gap        check (gap_mm between 0 and 5),
  constraint label_settings_fold       check (fold_at_mm >= 10 and fold_at_mm <= print_area_mm - 10)
);

insert into label_settings (id) values (true) on conflict (id) do nothing;

alter table label_settings enable row level security;
drop policy if exists label_settings_read on label_settings;
create policy label_settings_read on label_settings
  for select using (current_staff_id() is not null);

create or replace function public.save_label_settings(
  p_print_area numeric, p_fold_at numeric, p_gap numeric)
returns void
language plpgsql security definer set search_path = public
as $function$
begin
  if not is_manager_or_above() then
    raise exception 'Only a manager or owner can change label settings';
  end if;
  if p_fold_at > p_print_area - 10 then
    raise exception 'The fold must leave at least 10mm of panel on each side';
  end if;

  update label_settings
  set print_area_mm = p_print_area, fold_at_mm = p_fold_at, gap_mm = p_gap,
      updated_at = now(), updated_by = current_staff_id()
  where id;
end
$function$;

revoke execute on function public.save_label_settings(numeric, numeric, numeric) from public, anon;
grant  execute on function public.save_label_settings(numeric, numeric, numeric) to authenticated;
