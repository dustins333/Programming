-- Some lifts have no weight to log at all — an inverted row, a push-up, a
-- plank. Until now every logging box came in pairs, so those lifts asked
-- the member for a number that doesn't exist, and the card could never
-- read as "done" because its weight box stayed empty forever.
--
-- Defaults TRUE so every existing exercise keeps behaving exactly as it
-- does today; a coach opts a lift out one at a time from the library form.
--
-- Deliberately NOT applied to warm-ups: they have no weight logging of
-- their own (the member just ticks them off), so the column is meaningless
-- there and the form only offers the toggle for lifts.
alter table programming.exercises
  add column tracks_weight boolean not null default true;

comment on column programming.exercises.tracks_weight is
  'False for bodyweight/rep-only lifts: the member logs reps with no weight box, and the lift is excluded from personal-record tracking (a PR is defined on weight).';
