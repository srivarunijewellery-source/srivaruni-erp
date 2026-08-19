-- v1 grant sweep; v2 repeats it after the recreate.
revoke execute on function public.apply_selva_price_sheet(uuid, jsonb, boolean) from public, anon;
