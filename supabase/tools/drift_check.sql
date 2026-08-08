-- DRIFT CHECK
--
-- Run before any deploy. Lists what is live so it can be compared with
-- the repo. If a name here has no definition in supabase/migrations,
-- the repo cannot rebuild the database.
--
-- Migrations applied through tooling record themselves in
-- supabase_migrations.schema_migrations but do not write a file, so this
-- gap opens silently and only bites when you try to restore.
select 'functions' as kind, count(*) as live,
       string_agg(name, ', ' order by name) as names
from (select distinct p.proname as name from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f'
        and not exists (select 1 from pg_depend d
                        where d.objid=p.oid and d.deptype='e')) f
union all
select 'views', count(*), string_agg(table_name, ', ' order by table_name)
from information_schema.views where table_schema='public'
union all
select 'tables', count(*), null
from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all
select 'applied migrations', count(*), max(version)
from supabase_migrations.schema_migrations;
