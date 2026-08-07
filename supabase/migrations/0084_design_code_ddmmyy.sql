-- Vendors write the date two ways: DDMMYYYY and the shorter DDMMYY.
--
-- Only the long forms were tried, so a real title in the catalogue --
-- "CZ Bangles 1595050826" -- parsed as nothing at all: right(8) reads
-- "05050826", whose year 0826 fails the sanity window, and the 7-digit
-- fallback fails the same way. The intended reading is code 1595 with
-- 05/08/26.
--
-- Two digits of year resolve as 20YY and then go through the SAME
-- 2015..next-year window as a four-digit year. That window is what keeps
-- this from turning every six-digit run into a date: 010125 reads as a
-- date because 25 lands in the window, 010199 does not.
create or replace function sv_try_date(p text)
returns date
language plpgsql stable set search_path to 'public'
as $$
declare dd int; mm int; yy int;
begin
  if p ~ '^\d{8}$' then          -- DDMMYYYY
    dd := substr(p,1,2)::int; mm := substr(p,3,2)::int; yy := substr(p,5,4)::int;
  elsif p ~ '^\d{7}$' then       -- DMMYYYY, single-digit day
    dd := substr(p,1,1)::int; mm := substr(p,2,2)::int; yy := substr(p,4,4)::int;
  elsif p ~ '^\d{6}$' then       -- DDMMYY
    dd := substr(p,1,2)::int; mm := substr(p,3,2)::int; yy := 2000 + substr(p,5,2)::int;
  else
    return null;
  end if;
  if mm < 1 or mm > 12 or dd < 1 or dd > 31 then return null; end if;
  if yy < 2015 or yy > extract(year from current_date)::int + 1 then return null; end if;
  begin
    return make_date(yy, mm, dd);
  exception when others then
    return null;
  end;
end $$;

create or replace function parse_design_code(p_title text, p_has_date boolean default true)
returns table (
  code text, code_numeric bigint, date_digits text, parsed_date date,
  ambiguous boolean, alt_code text, alt_date date
)
language plpgsql stable set search_path to 'public'
as $$
declare
  v_digits text;
  n int;
  d8 date; d7 date; d6 date;
  c8 text; c7 text; c6 text;
  ok8 boolean; ok7 boolean; ok6 boolean;
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
end $$;
