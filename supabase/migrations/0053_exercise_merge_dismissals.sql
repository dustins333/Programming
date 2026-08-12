-- "These two are not duplicates" — pairs a coach has deliberately kept
-- separate (design_handoff_coach_web_v2, 1o, and README data note 4).
--
-- The duplicate detector on the Merge Exercises page matches on name
-- similarity alone, which means it will always surface pairs that are
-- genuinely different lifts (Standing Calf Raise / Seated Calf Raise being
-- the canonical example). Without somewhere to record the decision, the
-- coach re-reads and re-rejects the same suggestion every time they open
-- the page, and there's nothing to tell them they already decided.
--
-- Deliberately reversible: the page lists dismissed pairs at the bottom
-- with an Undo, so "these are different" is a visible decision rather than
-- something that silently vanished.

create table if not exists programming.exercise_merge_dismissals (
  id uuid primary key default gen_random_uuid(),
  -- Stored in a canonical order (lower uuid first, enforced by the CHECK
  -- plus the unique index) so a pair can't be dismissed twice by being
  -- named the other way round.
  exercise_a_id uuid not null references programming.exercises(id) on delete cascade,
  exercise_b_id uuid not null references programming.exercises(id) on delete cascade,
  dismissed_by uuid references core.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  constraint exercise_merge_dismissals_ordered check (exercise_a_id < exercise_b_id)
);

create unique index if not exists exercise_merge_dismissals_pair_idx
  on programming.exercise_merge_dismissals (exercise_a_id, exercise_b_id);

alter table programming.exercise_merge_dismissals enable row level security;

-- Same gate as managing the library itself (0015): a coach who can't edit
-- exercises has no business deciding which of them are the same lift.
-- Read is open to all staff, because the merge page is where the decision
-- is visible and a coach should be able to see what was already decided.
drop policy if exists "staff read merge dismissals" on programming.exercise_merge_dismissals;
create policy "staff read merge dismissals"
  on programming.exercise_merge_dismissals for select
  using (core.is_staff());

drop policy if exists "library managers write merge dismissals" on programming.exercise_merge_dismissals;
create policy "library managers write merge dismissals"
  on programming.exercise_merge_dismissals for all
  using (core.can_access_exercise_library())
  with check (core.can_access_exercise_library());

grant select, insert, update, delete on programming.exercise_merge_dismissals to authenticated;
grant all on programming.exercise_merge_dismissals to service_role;
