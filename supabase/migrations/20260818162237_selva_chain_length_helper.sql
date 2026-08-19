-- Superseded by norm_variant (20260818162428), which handles bangle
-- sizes as well as chain lengths. Kept because the ledger records it.
create or replace function public.chain_length_inches(p_size text)
returns int
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_size is null then null
    when p_size like '%.%' then null
    when (regexp_match(p_size, '^\s*(\d{1,2})\s*(inch|inches|in|")?\s*$', 'i'))[1] is null then null
    when ((regexp_match(p_size, '^\s*(\d{1,2})\s*(inch|inches|in|")?\s*$', 'i'))[1])::int
         between 8 and 60
    then ((regexp_match(p_size, '^\s*(\d{1,2})\s*(inch|inches|in|")?\s*$', 'i'))[1])::int
    else null
  end;
$function$;
