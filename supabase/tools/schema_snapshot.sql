-- SCHEMA SNAPSHOT
--
-- Run this in the Supabase SQL editor, copy the single cell it returns,
-- and save it as supabase/migrations/0100_baseline_snapshot.sql.
--
-- Why this exists: the live database has 321 applied migrations, the
-- repo has about 86 files, and 113 of the 215 live functions appear in
-- NO repo migration at all. That drift happened because migrations
-- applied through tooling are recorded in the database but never write
-- themselves back to the repo.
--
-- The consequence is not theoretical. Rebuilding this database from the
-- repo today would produce a system missing half its logic -- including
-- pos_finalise_bill, post_journal, record_expense and every comms
-- trigger. That is the difference between having a backup and thinking
-- you have one.
--
-- This emits every function, view, policy, index and trigger currently
-- live, as CREATE OR REPLACE statements, so the repo can reproduce the
-- database. It does NOT emit table DDL -- those came from the numbered
-- migrations and are already in the repo.
select string_agg(ddl, E'\n\n' order by sort_key, name)
from (
  -- Functions, excluding anything owned by an extension (pg_trgm and
  -- friends install their own and would be recreated wrongly).
  select 1 as sort_key, p.proname as name,
         pg_get_functiondef(p.oid) || ';' as ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e')

  union all

  select 2, c.relname,
         'create or replace view ' || c.relname || ' as' || E'\n' ||
         pg_get_viewdef(c.oid, true)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'

  union all

  select 3, i.indexname,
         i.indexdef || ';'
  from pg_indexes i
  where i.schemaname = 'public'
    -- Primary keys and unique constraints come with the table.
    and not exists (
      select 1 from pg_constraint con
      where con.conname = i.indexname)

  union all

  select 4, pol.polname,
         'drop policy if exists ' || quote_ident(pol.polname) ||
         ' on ' || (pol.polrelid::regclass)::text || ';' || E'\n' ||
         'create policy ' || quote_ident(pol.polname) ||
         ' on ' || (pol.polrelid::regclass)::text ||
         ' for ' || case pol.polcmd
                      when 'r' then 'select' when 'a' then 'insert'
                      when 'w' then 'update' when 'd' then 'delete'
                      else 'all' end ||
         coalesce(' using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', '') ||
         coalesce(' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '') ||
         ';'
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all

  select 5, t.tgname,
         pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
) x;
