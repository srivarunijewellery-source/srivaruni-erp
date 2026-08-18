-- Same grant shape as reject_assembly and its siblings: the owner calls
-- it as `authenticated`, and is_owner() inside the function is what
-- actually gates it. anon has no business holding EXECUTE on it.
revoke execute on function public.split_assembly_products(uuid, uuid[], text) from public, anon;
