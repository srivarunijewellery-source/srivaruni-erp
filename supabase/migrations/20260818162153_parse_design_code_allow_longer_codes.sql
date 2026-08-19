-- Raise the design-code ceiling from 6 to 12 characters.
--
-- The cap was a guard against a failed date parse being handed back as a
-- twelve digit "design code", not a statement about how long a code is.
-- Selva issue 7 digit codes, so every Selva title stripped its date
-- correctly, found 2500574 behind it, decided seven was one too many and
-- returned nothing. 145 titles in the catalogue parsed to nothing for
-- that reason alone; 142 now parse and the remaining 3 are typos with
-- impossible dates (day 00, month 42, month 60).
--
-- Raising it cannot disturb what already works. The cap only ever
-- arbitrates between two readings of the same digit tail, and DDMMYY and
-- DDMMYYYY cannot both be valid on one title: the last six of a DDMMYYYY
-- are MMYYYY, and no month is a valid 20th month. Verified against all
-- 1,600 titles ending in 7+ digits -- zero have both readings valid, so
-- zero can shift.

CREATE OR REPLACE FUNCTION public.parse_design_code(p_title text, p_has_date boolean DEFAULT true)
 RETURNS TABLE(code text, code_numeric bigint, date_digits text, parsed_date date, ambiguous boolean, alt_code text, alt_date date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_digits text;
  n int;
  d8 date; d7 date; d6 date;
  c8 text; c7 text; c6 text;
  ok8 boolean; ok7 boolean; ok6 boolean;
  -- A ceiling on the code, not a definition of one. 12 rather than 7 so
  -- the next vendor with a longer code is a data entry question and not
  -- another migration.
  max_code_len constant int := 12;
begin
  v_digits := (regexp_match(coalesce(p_title,''), '(\d+)\s*$'))[1];
  if v_digits is null then return; end if;

  if not p_has_date then
    if length(v_digits) > max_code_len then return; end if;
    return query select v_digits, v_digits::bigint, null::text, null::date,
                        false, null::text, null::date;
    return;
  end if;

  n := length(v_digits);

  -- Each length needs at least one digit of code in front of it, which
  -- is why these are strict inequalities: a title that is ONLY a date
  -- carries no design code and is not a match.
  if n > 8 then d8 := sv_try_date(right(v_digits, 8)); c8 := left(v_digits, n - 8); end if;
  if n > 7 then d7 := sv_try_date(right(v_digits, 7)); c7 := left(v_digits, n - 7); end if;
  if n > 6 then d6 := sv_try_date(right(v_digits, 6)); c6 := left(v_digits, n - 6); end if;

  ok8 := d8 is not null and length(coalesce(c8,'')) between 1 and max_code_len;
  ok7 := d7 is not null and length(coalesce(c7,'')) between 1 and max_code_len;
  ok6 := d6 is not null and length(coalesce(c6,'')) between 1 and max_code_len;

  -- Longest date wins. A four-digit year is a stronger signal than two,
  -- so DDMMYYYY is preferred wherever both read as a valid date, and the
  -- runner-up is reported as the alternative rather than discarded --
  -- the pricing screen shows it so a person can settle it.
  if ok8 then
    return query select c8, c8::bigint, right(v_digits,8), d8,
                        (ok7 and c7 is distinct from c8)
                        or (ok6 and c6 is distinct from c8),
                        case when ok7 and c7 is distinct from c8 then c7
                             when ok6 and c6 is distinct from c8 then c6 end,
                        case when ok7 and c7 is distinct from c8 then d7
                             when ok6 and c6 is distinct from c8 then d6 end;
  elsif ok7 then
    return query select c7, c7::bigint, right(v_digits,7), d7,
                        (ok6 and c6 is distinct from c7),
                        case when ok6 and c6 is distinct from c7 then c6 end,
                        case when ok6 and c6 is distinct from c7 then d6 end;
  elsif ok6 then
    return query select c6, c6::bigint, right(v_digits,6), d6,
                        false, null::text, null::date;
  end if;

  -- No usable date suffix in any accepted form. Deliberately no rows.
  return;
end $function$;
