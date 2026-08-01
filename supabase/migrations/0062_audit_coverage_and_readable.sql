-- =====================================================================
-- 0062_audit_coverage_and_readable.sql
--
-- audit_trigger already existed but was attached to only three tables
-- (inwards, items, vendors). The gaps were the ones most likely to be
-- disputed later: who approved a transfer, who changed a quantity after
-- pricing was entered, who wrote off stock, who handed out a coupon.
--
-- Deliberately NOT audited: stock_ledger and item_photos. The ledger is
-- already immutable and append-only, so an audit row would duplicate it
-- at double the write cost; photos are high-volume and carry no money.
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'transfers', 'transfer_lines',
    'inward_lines', 'inward_additional_costs',
    'stock_adjustments',
    'customers',
    'coupons', 'coupon_batches',
    'label_settings'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I
           for each row execute function audit_trigger()',
        'audit_' || t, t);
    end if;
  end loop;
end $$;

-- Resolves the actor, and reduces an UPDATE to the fields that actually
-- moved. An UPDATE row stores the whole record twice; showing all of it
-- buries the one value that changed under thirty that did not.
create or replace view public.audit_log_readable as
select
  a.id, a.table_name, a.row_id, a.action, a.changed_at,
  s.name as changed_by_name,
  s.role as changed_by_role,
  case
    when a.action = 'UPDATE' then (
      select jsonb_object_agg(k, jsonb_build_object('from', a.old_data -> k, 'to', a.new_data -> k))
      from jsonb_object_keys(a.new_data) k
      where a.old_data -> k is distinct from a.new_data -> k
        and k not in ('updated_at', 'created_at')
    )
  end as changes,
  a.old_data, a.new_data
from audit_log a
left join staff s on s.id = a.changed_by;

comment on view public.audit_log_readable is
  'audit_log with the actor resolved and UPDATE rows reduced to the fields '
  'that actually changed. Inherits audit_log RLS: owner only.';
