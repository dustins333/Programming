-- 0131 — a member can read a queued SPC program the week before it starts.
--
-- 0102 gated the three member read policies on the SPC content tables at
-- `block_start_date <= today (Boise)`, so a program a coach had published for
-- next Monday was genuinely invisible until Monday. That was right for her
-- normal screens and it blocks exactly one thing: the "Preview next program"
-- look-ahead on My Week, which Terra wants offered for the whole final week of
-- the program that's ending (lib/programming/nextBlockPreview.js).
--
-- So the gate moves by exactly seven days: `block_start_date <= today + 7`.
-- Nothing else changes — still her own program, still status 'active', still
-- published sessions only, and still no end-date gate (a lapsed run stays
-- visible, 0102's deliberate choice).
--
-- Why this can't surface an upcoming program anywhere it shouldn't: every
-- member-side SPC read resolves a program through getCurrentSpcBlock(), which
-- filters on `block_start_date <= today` itself, and spc_blocks' own member
-- policy (0089) already had no date gate. The policy was the backstop; the
-- app was always the thing choosing which program to show.
--
-- Rollback: re-run the three policies with `+ 7` removed.

drop policy if exists "member reads published own spc_workouts" on programming.spc_workouts;
create policy "member reads published own spc_workouts" on programming.spc_workouts
  for select using (
    status = 'published'
    and exists (
      select 1 from programming.spc_blocks sb
      where sb.id = spc_workouts.spc_block_id
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
        and sb.block_start_date <= (now() at time zone 'America/Boise')::date + 7
    )
  );

drop policy if exists "member reads published own spc_workout_exercises" on programming.spc_workout_exercises;
create policy "member reads published own spc_workout_exercises" on programming.spc_workout_exercises
  for select using (
    exists (
      select 1
      from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_exercises.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
        and sb.block_start_date <= (now() at time zone 'America/Boise')::date + 7
    )
  );

drop policy if exists "member reads published own spc_workout_warmups" on programming.spc_workout_warmups;
create policy "member reads published own spc_workout_warmups" on programming.spc_workout_warmups
  for select using (
    exists (
      select 1
      from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_warmups.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
        and sb.status = 'active'
        and sb.block_start_date <= (now() at time zone 'America/Boise')::date + 7
    )
  );

notify pgrst, 'reload schema';
