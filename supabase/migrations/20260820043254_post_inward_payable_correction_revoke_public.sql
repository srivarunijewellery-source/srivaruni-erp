-- anon has no business holding EXECUTE on a function that posts to the
-- books. authenticated keeps it; is_owner() inside the function is what
-- actually gates who may call it.
revoke execute on function public.post_inward_payable_correction(uuid, text) from public, anon;
