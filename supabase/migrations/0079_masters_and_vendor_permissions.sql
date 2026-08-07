-- Managers run the buying. Blocking them from adding a vendor meant
-- every new supplier waited on the owner, so inward stalled on a data
-- entry step.
--
-- Update goes with insert deliberately: someone who can create a vendor
-- with any values they like gains nothing from also being able to edit
-- it, so withholding update adds friction without adding safety. Delete
-- stays with the owner, because a vendor carries payment history.
drop policy if exists vendors_write on vendors;

create policy vendors_insert on vendors
  for insert with check (is_manager_or_above());
create policy vendors_update on vendors
  for update using (is_manager_or_above()) with check (is_manager_or_above());
create policy vendors_delete on vendors
  for delete using (is_owner());

-- How many items depend on each master value.
--
-- The rule is: anything already used can be renamed or retired, never
-- deleted. Deleting it would orphan the items pointing at it, and an
-- item with no category cannot be priced or found. The counts drive the
-- UI so the delete button is absent rather than failing on click.
create or replace view masters_usage
with (security_invoker = true) as
select 'category'::text as kind, c.id, c.name as value, c.active,
       (select count(*) from items i where i.category_id = c.id)
       + (select count(*) from item_types t where t.category_id = c.id) as uses
from categories c
union all
select 'item_type', t.id, t.name, t.active,
       (select count(*) from items i where i.item_type_id = t.id)
from item_types t
union all
select 'attr:' || o.attr_key, o.id, o.value, o.active,
       (select count(*) from items i
         where i.colour_id = o.id or i.plating_id = o.id
            or i.stone_id = o.id or i.size_id = o.id)
from attribute_options o;

create or replace function save_category(
  p_id uuid, p_name text, p_hsn text, p_gst_rate numeric,
  p_markup numeric, p_active boolean, p_sort integer default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not is_owner() then raise exception 'Only the owner can change categories.'; end if;
  if length(v_name) < 2 then raise exception 'Give the category a name.'; end if;

  if p_id is null then
    insert into categories (name, hsn, gst_rate, markup_multiplier, active, sort_order)
    values (v_name, coalesce(nullif(btrim(p_hsn), ''), '7117'),
            coalesce(p_gst_rate, 3), coalesce(p_markup, 2.5),
            coalesce(p_active, true),
            coalesce(p_sort, (select coalesce(max(sort_order), 0) + 1 from categories)))
    returning id into v_id;
  else
    update categories
       set name = v_name,
           hsn = coalesce(nullif(btrim(p_hsn), ''), hsn),
           gst_rate = coalesce(p_gst_rate, gst_rate),
           markup_multiplier = coalesce(p_markup, markup_multiplier),
           active = coalesce(p_active, active),
           sort_order = coalesce(p_sort, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'No such category.'; end if;
  end if;
  return v_id;
end $$;

create or replace function save_item_type(
  p_id uuid, p_category uuid, p_name text, p_active boolean,
  p_sort integer default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not is_owner() then raise exception 'Only the owner can change item types.'; end if;
  if length(v_name) < 2 then raise exception 'Give the type a name.'; end if;
  if p_category is null then raise exception 'An item type belongs to a category.'; end if;

  if p_id is null then
    insert into item_types (category_id, name, active, sort_order)
    values (p_category, v_name, coalesce(p_active, true),
            coalesce(p_sort, (select coalesce(max(sort_order), 0) + 1
                              from item_types where category_id = p_category)))
    returning id into v_id;
  else
    update item_types
       set category_id = p_category, name = v_name,
           active = coalesce(p_active, active),
           sort_order = coalesce(p_sort, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'No such item type.'; end if;
  end if;
  return v_id;
end $$;

create or replace function save_attribute_option(
  p_id uuid, p_key text, p_value text, p_active boolean,
  p_sort integer default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_val text := btrim(coalesce(p_value, ''));
begin
  if not is_owner() then raise exception 'Only the owner can change these.'; end if;
  if length(v_val) < 1 then raise exception 'Give it a value.'; end if;
  if p_key not in ('colour','plating','stone','size') then
    raise exception 'Unknown attribute.';
  end if;

  if p_id is null then
    insert into attribute_options (attr_key, value, active, sort_order)
    values (p_key, v_val, coalesce(p_active, true),
            coalesce(p_sort, (select coalesce(max(sort_order), 0) + 1
                              from attribute_options where attr_key = p_key)))
    returning id into v_id;
  else
    update attribute_options
       set value = v_val, active = coalesce(p_active, active),
           sort_order = coalesce(p_sort, sort_order)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'No such value.'; end if;
  end if;
  return v_id;
end $$;

-- Deleting is only ever allowed for a value nothing points at. Anything
-- in use is retired instead: the items keep it and remain priceable and
-- findable, and it stops being offered on new ones. Refusing loudly
-- beats a foreign-key error nobody can read.
create or replace function delete_master(p_kind text, p_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_uses bigint; v_name text;
begin
  if not is_owner() then raise exception 'Only the owner can delete these.'; end if;

  select uses, value into v_uses, v_name
  from masters_usage where id = p_id and kind = p_kind;
  if v_name is null then raise exception 'No such value.'; end if;

  if v_uses > 0 then
    raise exception '% is used by % item%. Turn it off instead — it stays on the pieces that already have it and stops being offered on new ones.',
      v_name, v_uses, case when v_uses = 1 then '' else 's' end;
  end if;

  if p_kind = 'category' then delete from categories where id = p_id;
  elsif p_kind = 'item_type' then delete from item_types where id = p_id;
  elsif p_kind like 'attr:%' then delete from attribute_options where id = p_id;
  else raise exception 'Unknown kind.';
  end if;

  return v_name;
end $$;

do $$
declare v_sig text;
begin
  foreach v_sig in array array[
    'save_category(uuid, text, text, numeric, numeric, boolean, integer)',
    'save_item_type(uuid, uuid, text, boolean, integer)',
    'save_attribute_option(uuid, text, text, boolean, integer)',
    'delete_master(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end $$;
