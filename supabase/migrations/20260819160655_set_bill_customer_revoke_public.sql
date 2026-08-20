-- anon has no business holding EXECUTE on a function that edits a
-- finalised bill. authenticated keeps it; the permission check inside
-- the function is what actually gates who may call it.
revoke execute on function public.set_bill_customer(uuid, uuid) from public, anon;
