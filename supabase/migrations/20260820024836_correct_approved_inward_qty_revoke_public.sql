-- anon has no business holding EXECUTE on a function that moves stock
-- and rewrites an approved document. authenticated keeps it; is_owner()
-- inside the function is what actually gates who may call it.
revoke execute on function public.correct_approved_inward_qty(uuid, integer, text) from public, anon;
