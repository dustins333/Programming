-- Coach account-level module permissions: an admin can turn off a given
-- coach's access to SPC / Nutrition / the Exercise Library, per explicit
-- ask — some coaches don't need all three. This is account-level, not
-- per-client scoping (core.is_staff()'s "all coaches see all clients"
-- design, per 0001's comment, is unchanged and untouched by this
-- migration) — a coach either has a whole module or doesn't.
--
-- Default true on all three so every existing coach's access is unchanged
-- until an admin explicitly flips one off — same "unset = always-on"
-- convention 0013's NOTIFICATION_TOGGLES already established.

alter table core.users add column can_view_spc boolean not null default true;
alter table core.users add column can_view_nutrition boolean not null default true;
alter table core.users add column can_view_exercise_library boolean not null default true;

-- One function per module, each encapsulating "admin always passes, coach
-- passes only if their own flag is on" — so call sites in policies below
-- read as a single check rather than repeating the admin-bypass logic
-- everywhere. Security-definer for the same reason as is_staff()/is_admin()
-- (RLS-protected table, can't self-reference from inside a policy without
-- recursing).
create function core.can_access_spc()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select core.is_admin() or exists (
    select 1 from core.users where id = auth.uid() and role = 'coach' and can_view_spc
  );
$$;

create function core.can_access_nutrition()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select core.is_admin() or exists (
    select 1 from core.users where id = auth.uid() and role = 'coach' and can_view_nutrition
  );
$$;

create function core.can_access_exercise_library()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select core.is_admin() or exists (
    select 1 from core.users where id = auth.uid() and role = 'coach' and can_view_exercise_library
  );
$$;

-- SPC (0006) — replace every "staff manage" policy's is_staff() check with
-- can_access_spc(). Member-facing "reads own published ..." policies are
-- untouched; a member's own data access was never staff-gated.
drop policy "staff manage spc_clients" on programming.spc_clients;
create policy "staff manage spc_clients" on programming.spc_clients
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage spc_blocks" on programming.spc_blocks;
create policy "staff manage spc_blocks" on programming.spc_blocks
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage spc_workouts" on programming.spc_workouts;
create policy "staff manage spc_workouts" on programming.spc_workouts
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage spc_workout_warmups" on programming.spc_workout_warmups;
create policy "staff manage spc_workout_warmups" on programming.spc_workout_warmups
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage spc_workout_exercises" on programming.spc_workout_exercises;
create policy "staff manage spc_workout_exercises" on programming.spc_workout_exercises
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage spc_exercise_weeks" on programming.spc_exercise_weeks;
create policy "staff manage spc_exercise_weeks" on programming.spc_exercise_weeks
  for all using (core.can_access_spc()) with check (core.can_access_spc());

-- SPC per-week title overrides (0009).
drop policy "staff manage spc_workout_week_titles" on programming.spc_workout_week_titles;
create policy "staff manage spc_workout_week_titles" on programming.spc_workout_week_titles
  for all using (core.can_access_spc()) with check (core.can_access_spc());

-- Templates (0008) — management entry point lives under the SPC nav
-- section (per the Templates feature's own build notes: "templates apply
-- to any client, but the management entry point lives under SPC"), so
-- gating these on SPC access matches where a coach would actually reach
-- them from. one_off_workouts/warmups/exercises are deliberately NOT
-- gated here — those are reached from a client's own detail page
-- regardless of program, not from the SPC section.
drop policy "staff manage workout_templates" on programming.workout_templates;
create policy "staff manage workout_templates" on programming.workout_templates
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage template_warmups" on programming.template_warmups;
create policy "staff manage template_warmups" on programming.template_warmups
  for all using (core.can_access_spc()) with check (core.can_access_spc());

drop policy "staff manage template_exercises" on programming.template_exercises;
create policy "staff manage template_exercises" on programming.template_exercises
  for all using (core.can_access_spc()) with check (core.can_access_spc());

-- Nutrition (0005) — same replacement across every staff policy.
drop policy "staff manage nutrition_clients" on nutrition.nutrition_clients;
create policy "staff manage nutrition_clients" on nutrition.nutrition_clients
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

drop policy "staff manage targets" on nutrition.targets;
create policy "staff manage targets" on nutrition.targets
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

drop policy "staff manage daily_logs" on nutrition.daily_logs;
create policy "staff manage daily_logs" on nutrition.daily_logs
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

drop policy "staff manage checkin_template_questions" on nutrition.checkin_template_questions;
create policy "staff manage checkin_template_questions" on nutrition.checkin_template_questions
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

drop policy "staff manage client_checkin_questions" on nutrition.client_checkin_questions;
create policy "staff manage client_checkin_questions" on nutrition.client_checkin_questions
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

drop policy "staff manage checkin_responses" on nutrition.checkin_responses;
create policy "staff manage checkin_responses" on nutrition.checkin_responses
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

-- Exercise Library (0004) — only the write policies are gated. SELECT
-- ("staff read all exercises") stays on plain is_staff(): every builder
-- (group/SPC/templates, native+web) reads the exercise list to build
-- workouts regardless of whether that coach manages the library itself,
-- so gating reads would break workout building for a coach with this
-- toggle off. The toggle is about curating the library, not using it.
drop policy "staff insert exercises" on programming.exercises;
create policy "staff insert exercises" on programming.exercises
  for insert with check (core.can_access_exercise_library());

drop policy "staff update exercises" on programming.exercises;
create policy "staff update exercises" on programming.exercises
  for update using (core.can_access_exercise_library()) with check (core.can_access_exercise_library());

-- New columns need the same PostgREST schema-cache nudge as new tables —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
