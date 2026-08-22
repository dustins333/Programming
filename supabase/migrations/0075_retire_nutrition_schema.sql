-- Retire the dead `nutrition` tables (audit finding F13).
--
-- These six tables are the superseded placeholder nutrition build. Since
-- 2026-08-02 the real nutrition module reads and writes the standalone
-- Nutrition Tracker app's own live public.* tables instead (see CLAUDE.md,
-- "Nutrition rebuilt against the standalone app's live tables"), and this
-- schema has been inert ever since. Verified live before writing this:
--   * 10 rows across all six tables, all leftover QA data;
--   * every foreign key crosses OUT of it into core.users -- nothing
--     anywhere depends on it, and FKs follow a rename automatically;
--   * zero database functions or views reference `nutrition.`;
--   * the only reference in any repo was the exported `nutrition` schema
--     handle in lib/supabase/client.js, which nothing imported. Removed in
--     the same commit as this migration.
--
-- ---------------------------------------------------------------------
-- Why the TABLES are renamed and not the SCHEMA
-- ---------------------------------------------------------------------
-- The obvious move is `alter schema nutrition rename to
-- nutrition_deprecated`. Do not: `nutrition` is listed in the project's
-- PostgREST exposed-schemas config, and PostgREST does not skip a
-- configured schema that has gone missing -- it fails the ENTIRE
-- schema-cache build and answers every request, on every schema, with
--   503 PGRST002 "Could not query the database for the schema cache".
--
-- Established the hard way on 2026-08-21: the schema rename took
-- public/core/programming/payroll down together for ~45 seconds, until
-- `alter schema nutrition_deprecated rename to nutrition;` brought them
-- straight back (confirmed 200 on all five on the first poll afterwards).
--
-- Renaming the tables instead gets the same result with none of that. The
-- schema keeps existing so PostgREST stays happy, while anything still
-- reaching for `nutrition.daily_logs` breaks loudly and immediately, and
-- the whole thing reverts in six statements. It also means the exposed-
-- schemas entry never has to be touched: when these are finally dropped,
-- an empty `nutrition` schema is a perfectly good end state.
--
-- Rollback, if anything breaks:
--   alter table nutrition.zz_deprecated_nutrition_clients rename to nutrition_clients;
--   alter table nutrition.zz_deprecated_targets rename to targets;
--   alter table nutrition.zz_deprecated_daily_logs rename to daily_logs;
--   alter table nutrition.zz_deprecated_checkin_template_questions rename to checkin_template_questions;
--   alter table nutrition.zz_deprecated_client_checkin_questions rename to client_checkin_questions;
--   alter table nutrition.zz_deprecated_checkin_responses rename to checkin_responses;
--
-- Drop them after 30 quiet days (leave the empty schema in place):
--   drop table nutrition.zz_deprecated_checkin_responses,
--              nutrition.zz_deprecated_client_checkin_questions,
--              nutrition.zz_deprecated_checkin_template_questions,
--              nutrition.zz_deprecated_daily_logs,
--              nutrition.zz_deprecated_targets,
--              nutrition.zz_deprecated_nutrition_clients;
-- ---------------------------------------------------------------------
alter table nutrition.nutrition_clients          rename to zz_deprecated_nutrition_clients;
alter table nutrition.targets                    rename to zz_deprecated_targets;
alter table nutrition.daily_logs                 rename to zz_deprecated_daily_logs;
alter table nutrition.checkin_template_questions rename to zz_deprecated_checkin_template_questions;
alter table nutrition.client_checkin_questions   rename to zz_deprecated_client_checkin_questions;
alter table nutrition.checkin_responses          rename to zz_deprecated_checkin_responses;

comment on schema nutrition is
  'Dead placeholder nutrition build, superseded 2026-08-02 by the live public.* tables. Its tables were renamed zz_deprecated_* by migration 0075 on 2026-08-21; safe to drop them after 30 quiet days. Keep the schema itself: it is in the PostgREST exposed-schemas config, and removing a configured schema fails the whole Data API. See 0075.';

-- PostgREST caches table names — NOTIFY pgrst, 'reload schema'; in the SQL
-- Editor right after running this.
