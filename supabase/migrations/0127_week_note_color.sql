-- A colour on a week's free-text tab.
--
-- 0125 gave the phase tab a colour and left the label tabs plain white, so
-- a week carrying "Mexico trip" and one carrying "sick Tue-Thu" read
-- identically at a glance, which is most of what a coach scanning eleven
-- weeks is doing.
--
-- Same storage rule as nutrition_week_phases.color: the value is a palette
-- KEY ("clay", "olive", ...), never a hex, so the palette can be retuned in
-- lib/nutrition/weekPhases.js without a single row changing, and there is
-- deliberately no CHECK against the known keys — an unrecognised key falls
-- back in the app rather than needing a migration every time a colour is
-- added.
--
-- Nullable, and null is a real value here rather than just "unset": it is
-- the plain white tab, which is what every existing label already is and
-- what a coach who does not want to colour-code a particular week should
-- still be able to choose. That is the one way this differs from the phase
-- column, where null falls back to the default colour.
alter table programming.nutrition_week_notes
  add column if not exists color text;

-- Column-only change, so no new grants are needed — but PostgREST still
-- caches the column list, so run this in the SQL Editor right after:
--   NOTIFY pgrst, 'reload schema';
--
-- Rollback:
--   alter table programming.nutrition_week_notes drop column color;
