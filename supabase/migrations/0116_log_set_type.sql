-- Ramp-up sets.
--
-- Members warm into a lift: grab the 25s, do a set, know it wasn't hard
-- enough. That set really happened and they want to keep it, but it is not
-- one of the three working sets the coach programmed, and counting it as one
-- makes every number about that lift wrong.
--
-- One column, one extra value. 'working' is the default and every existing
-- row backfills to it, so nothing that already exists changes meaning and
-- there is nothing to migrate.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: renumber anything. set_number is the
-- row's physical position within (user, exercise, date, session) and it is
-- part of logs_unique_set_idx (0073) — shifting sets 2,3,4 down to 1,2,3
-- would mean updating rows into numbers still occupied by their neighbours,
-- which a unique index rejects mid-statement (it is an index, so it cannot be
-- deferred). The DISPLAY label is derived instead: see lib/programming/
-- setLabels.js, which is the single definition of what a row is called, and
-- is what every screen that prints "SET 2" now goes through.
--
-- No index. set_type is only ever read alongside rows that are already being
-- fetched by user/exercise/date, never filtered on by itself.
--
-- Rollback:
--   alter table programming.logs drop column set_type;

alter table programming.logs
  add column set_type text not null default 'working'
  check (set_type in ('working', 'ramp_up'));

comment on column programming.logs.set_type is
  'working (default) | ramp_up. A ramp-up set is real logged work that is not one of the programmed working sets: excluded from set counts, session volume, target comparison and PR/top-set selection, but still shown (marked) wherever her sets are shown.';
