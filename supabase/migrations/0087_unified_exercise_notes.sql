-- 0087: one note per client per LIFT, shared by every surface that shows it.
--
-- Until now there were two note stores and neither read the other:
--   programming.exercise_coaching_notes — written at the wall display and the
--     coach's live session page, keyed on the RAW exercise_id so it carries
--     into next week, the next block, or any session holding that lift.
--     Members could only READ it, and only as a read-only line.
--   programming.logs.notes             — written in the member's own lift
--     card, copied onto every set row of a single date. Invisible to the
--     board, and pinned to one day so it can never carry forward.
--
-- So a note a coach typed at the TV and a note the client typed on her phone
-- were two different things in two different places, which is exactly what
-- was reported (2026-08-24: Abbi's note on Alicia's Landmine Single Leg RdL
-- never reached Alicia's phone, and Alicia's own bench note never reached the
-- board). This migration makes the coaching-note table the single store: the
-- member writes to it too, and it now covers group and one-off sessions
-- rather than SPC alone.
--
-- logs.notes is deliberately NOT backfilled into here. Linked TrueCoach
-- imports materialise their whole raw result block into logs.notes (0066), so
-- a backfill would bury real coaching notes under years of imported text. Old
-- rows stay where they are and keep rendering as that session's history.

-- ---------------------------------------------------------------------------
-- Which session a note was written in
-- ---------------------------------------------------------------------------
-- spc_workout_id already existed; these two extend the same idea to the other
-- two program types, mirroring session_completions / exercise_completions.
-- Deliberately NOT a three-way exactly-one-of check constraint like those
-- tables have: a note with all three null is meaningful here (a note carried
-- forward, or written outside any session), which is the whole point of
-- keying on exercise_id. All `on delete set null` — the note outlives the
-- programming it was written against.
alter table programming.exercise_coaching_notes
  add column if not exists group_workout_id uuid
    references programming.group_workouts (id) on delete set null,
  add column if not exists one_off_workout_id uuid
    references programming.one_off_workouts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Members write their own notes
-- ---------------------------------------------------------------------------
-- Append-only (insert, no update, no delete) — exactly the shape the wall
-- display already has. "One note per lift per session" is read as "the newest
-- row for that session" rather than enforced by editing in place, because RLS
-- cannot scope an UPDATE policy to a single column.
--
-- author_id is pinned to the caller so a member cannot post a note that
-- appears to have come from her coach.
create policy "member writes own coaching notes" on programming.exercise_coaching_notes
  for insert with check (user_id = auth.uid() and author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Staff gate widened: can_access_spc() -> is_staff()
-- ---------------------------------------------------------------------------
-- This table stopped being an SPC artifact the moment the note became THE
-- note on every program's lift card. A coach with no SPC module still coaches
-- group clients and has to be able to read and answer what they wrote. Same
-- staff-only shape as client_notes / client_limitations (0057).
drop policy if exists "staff manage coaching notes" on programming.exercise_coaching_notes;
create policy "staff manage coaching notes" on programming.exercise_coaching_notes
  for all using (core.is_staff()) with check (core.is_staff());

notify pgrst, 'reload schema';
