-- =====================================================================
-- 0037_parse_design_code_strict.sql
-- Applied remotely as 'parse_design_code_strict'.
--
-- parse_design_code used to fall back to treating the ENTIRE trailing
-- digit run as the design code when no valid date suffix could be read.
--
-- That is unsafe. "Antiowu CVhoker 12307292026" splits as 123 + 07292026,
-- which is day 07 month 29 and therefore not a date — the title was typed
-- MMDDYYYY. The old fallback returned 12307292026 as the code, and at a
-- multiple of 9 that suggests a purchase rate near 1.1 billion rupees
-- instead of 1,107.
--
-- Only DDMMYYYY is a valid convention here, plus the 7-digit form where
-- the day or month has dropped its leading zero. Anything else is out of
-- bounds: return nothing, leave the line to manual entry, let the screen
-- say why. A refused parse costs one typed rate. An accepted wrong parse
-- costs a mispriced carton.
-- =====================================================================

create or replace function parse_design_code(p_title text, p_has_date boolean default true)
returns table (
  code text, code_numeric bigint, date_digits text, parsed_date date,
  ambiguous boolean, alt_code text, alt_date date
) language plpgsql stable as $$
declare
  v_digits text;
  n int;
  d8 date; d7 date;
  c8 text; c7 text;
  -- A design code is a handful of digits. Anything longer is a failed
  -- date parse wearing a code's clothes.
  max_code_len constant int := 6;
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

  if n > 8 then
    d8 := sv_try_date(right(v_digits, 8));
    c8 := left(v_digits, n - 8);
  end if;
  if n > 7 then
    d7 := sv_try_date(right(v_digits, 7));
    c7 := left(v_digits, n - 7);
  end if;

  if d8 is not null and length(c8) <= max_code_len then
    return query select c8, c8::bigint, right(v_digits,8), d8,
                        (d7 is not null and c7 is distinct from c8
                         and length(c7) <= max_code_len),
                        case when d7 is not null and length(c7) <= max_code_len
                             then c7 end,
                        d7;
  elsif d7 is not null and length(c7) <= max_code_len then
    return query select c7, c7::bigint, right(v_digits,7), d7,
                        false, null::text, null::date;
  end if;
  -- No valid DDMMYYYY suffix. Deliberately returns no rows.
  return;
end $$;

comment on function parse_design_code is
  'Splits a trailing digit run into design code + DDMMYYYY date stamp, also accepting the 7-digit form where the day or month lost a leading zero. Returns NO ROWS when no valid date can be read or the remaining code is implausibly long. Reports ambiguity when both the 8- and 7-digit splits are legal, since those differ by a factor of ten.';
