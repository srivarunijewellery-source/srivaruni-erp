-- See 0050 for why this is its own migration.
alter type location_kind add value if not exists 'lost' after 'damage';
