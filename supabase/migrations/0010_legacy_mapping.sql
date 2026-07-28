-- =====================================================================
-- 0010_legacy_mapping.sql
-- Maps Vasy's 78 free-text category strings onto the canonical list.
--
-- Used once, during the catalog load. Kept afterwards as the audit trail
-- for how each legacy item was classified, so a surprising sell-through
-- number can be traced back to a mapping decision rather than guessed at.
--
-- Anything not listed here resolves to 'Other' and appears in the
-- unmapped_legacy_categories view for manual review. Nothing is silently
-- dropped.
-- =====================================================================

create table legacy_category_map (
  legacy_value   text primary key,
  category_name  text not null references categories(name),
  note           text
);

comment on table legacy_category_map is
  'Vasy category string -> canonical category. Case-sensitive on the '
  'legacy side because Vasy stored bangles and BANGLE as distinct values.';

insert into legacy_category_map (legacy_value, category_name, note) values
  -- Neckwear
  ('Short Neck Set',        'Short Neck Set',    null),
  ('neckset',               'Short Neck Set',    'merged'),
  ('Short Necklace',        'Short Neck Set',    'merged'),
  ('lear neck set',         'Short Neck Set',    'merged, likely "layer"'),
  ('LONG NECK SET',         'Long Neck Set',     null),
  ('Long Necklaces',        'Long Neck Set',     'merged'),
  ('3/4 neck set',          '3/4 Neck Set',      null),
  ('long haram',            'Long Haram',        null),
  ('Short Haram',           'Short Haram',       null),
  ('chandra haram',         'Chandra Haram',     null),
  ('Chowkers',              'Chowkers',          null),
  ('kante',                 'Kante',             null),
  ('black beads',           'Black Beads',       null),
  ('chains',                'Chains',            null),
  ('italian chain',         'Chains',            'merged'),
  ('cz stone chain',        'Chains',            'merged'),
  ('GOPI THADU',            'Gopi Thadu',        null),
  ('pendant set',           'Pendant Set',       null),
  ('PENDANT AND EARRINGS',  'Pendant Set',       'merged'),
  ('combo set',             'Combo Set',         null),

  -- Ears
  ('earrings',              'Earrings',          null),
  ('studs',                 'Studs',             null),
  ('bugadis',               'Bugadis',           null),
  ('chempaswaralu',         'Chempaswaralu',     null),
  ('ear accessories',       'Ear Accessories',   null),
  ('matilu',                'Matilu',            null),

  -- Hands and wrists
  ('bangles',               'Bangles',           null),
  ('BANGLE',                'Bangles',           'merged, case variant'),
  ('kada',                  'Kada',              null),
  ('KADIYAM',               'Kadiyam',           null),
  ('bracelet',              'Bracelet',          null),
  ('Mens Bracelets',        'Mens Bracelets',    null),
  ('FINGER RINGS',          'Finger Rings',      null),
  ('Rings',                 'Finger Rings',      'merged'),
  ('vanki',                 'Vanki',             null),

  -- Head and hair
  ('mang tika',             'Maang Tikka',       null),
  ('Maang Tikka',           'Maang Tikka',       'merged, spelling variant'),
  ('nan patti',             'Nan Patti',         null),
  ('Jada Billalu',          'Jada Billalu',      null),
  ('beads jada',            'Beads Jada',        null),
  ('Hair Accessories',      'Hair Accessories',  null),
  ('suryudu chendrudu',     'Suryudu Chandrudu', null),
  ('NOSE PINS',             'Nose Pins',         null),

  -- Waist and feet
  ('Vaddanam',              'Vaddanam',          null),
  ('HIP BELT',              'Hip Belt',          null),
  ('HIP CHAIN',             'Hip Chain',         null),
  ('Anklets',               'Anklets',           null),
  ('PATTILU',               'Pattilu',           null),
  ('PATILU',                'Pattilu',           'merged, misspelling'),
  ('PULI GORU',             'Puli Goru',         null),

  -- Other
  ('saree pin',             'Saree Pin',         null),
  ('pearls',                'Pearls',            null),
  ('BAGS',                  'Bags',              null),
  ('Raw Material',          'Raw Material',      null),
  ('other',                 'Other',             null)
on conflict (legacy_value) do nothing;

-- Resolver used by the load. Unmapped values land in Other rather than
-- failing the import or dropping the row.
create or replace function resolve_legacy_category(p_legacy text)
returns uuid
language sql
stable
set search_path = public
as $$
  select c.id
  from categories c
  where c.name = coalesce(
    (select m.category_name from legacy_category_map m
     where m.legacy_value = p_legacy),
    'Other'
  )
$$;

-- Staging table for the Vasy catalog load. Populate this from the mirror
-- in the SVDashboard project, validate, then promote into items.
create table if not exists staging_vasy_products (
  item_code       text,
  batch_no        text,
  product_name    text,
  category        text,
  sub_category    text,
  hsn_code        text,
  mrp             numeric,
  purchase_price  numeric,
  qty             numeric,
  image_url       text,
  branch_id       text,
  loaded_at       timestamptz not null default now()
);

create index if not exists staging_vasy_item_code_idx on staging_vasy_products (item_code);

-- Everything Vasy has that this mapping does not cover. Should be empty
-- or deliberate before the load is promoted.
create or replace view unmapped_legacy_categories as
select s.category as legacy_value, count(*) as rows
from staging_vasy_products s
left join legacy_category_map m on m.legacy_value = s.category
where m.legacy_value is null and s.category is not null and s.category <> ''
group by s.category
order by rows desc;
