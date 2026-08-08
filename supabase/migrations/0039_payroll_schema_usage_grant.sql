-- Fixes a real bug in 0036: it granted table/sequence privileges on
-- `payroll` but never granted USAGE on the schema itself. Postgres checks
-- schema-level USAGE before it even looks at table grants or RLS, so every
-- query against `payroll.*` failed with "permission denied for schema
-- payroll" regardless of the table grants already in place — the exact
-- same class of bug 0003 exists to fix for core/programming/nutrition
-- (see that file's own header comment). 0036 has already been run against
-- the live project, so this patches it forward rather than editing 0036
-- itself (which wouldn't retroactively apply).
grant usage on schema payroll to anon, authenticated, service_role;

-- So this doesn't need repeating for every future migration's new payroll
-- tables, same as 0003 does for the original three schemas.
alter default privileges in schema payroll grant all on tables to anon, authenticated, service_role;
alter default privileges in schema payroll grant all on sequences to anon, authenticated, service_role;

-- No new tables here, so no schema-cache reload needed — but it's cheap
-- and harmless to run anyway if you want to be sure:
-- NOTIFY pgrst, 'reload schema';
