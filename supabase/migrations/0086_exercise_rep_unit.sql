-- What the "reps" column actually counts, per exercise.
--
-- Volume is reps x weight, and that arithmetic is only true when the reps
-- are reps. A Farmer Carry logged as "60 reps @ 62 lb" is 3,720 lb of
-- honest-looking volume from 60 seconds of walking — measured over the real
-- 30-day log, carries and holds were ~9% of the gym's total load.
--
-- A threshold can't separate that from a real heavy set (a 1,980 lb carry
-- sits squarely inside the legitimate range), and tracks_weight is the wrong
-- switch: the 62 lb IS real and the member needs to see it. The two facts
-- are genuinely orthogonal — a carry is weighted AND measured in seconds, a
-- plank is neither — so this is its own column rather than a third
-- tracks_weight state.
--
-- Three values, not a unit list: a coach picks the KIND of thing being
-- counted, never seconds-vs-minutes or feet-vs-metres. Time displays in
-- seconds and distance in feet, which is what this gym writes anyway — if
-- that ever needs to vary it belongs on the exercise, not in this column.
--
-- Default 'reps' means every existing exercise keeps behaving exactly as it
-- does today. Nothing to backfill; the carries get flipped by hand after.
alter table programming.exercises
  add column if not exists rep_unit text not null default 'reps';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_rep_unit_check'
  ) then
    alter table programming.exercises
      add constraint exercises_rep_unit_check
      check (rep_unit in ('reps', 'time', 'distance'));
  end if;
end $$;

-- No RLS change: this is one more column on a table whose policies are
-- already whole-row (staff read, staff-with-library-access manage).
