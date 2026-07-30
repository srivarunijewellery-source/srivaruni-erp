-- =====================================================================
-- 0036_discount_targets_attributes.sql
-- Applied remotely as 'discount_targets_attributes'.
--
-- Targeting could only reach category, item type, vendor and a specific
-- item. A festival offer on "all rose-gold plating" or "every ruby piece"
-- was unexpressible, which is most of how these campaigns get described
-- out loud.
--
-- Same null-means-any semantics as the existing columns: within one row
-- every non-null column must match (AND), across rows any matching row
-- covers the item (OR).
-- =====================================================================

alter table discount_targets
  add column plating_id uuid references attribute_options(id) on delete cascade,
  add column stone_id   uuid references attribute_options(id) on delete cascade,
  add column colour_id  uuid references attribute_options(id) on delete cascade,
  add column size_id    uuid references attribute_options(id) on delete cascade;

comment on table discount_targets is
  'Targeting rows for a scheme. Within a row, every non-null column must match the item (AND). Across rows, any matching row covers the item (OR). A scheme with no rows at all covers everything.';

alter table discount_targets drop constraint discount_targets_something_ck;

alter table discount_targets add constraint discount_targets_something_ck check (
  num_nonnulls(category_id, item_type_id, vendor_id, item_id,
               plating_id, stone_id, colour_id, size_id) >= 1
);

create or replace function discount_covers_item(p_scheme uuid, p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from discount_targets t where t.scheme_id = p_scheme)
      or exists (
        select 1
        from discount_targets t
        join items i on i.id = p_item
        where t.scheme_id = p_scheme
          and (t.category_id  is null or t.category_id  = i.category_id)
          and (t.item_type_id is null or t.item_type_id = i.item_type_id)
          and (t.vendor_id    is null or t.vendor_id    = i.vendor_id)
          and (t.item_id      is null or t.item_id      = i.id)
          and (t.plating_id   is null or t.plating_id   = i.plating_id)
          and (t.stone_id     is null or t.stone_id     = i.stone_id)
          and (t.colour_id    is null or t.colour_id    = i.colour_id)
          and (t.size_id      is null or t.size_id      = i.size_id)
      );
$$;
