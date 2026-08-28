-- Every coach can add to the exercise library; the can_view_exercise_library
-- flag (0015) stops meaning "may touch the library at all" and starts
-- meaning "reviews what everyone else added".
--
-- The problem this solves is a real one for a shared library: gating
-- creation on the flag meant a coach without it had to interrupt a
-- reviewer mid-session just to program a lift that wasn't listed yet. So
-- creation is open to all staff and the new exercise is usable
-- immediately — nothing about a member's view changes, since member RLS
-- on every exercise embed keys on is_active, not on review state. What the
-- flag now buys is a queue: a reviewer sees what came in, tidies the
-- naming/tagging, and approves it out of the queue.
--
-- approved_at null = waiting for review. Deliberately a timestamp rather
-- than a status enum: there are exactly two states, and "when was this
-- signed off" is worth keeping either way.

alter table programming.exercises
  add column approved_at timestamptz,
  add column approved_by uuid references core.users (id);

comment on column programming.exercises.approved_at is
  'Null while the entry is waiting in the library review queue. Pending entries are fully usable in programming — this gates curation, not use.';
comment on column programming.exercises.approved_by is
  'The reviewer who approved it. Null on rows grandfathered in by 0094 (nobody reviewed those) as well as on pending rows — read approved_at, not this, to tell the two apart.';

-- Grandfather the whole existing library in. Without this the queue opens
-- with every exercise ever created sitting in it, which is not a review
-- backlog anyone asked for. approved_by stays null on these on purpose:
-- writing a name there would claim a review that never happened.
update programming.exercises set approved_at = created_at where approved_at is null;

-- The queue's own query, and the badge count behind it.
create index exercises_pending_review_idx
  on programming.exercises (created_at)
  where approved_at is null and is_active;

-- Insert: any staff member. The second clause is what stops a
-- non-reviewer from inserting a row that is already approved — RLS can't
-- restrict WHICH columns a write touches, so the restriction has to be
-- expressed as a condition on the resulting row.
drop policy "staff insert exercises" on programming.exercises;
create policy "staff insert exercises" on programming.exercises
  for insert with check (
    core.is_staff()
    and (approved_at is null or core.can_access_exercise_library())
  );

-- Update: a reviewer may edit anything. Everyone else may edit only their
-- OWN entry, and only while it is still pending — so a coach can fix the
-- name they just fat-fingered, but an approved entry is settled and only a
-- reviewer moves it after that.
--
-- The `approved_at is null` in the WITH CHECK is doing double duty: it
-- keeps a non-reviewer's edit from being the thing that approves the row
-- (the same reason the insert policy has its own clause above).
drop policy "staff update exercises" on programming.exercises;
create policy "staff update exercises" on programming.exercises
  for update
  using (
    core.can_access_exercise_library()
    or (core.is_staff() and created_by = auth.uid() and approved_at is null)
  )
  with check (
    core.can_access_exercise_library()
    or (core.is_staff() and created_by = auth.uid() and approved_at is null)
  );

-- New columns need the same PostgREST schema-cache nudge as new tables —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
