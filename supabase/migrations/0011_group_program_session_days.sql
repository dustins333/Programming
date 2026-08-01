-- Session-day routing (Mon/Tue -> Session 1, Wed/Thu -> Session 2, Fri/Sat
-- -> Session 3) used to be a single hardcoded mapping shared by every
-- group program (lib/programming/schedule.js's sessionNumberForDate) —
-- fine when Flagship and BWA were the only two programs and both happened
-- to be 3x/week on the exact same calendar, but that broke the moment a
-- coach created a specialty program at a different frequency via
-- migration 0010 (e.g. a 2x/week program): it still showed 3 session
-- slots with Fri/Sat captions that don't apply. Each program now owns its
-- own day-of-week map instead of sharing one global one.
--
-- Format: array of arrays of weekday ints (0=Sunday..6=Saturday), index i
-- = session (i+1)'s applicable weekdays. Default matches the historical
-- Flagship/BWA scheme exactly, so existing programs are unaffected.
alter table programming.group_programs
  add column session_days jsonb not null default '[[1,2],[3,4],[5,6]]'::jsonb;
