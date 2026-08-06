-- Anything created after the blanket REVOKE in 0xxx_revoke_public_execute
-- comes back with PUBLIC and anon execute, because a fresh function gets
-- the default ACL rather than inheriting the schema-wide revoke. Every
-- function added since then needs this block or it is reachable by an
-- unauthenticated key.

do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'close_register(uuid, bigint, text, jsonb)',
    'open_register(uuid, bigint, text, jsonb)',
    'register_drawer(uuid)',
    'register_cash_movement(uuid, text, bigint, text, uuid)',
    'session_bills(uuid)',
    'session_cash_movements(uuid)',
    'customer_items(uuid, integer)',
    'customer_summary(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end $$;
