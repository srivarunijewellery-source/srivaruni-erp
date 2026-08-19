create or replace function public.norm_variant(p_text text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  -- Puts a size from either side of the match onto one footing.
  --
  -- Both vocabularies are uncontrolled. The item side has 24 inch, 24,
  -- 30 Inch, 2.4, 2.10, Free Size. The vendor side prints 24" on a
  -- chain and, on a bangle sheet, whatever their portal prints. Matching
  -- raw strings would fail on the space in '24 inch' alone.
  --
  -- Deliberately NOT numeric: 2.10 is a bangle size that reads as the
  -- tenth size above two, not as 2.1, and casting it to a number would
  -- collide it with 2.1 and quietly price the wrong bangle. Trailing
  -- zeros are stripped only where the value is a plain integer with a
  -- decimal tail -- 10.0 becomes 10 -- which is safe because bangle
  -- sizes are never written that way.
  --
  -- Anything with no digits at all (Free Size, Large, Reg) returns null:
  -- it carries no information the vendor sheet could be matched against.
  select case
    when p_text is null then null
    when btrim(p_text) = '' then null
    when regexp_replace(lower(btrim(p_text)),
           '\s*(inches|inch|in|")\s*$', '') !~ '[0-9]' then null
    else regexp_replace(
           regexp_replace(lower(btrim(p_text)), '\s*(inches|inch|in|")\s*$', ''),
           '^([0-9]+)\.0+$', '\1')
  end;
$function$;
