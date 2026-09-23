-- 0134 — "this program is the trial bench", as a real flag rather than its name.
--
-- The trial program is where coaches build the next block: they program it,
-- run it on themselves in the gym, change it on the fly for a week or three,
-- and then push it to a real group program (lib/programming/pushBlock.js).
-- It is an ordinary group program with only coaches enrolled, so everything
-- else — logging, My Week, block history — keeps working untouched.
--
-- Two things read this flag: the Group Programs page swaps the week grid for
-- the trial workbench, and the push refuses any source that isn't the trial
-- and any target that is (pushing only ever goes trial -> real program).
--
-- It shipped first as a name check (`/trial/i` on group_programs.name), which
-- made renaming the program silently turn the feature off. The app keeps that
-- as a fallback for exactly one reason: a deploy that lands before this
-- migration is run would otherwise see `is_trial` undefined on every program
-- and treat none of them as the trial.
--
-- No RLS changes. group_programs is already staff-writable and member-readable
-- as a whole row, and this column is not sensitive — it says which program is
-- the bench, not anything about a person.

alter table programming.group_programs
  add column if not exists is_trial boolean not null default false;

comment on column programming.group_programs.is_trial is
  'The coaches'' trial bench: shows the trial workbench instead of the week grid, and is the only program a block can be pushed from.';

update programming.group_programs
  set is_trial = true
  where name ilike '%trial%';
