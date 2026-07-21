-- Custom schemas don't automatically get the table-level GRANTs that
-- `public` has by default in every Supabase project — PostgREST still needs
-- USAGE on the schema and privileges on its tables even though row access
-- is actually gated by RLS policies underneath. Same reason "permission
-- denied for schema core" showed up even after core/programming/nutrition
-- were added to Exposed Schemas: exposing a schema to the Data API and
-- granting the API roles permission to use it are two separate steps.
grant usage on schema core, programming, nutrition to anon, authenticated, service_role;

grant all on all tables in schema core to anon, authenticated, service_role;
grant all on all sequences in schema core to anon, authenticated, service_role;
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
grant all on all tables in schema nutrition to anon, authenticated, service_role;
grant all on all sequences in schema nutrition to anon, authenticated, service_role;

-- So this doesn't need repeating for every future migration's new tables.
alter default privileges in schema core grant all on tables to anon, authenticated, service_role;
alter default privileges in schema core grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema programming grant all on tables to anon, authenticated, service_role;
alter default privileges in schema programming grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema nutrition grant all on tables to anon, authenticated, service_role;
alter default privileges in schema nutrition grant all on sequences to anon, authenticated, service_role;
