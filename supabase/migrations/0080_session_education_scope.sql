-- A coach-education note can now be about the warm-up block as a whole, not
-- just the session as a whole or one specific movement.
--
-- 0079 encoded "general" as exercise_id is null, which was fine while there
-- was exactly one kind of general. There are two now, so the absence of an
-- exercise no longer says which — hence a real discriminator rather than
-- another nullable column to infer from.
--
-- THE RULE: `scope` is only consulted when exercise_id is null. A row with an
-- exercise is about that exercise, whatever scope says — and the app always
-- writes scope back to 'session' when a specific exercise is picked, so
-- clearing the dropdown later can't resurface a stale general.
--
-- 'exercises' is allowed by the constraint but deliberately not offered in
-- the UI: Terra's call was that "the exercises in general" and "the session
-- in general" are the same note, and asking a coach to choose between two
-- options that mean the same thing is exactly the hesitation this feature
-- exists to remove. It's in the constraint so adding it later is a UI change
-- with no migration behind it.
--
-- Every existing row defaults to 'session', which is what a null exercise_id
-- already meant — so nothing needs backfilling and nothing changes on screen.

alter table programming.session_education
  add column scope text not null default 'session'
    check (scope in ('session', 'warmup', 'exercises'));

-- New column — PostgREST needs the usual nudge before it's readable:
-- NOTIFY pgrst, 'reload schema';
