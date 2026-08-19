create or replace function public.find_size_option(p_variant text)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  -- The size list and a vendor's PDF do not speak the same dialect. The
  -- list holds '24 inch', '20 inch', '30 Inch', '30'; a Selva quotation
  -- prints 24". Matching those as raw strings finds nothing, which is
  -- how the size chooser came to write nothing back and ask the same
  -- question again on every future shipment.
  --
  -- norm_variant is the one place that rule lives, so it is applied to
  -- both sides here rather than re-implemented in TypeScript.
  --
  -- Deliberately null on a tie. '30' and '30 Inch' are two options that
  -- normalise to the same thing; picking one at random would put half
  -- the chains on each and make the size filter lie. A tie is a settings
  -- problem, and the caller is told rather than guessed at.
  select case when count(*) = 1 then (array_agg(o.id))[1] end
  from attribute_options o
  where o.attr_key = 'size'
    and norm_variant(p_variant) is not null
    and norm_variant(o.value) is not distinct from norm_variant(p_variant);
$function$;
