-- =====================================================================
-- 0008_seed.sql
-- Locations and the canonical category list.
--
-- These categories are derived from your live Vasy catalog (7,880 items),
-- with duplicates merged. Vasy carried 78 category strings that are
-- really about 44 categories, because the field was free text:
--
--   bangles (1012)        + BANGLE (219)
--   FINGER RINGS (203)    + Rings (62)
--   PATILU (31)           + PATTILU (24)          <- typo
--   mang tika (151)       + Maang Tikka (10)
--   Short Neck Set (717)  + neckset (121)
--                         + Short Necklace (73)
--                         + lear neck set (10)
--   LONG NECK SET (306)   + Long Necklaces (62)
--   chains (300)          + italian chain (18)
--                         + cz stone chain (45)
--
-- That is why staff cannot insert into categories or attribute_options
-- in this system. The RLS policy on those tables is the fix for exactly
-- this failure, and your own data is the evidence.
--
-- REVIEW THIS LIST WITH YOUR MANAGER BEFORE LAUNCH. Changing it after
-- inwards start flowing is a data migration.
-- =====================================================================

insert into locations (code, name, kind, state_code, bill_prefix) values
  ('BOD', 'Boduppal',    'store',   '36', 'BOD'),
  ('ZHB', 'Zaheerabad',  'store',   '36', 'ZHB'),
  ('TRN', 'In Transit',  'transit', '36', null),
  ('DMG', 'Damaged',     'damage',  '36', null)
on conflict (code) do nothing;

-- HSN 7117 is imitation jewellery. Vasy has HSN empty on all 7,880 rows,
-- so this is a fresh default rather than a migration. Confirm the current
-- rate with your CA before go-live; this is not tax advice.
--
-- markup_multiplier is 2.500 across the board as a PLACEHOLDER. It drives
-- the MRP suggestion at approval. Set real per-category values before
-- launch; a wrong multiplier is a wrong price suggestion 40 times a day.
insert into categories (name, hsn, gst_rate, markup_multiplier, sort_order) values
  -- Neckwear
  ('Short Neck Set',        '7117', 3.00, 2.500, 10),
  ('Long Neck Set',         '7117', 3.00, 2.500, 20),
  ('3/4 Neck Set',          '7117', 3.00, 2.500, 30),
  ('Long Haram',            '7117', 3.00, 2.500, 40),
  ('Short Haram',           '7117', 3.00, 2.500, 50),
  ('Chandra Haram',         '7117', 3.00, 2.500, 60),
  ('Chowkers',              '7117', 3.00, 2.500, 70),
  ('Kante',                 '7117', 3.00, 2.500, 80),
  ('Black Beads',           '7117', 3.00, 2.500, 90),
  ('Chains',                '7117', 3.00, 2.500, 100),
  ('Gopi Thadu',            '7117', 3.00, 2.500, 110),
  ('Pendant Set',           '7117', 3.00, 2.500, 120),
  ('Combo Set',             '7117', 3.00, 2.500, 130),

  -- Ears
  ('Earrings',              '7117', 3.00, 2.500, 200),
  ('Studs',                 '7117', 3.00, 2.500, 210),
  ('Bugadis',               '7117', 3.00, 2.500, 220),
  ('Chempaswaralu',         '7117', 3.00, 2.500, 230),
  ('Ear Accessories',       '7117', 3.00, 2.500, 240),
  ('Matilu',                '7117', 3.00, 2.500, 250),

  -- Hands and wrists
  ('Bangles',               '7117', 3.00, 2.500, 300),
  ('Kada',                  '7117', 3.00, 2.500, 310),
  ('Kadiyam',               '7117', 3.00, 2.500, 320),
  ('Bracelet',              '7117', 3.00, 2.500, 330),
  ('Mens Bracelets',        '7117', 3.00, 2.500, 340),
  ('Finger Rings',          '7117', 3.00, 2.500, 350),
  ('Vanki',                 '7117', 3.00, 2.500, 360),

  -- Head and hair
  ('Maang Tikka',           '7117', 3.00, 2.500, 400),
  ('Nan Patti',             '7117', 3.00, 2.500, 410),
  ('Jada Billalu',          '7117', 3.00, 2.500, 420),
  ('Beads Jada',            '7117', 3.00, 2.500, 430),
  ('Hair Accessories',      '7117', 3.00, 2.500, 440),
  ('Suryudu Chandrudu',     '7117', 3.00, 2.500, 450),
  ('Nose Pins',             '7117', 3.00, 2.500, 460),

  -- Waist and feet
  ('Vaddanam',              '7117', 3.00, 2.500, 500),
  ('Hip Belt',              '7117', 3.00, 2.500, 510),
  ('Hip Chain',             '7117', 3.00, 2.500, 520),
  ('Anklets',               '7117', 3.00, 2.500, 530),
  ('Pattilu',               '7117', 3.00, 2.500, 540),
  ('Puli Goru',             '7117', 3.00, 2.500, 550),

  -- Other
  ('Saree Pin',             '7117', 3.00, 2.500, 600),
  ('Pearls',                '7117', 3.00, 2.500, 610),
  ('Bags',                  '7117', 3.00, 2.500, 620),
  ('Raw Material',          '7117', 3.00, 2.500, 900),
  ('Other',                 '7117', 3.00, 2.500, 999)
on conflict (name) do nothing;

-- Attribute values below are a STARTING GUESS. Vasy carried no structured
-- attributes, so there is nothing to migrate here. Review with your
-- manager alongside the category list.
insert into attribute_options (attr_key, value, sort_order) values
  ('colour',  'Gold',              10),
  ('colour',  'Rose Gold',         20),
  ('colour',  'Silver',            30),
  ('colour',  'Antique Gold',      40),
  ('colour',  'Two Tone',          50),
  ('colour',  'Matte Gold',        60),
  ('colour',  'Oxidised',          70),
  ('colour',  'Multi',             80),

  ('plating', '1 Gram Gold',       10),
  ('plating', 'Micro Gold',        20),
  ('plating', 'Gold Polish',       30),
  ('plating', 'Rhodium',           40),
  ('plating', 'Antique Finish',    50),
  ('plating', 'Matte Finish',      60),
  ('plating', 'None',              99),

  ('stone',   'None',              10),
  ('stone',   'CZ / AD',           20),
  ('stone',   'Ruby',              30),
  ('stone',   'Emerald',           40),
  ('stone',   'Ruby and Emerald',  50),
  ('stone',   'Pearl',             60),
  ('stone',   'Kundan',            70),
  ('stone',   'Beads',             80),
  ('stone',   'Mixed',             90),

  ('size',    'Free Size',         10),
  ('size',    'Small',             20),
  ('size',    'Medium',            30),
  ('size',    'Large',             40),
  ('size',    '2.2',               50),
  ('size',    '2.4',               60),
  ('size',    '2.6',               70),
  ('size',    '2.8',               80)
on conflict (attr_key, value) do nothing;
