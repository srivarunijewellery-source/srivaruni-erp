create or replace function public.apply_selva_price_sheet(
  p_inward  uuid,
  p_rows    jsonb,
  p_dry_run boolean default true
)
returns table(
  kind        text,
  line_id     uuid,
  barcode     text,
  item_name   text,
  code        text,
  size_text   text,
  variant     text,
  status      text,
  rate_paise  bigint,
  was_paise   bigint,
  candidates  jsonb,
  note        text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        record;
  v_code   text;
  v_var    text;
  v_hits   int;
  v_price  bigint;
  v_note   text;
  v_status text;
  v_cands  jsonb;
begin
  if not is_owner() then
    raise exception 'Only the owner can price an inward.';
  end if;

  -- The quotation, one row per line. code + variant is the key.
  --
  -- The code alone is NOT a price. On a Selva chain quotation the same
  -- seven digits appear at 20", 24" and 30" for prices up to Rs210
  -- apart -- two lines in five on the sample document -- and on a bangle
  -- sheet one code covers 2.4 through 2.10. Matching on the code alone
  -- would mis-cost all of them without saying a word.
  create temp table _selva (
    code    text,
    variant text,
    paise   bigint,
    descr   text
  ) on commit drop;

  insert into _selva (code, variant, paise, descr)
  select btrim(x->>'code'),
         norm_variant(x->>'variant'),
         (x->>'paise')::bigint,
         x->>'desc'
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  where btrim(coalesce(x->>'code','')) <> ''
    and coalesce(x->>'paise','') ~ '^\d+$';

  if not exists (select 1 from _selva) then
    raise exception 'No usable rows were read from that PDF.';
  end if;

  for r in
    select il.id, i.barcode, i.name,
           coalesce(i.gst_rate, 3) as gst,
           sz.value as size_text,
           norm_variant(sz.value) as var,
           ilc.rate_paise as existing
    from inward_lines il
    join items i on i.id = il.item_id
    left join attribute_options sz on sz.id = i.size_id
    left join inward_line_costs ilc on ilc.inward_line_id = il.id
    where il.inward_id = p_inward
    order by il.line_no nulls last, il.id
  loop
    v_code := null; v_price := null; v_note := null; v_cands := null;
    v_var := r.var;

    select p.code into v_code from parse_design_code(r.name, true) p;

    if v_code is null then
      return query select 'line', r.id, r.barcode, r.name, null::text,
        r.size_text, v_var, 'no_code', null::bigint, r.existing, null::jsonb,
        'no design code in the title'::text;
      continue;
    end if;

    select count(*) into v_hits from _selva s where s.code = v_code;

    if v_hits = 0 then
      return query select 'line', r.id, r.barcode, r.name, v_code,
        r.size_text, v_var, 'not_in_sheet', null::bigint, r.existing, null::jsonb,
        ('code ' || v_code || ' is not on this quotation')::text;
      continue;
    end if;

    if v_hits = 1 then
      -- One price for the code, so the size cannot change the answer and
      -- a missing size costs nothing. This is most of a shipment.
      select s.paise into v_price from _selva s where s.code = v_code;
    else
      -- Several sizes under one code. Only the item's own size can
      -- separate them, and if it is blank or unreadable the honest move
      -- is to stop. A guess here becomes a wrong landed cost, then a
      -- wrong tag price, then a wrong margin on every report after it.
      if v_var is null then
        select jsonb_agg(jsonb_build_object('variant', s.variant, 'paise', s.paise,
                                            'desc', s.descr) order by s.variant)
          into v_cands from _selva s where s.code = v_code;
        return query select 'line', r.id, r.barcode, r.name, v_code,
          r.size_text, v_var, 'ambiguous', null::bigint, r.existing, v_cands,
          (v_hits || ' sizes on the quotation, none recorded on the item')::text;
        continue;
      end if;

      select count(*), min(s.paise) into v_hits, v_price
      from _selva s where s.code = v_code and s.variant is not distinct from v_var;

      if v_hits <> 1 then
        select jsonb_agg(jsonb_build_object('variant', s.variant, 'paise', s.paise,
                                            'desc', s.descr) order by s.variant)
          into v_cands from _selva s where s.code = v_code;
        return query select 'line', r.id, r.barcode, r.name, v_code,
          r.size_text, v_var, 'ambiguous', null::bigint, r.existing, v_cands,
          (case when v_hits = 0
                then 'the quotation has no ' || coalesce(v_var,'?') || ' of code ' || v_code
                else 'two prices for ' || v_code || ' at ' || v_var end)::text;
        continue;
      end if;
    end if;

    -- Selva quote GST-inclusive and the vendor record now says so, so
    -- the figure goes in exactly as printed. compute_inward_costs backs
    -- the 3% out of it; doing that here as well would remove it twice.
    if r.existing is not null and r.existing <> v_price then
      v_note := 'was ' || fmt_paise(r.existing);
    end if;
    v_status := case when r.existing is distinct from v_price then 'priced' else 'unchanged' end;

    if not p_dry_run then
      insert into inward_line_costs (inward_line_id, rate_paise, gst_rate)
      values (r.id, v_price, r.gst)
      on conflict (inward_line_id) do update set rate_paise = excluded.rate_paise;
    end if;

    return query select 'line', r.id, r.barcode, r.name, v_code,
      r.size_text, v_var, v_status, v_price, r.existing, null::jsonb, v_note;
  end loop;

  -- The other direction. A quotation line that reached no item usually
  -- means a piece was never entered at inward, and a report that only
  -- looks line-to-sheet would never show it.
  return query
    select 'sheet', null::uuid, null::text, s.descr, s.code,
           null::text, s.variant, 'sheet_unused', s.paise, null::bigint,
           null::jsonb, 'on the quotation, no matching item on this inward'::text
    from _selva s
    where not exists (
      select 1
      from inward_lines il
      join items i on i.id = il.item_id
      left join attribute_options sz on sz.id = i.size_id
      where il.inward_id = p_inward
        and (select p.code from parse_design_code(i.name, true) p) = s.code
        and (
          (select count(*) from _selva s2 where s2.code = s.code) = 1
          or norm_variant(sz.value) is not distinct from s.variant
        )
    )
    order by s.code, s.variant;

  if not p_dry_run then
    perform compute_inward_costs(p_inward);
  end if;
end $function$;
