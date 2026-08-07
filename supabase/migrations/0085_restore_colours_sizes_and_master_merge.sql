-- ── Restoring colours and sizes ──────────────────────────────────────
--
-- The data migration cleared attribute_options wholesale so the migrated
-- stone and plating values could keep deterministic ids. Stone and
-- plating were refilled from the VasyERP "brand" and "sub_brand"
-- columns. Colour and size had NO equivalent column in that export, so
-- nothing refilled them and the curated lists from 0008_seed were simply
-- gone.
--
-- Restored here from that seed. Nothing referenced them -- every item
-- arrived with colour_id and size_id null -- so this is a clean restore,
-- not a repair.
insert into attribute_options (attr_key, value, sort_order, active) values
  ('colour',  'Gold',              10, true),
  ('colour',  'Rose Gold',         20, true),
  ('colour',  'Silver',            30, true),
  ('colour',  'Antique Gold',      40, true),
  ('colour',  'Two Tone',          50, true),
  ('colour',  'Matte Gold',        60, true),
  ('colour',  'Oxidised',          70, true),
  ('colour',  'Multi',             80, true),

  ('size',    'Free Size',         10, true),
  ('size',    'Small',             20, true),
  ('size',    'Medium',            30, true),
  ('size',    'Large',             40, true),
  ('size',    '2.2',               50, true),
  ('size',    '2.4',               60, true),
  ('size',    '2.6',               70, true),
  ('size',    '2.8',               80, true),

  -- The migrated plating values are GRADE names carried over from the
  -- old system ("Temple Premium", "Real Jadau") -- they describe the
  -- style, not the finish. These are the actual finishes.
  ('plating', '1 Gram Gold',      110, true),
  ('plating', 'Micro Gold',       120, true),
  ('plating', 'Gold Polish',      130, true),
  ('plating', 'Rhodium',          140, true),
  ('plating', 'Antique Finish',   150, true),
  ('plating', 'Matte Finish',     160, true)
on conflict (attr_key, value) do nothing;

-- ── Merging masters ──────────────────────────────────────────────────
--
-- A merge is NOT a delete. Everything pointing at the loser has to be
-- repointed at the winner first, or the delete fails on a foreign key or
-- orphans real stock. Doing it inside one function means that order can
-- never be got wrong by hand. The old name goes to audit_log, because
-- "where did the matilu category go" is a question asked months later.
create or replace function merge_category(p_from uuid, p_into uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_from text; v_into text; v_items int;
begin
  if not is_owner() then raise exception 'Only the owner can merge categories.'; end if;
  if p_from = p_into then raise exception 'Those are the same category.'; end if;

  select name into v_from from categories where id = p_from;
  select name into v_into from categories where id = p_into;
  if v_from is null or v_into is null then raise exception 'No such category.'; end if;

  select count(*) into v_items from items where category_id = p_from;

  update items            set category_id = p_into where category_id = p_from;
  update item_types       set category_id = p_into where category_id = p_from;
  update discount_targets set category_id = p_into where category_id = p_from;
  update pricing_rules    set category_id = p_into where category_id = p_from;

  delete from categories where id = p_from;

  insert into audit_log (table_name, row_id, action, old_data, new_data, changed_by)
  values ('categories', p_from, 'merge',
          jsonb_build_object('name', v_from, 'items_moved', v_items),
          jsonb_build_object('merged_into', v_into), current_staff_id());

  return jsonb_build_object('from', v_from, 'into', v_into, 'items_moved', v_items);
end $$;

create or replace function merge_attribute_option(p_from uuid, p_into uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_from text; v_into text; v_key text; v_key2 text; v_items int;
begin
  if not is_owner() then raise exception 'Only the owner can merge these.'; end if;
  if p_from = p_into then raise exception 'Those are the same value.'; end if;

  select value, attr_key into v_from, v_key  from attribute_options where id = p_from;
  select value, attr_key into v_into, v_key2 from attribute_options where id = p_into;
  if v_from is null or v_into is null then raise exception 'No such value.'; end if;
  -- A stone must not fold into a plating: different columns on items, so
  -- the value would silently vanish.
  if v_key <> v_key2 then
    raise exception 'Those are different kinds of attribute (% and %).', v_key, v_key2;
  end if;

  select count(*) into v_items from items
   where colour_id = p_from or plating_id = p_from
      or stone_id = p_from or size_id = p_from;

  update items set colour_id  = p_into where colour_id  = p_from;
  update items set plating_id = p_into where plating_id = p_from;
  update items set stone_id   = p_into where stone_id   = p_from;
  update items set size_id    = p_into where size_id    = p_from;

  delete from attribute_options where id = p_from;

  insert into audit_log (table_name, row_id, action, old_data, new_data, changed_by)
  values ('attribute_options', p_from, 'merge',
          jsonb_build_object('value', v_from, 'attr_key', v_key, 'items_moved', v_items),
          jsonb_build_object('merged_into', v_into), current_staff_id());

  return jsonb_build_object('from', v_from, 'into', v_into, 'items_moved', v_items);
end $$;

create or replace function merge_category_by_name(p_from text, p_into text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare a uuid; b uuid;
begin
  select id into a from categories where name = p_from;
  select id into b from categories where name = p_into;
  if a is null then return jsonb_build_object('skipped', p_from, 'reason', 'not found'); end if;
  if b is null then raise exception 'Target category % does not exist.', p_into; end if;
  return merge_category(a, b);
end $$;

create or replace function merge_attribute_by_value(p_key text, p_from text, p_into text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare a uuid; b uuid;
begin
  select id into a from attribute_options where attr_key = p_key and value = p_from;
  select id into b from attribute_options where attr_key = p_key and value = p_into;
  if a is null then return jsonb_build_object('skipped', p_from, 'reason', 'not found'); end if;
  if b is null then raise exception 'Target % does not exist.', p_into; end if;
  return merge_attribute_option(a, b);
end $$;

do $$
declare v text;
begin
  foreach v in array array[
    'merge_category(uuid, uuid)',
    'merge_attribute_option(uuid, uuid)',
    'merge_category_by_name(text, text)',
    'merge_attribute_by_value(text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v);
    execute format('grant execute on function public.%s to authenticated, service_role', v);
  end loop;
end $$;

-- ── Product search and cost lookup speed ─────────────────────────────
--
-- item_latest_cost is a DISTINCT ON view, which cannot be pushed a
-- filter: asking for 200 items sorted all 5,316 cost rows and discarded
-- 5,156. 130ms, paid on every products page load. This index matches the
-- view's own sort key, so the sort disappears -- measured at 5.9ms after.
create index if not exists item_costs_latest_idx
  on item_costs (item_id, effective_from desc, created_at desc);

-- Leading-wildcard ILIKE cannot use a btree, so search was a sequential
-- scan of the whole catalogue. Trigram GIN handles exactly this shape.
create index if not exists items_name_trgm_idx    on items using gin (name gin_trgm_ops);
create index if not exists items_barcode_trgm_idx on items using gin (barcode gin_trgm_ops);
create index if not exists items_created_idx      on items (created_at desc);
create index if not exists items_category_idx     on items (category_id);
create index if not exists items_status_idx       on items (status);
