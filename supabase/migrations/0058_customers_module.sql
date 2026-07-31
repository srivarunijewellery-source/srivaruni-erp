-- =====================================================================
-- 0058_customers_module.sql
--
-- NOTE ON PROVENANCE: migrations 20260731153938..20260731154121
-- (customers_email_and_pan, normalize_phone_fn,
-- normalize_phone_leading_zeros, upsert_customer_fn,
-- upsert_customer_comment_and_search) were applied to the database by a
-- parallel session and had no matching repo files. This file records the
-- CORRECTED state of search_customers as it now exists, and the grant
-- lockdown that was missing. Run `supabase db pull` if the other objects
-- (customers.email, customers.pan, normalize_phone, upsert_customer)
-- also need repo files -- they are live but undocumented here.
--
-- Two real bugs fixed in search_customers:
--
--   1. A name search stripped to an empty digit string, so the phone
--      branch became "phone like '%'" and matched EVERY customer. A
--      search box returning the whole book looks like it worked.
--
--   2. Search did not normalise its input the way upsert_customer does
--      when storing, so pasting "+91 98765 43211" found nothing even
--      though that customer exists as the 10-digit form.
-- =====================================================================

create or replace function public.search_customers(p_query text, p_limit int default 30)
returns setof customers
language sql stable security invoker set search_path = public
as $function$
  with q as (
    select
      nullif(trim(coalesce(p_query, '')), '')                              as term,
      nullif(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g'), '') as digits,
      normalize_phone(p_query)                                             as normalised
  )
  select c.* from customers c, q
  where q.term is null
     or (c.name is not null and c.name ilike '%' || q.term || '%')
     or (q.digits is not null and c.phone like q.digits || '%')
     or (q.digits is not null and c.phone like '%' || q.digits)
     or (q.normalised is not null and c.phone = q.normalised)
     or (q.term is not null and c.email is not null and c.email ilike q.term || '%')
  order by coalesce(c.name, ''), c.phone
  limit greatest(coalesce(p_limit, 30), 1);
$function$;

revoke execute on function public.search_customers(text, int) from public, anon;
grant  execute on function public.search_customers(text, int) to authenticated;

-- Pure string helper with no table access, but anon has no business
-- holding execute on anything in this schema.
revoke execute on function public.normalize_phone(text) from public, anon;
grant  execute on function public.normalize_phone(text) to authenticated;
