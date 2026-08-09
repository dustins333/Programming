-- Two small fixes from the 2026-08-09 UX overhaul plan:
--
-- (1) Members can read the messaging kill-switch settings. core.settings'
--     only select policy is staff-only (0001), so every member-side gate
--     (FloatingMessageBubble, My Week's header chat icon, /messages) got
--     zero rows from getSetting("messaging_enabled") and fell back to the
--     default `true` — the bubble showed for members even with messaging
--     turned off gym-wide (Terra hit this live as a brand-new client).
--     Narrow whitelist, not a blanket member-read: everything else in
--     core.settings (rates, alert lead times, payroll config) stays
--     staff-only.
create policy "members can read messaging settings" on core.settings
  for select using (key in ('messaging_enabled', 'messaging_audience'));

-- (2) Rest prescription for group workouts. SPC (spc_exercise_weeks.rest),
--     templates (template_exercises.rest), and one-offs
--     (one_off_exercises.rest) all have a rest column — group is the only
--     exercise table without one, which is why members saw rest on some
--     programs and not others. Text, matching the other three.
alter table programming.group_workout_exercises add column rest text;

-- New column + policy need the usual PostgREST schema-cache nudge:
-- NOTIFY pgrst, 'reload schema';
