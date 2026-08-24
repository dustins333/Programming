-- Warm-up supersets + templates get supersets (2026-08-23, per Terra).
--
-- 1. superset_group_id comes to every warm-up table. Same shape as 0030's
--    exercise pairing: a plain shared token, not an FK — rows sharing a
--    non-null value are one superset. Unlike lift supersets (pairs by UI
--    convention), warm-up supersets can chain 3+ movements; the display is
--    a repeated number (warm-ups 3,4,5 supersetted all read "3"), not
--    letters.
--
-- 2. Templates get lift supersets too — reverses 0030's deliberate
--    "templates are single flat prescriptions" exclusion, per direct
--    confirmation. template_exercises gains the same column, and
--    one_off_exercises gains it as well so createOneOffFromTemplate can
--    carry the pairing onto the client's copy.
--
-- 3. one_off_exercises also gains rep_scheme — 0030 added it to group/SPC/
--    template but never to one-offs, so a template's per-set reps were
--    silently flattened when assigned. Backfilled the same way 0030 did.
--
-- No RLS changes: every policy on these tables is row-scoped, not
-- column-scoped, so a new column inherits the existing policies.

alter table programming.group_workout_warmups add column superset_group_id uuid;
alter table programming.spc_workout_warmups add column superset_group_id uuid;
alter table programming.template_warmups add column superset_group_id uuid;
alter table programming.one_off_warmups add column superset_group_id uuid;

alter table programming.template_exercises add column superset_group_id uuid;
alter table programming.one_off_exercises add column superset_group_id uuid;

alter table programming.one_off_exercises add column rep_scheme jsonb;
update programming.one_off_exercises
  set rep_scheme = to_jsonb(array_fill(reps, array[sets]))
  where rep_scheme is null and sets is not null and sets > 0;

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New columns need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
