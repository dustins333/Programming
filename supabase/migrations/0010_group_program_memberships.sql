-- Coaches are starting to run specialty group programs on top of a
-- client's normal Flagship/BWA training ("Look Like You Lift", a shared
-- conditioning program) — same shared-calendar/shared-content shape as
-- Flagship/BWA (same days for everyone in it, coach-authored sessions),
-- just a client can now be in more than one of these at once. Two changes:
--   1. group_programs.name is no longer locked to exactly
--      ('Flagship', 'Better With Age') — coaches can create new group
--      program types.
--   2. client_program_assignments moves from "one row per client" (a
--      single group_program_id column, enforced via user_id as the
--      primary key) to "one row per (client, program) membership" — a
--      client can now hold multiple concurrent memberships.

alter table programming.group_programs drop constraint if exists group_programs_name_check;

-- A row with a null group_program_id used to mean "this client isn't
-- assigned to anything" under the old one-row-per-client model. Under the
-- new one-row-per-membership model, "not assigned to anything" is simply
-- zero rows for that client, so these placeholder rows no longer carry any
-- meaning and are removed before the column is locked to NOT NULL.
delete from programming.client_program_assignments where group_program_id is null;

alter table programming.client_program_assignments drop constraint if exists client_program_assignments_pkey;
alter table programming.client_program_assignments add column id uuid not null default gen_random_uuid();
alter table programming.client_program_assignments add primary key (id);
alter table programming.client_program_assignments alter column group_program_id set not null;

-- Still at most one membership per (client, program) pair — a client
-- can't join "Flagship" twice, but can hold a Flagship row and a "Look
-- Like You Lift" row simultaneously.
alter table programming.client_program_assignments
  add constraint cpa_user_program_unique unique (user_id, group_program_id);

-- No RLS changes needed — every policy that reads client_program_assignments
-- (group_blocks/group_workouts/group_workout_warmups/group_workout_exercises'
-- member-read policies, all in 0004) uses `exists (select 1 from
-- client_program_assignments cpa where cpa.user_id = auth.uid() and
-- cpa.group_program_id = ...)`, which is already correct for a client
-- matching zero, one, or several rows.

-- logs.source (0004, widened once already by 0008 for one-offs) only
-- special-cases Flagship/BWA by name. A specialty program's name isn't
-- known ahead of time, so it can't get its own source value the way
-- Flagship/BWA do — 'group' is the generic catch-all for any group
-- program that isn't specifically Flagship or BWA. Same unnamed-
-- constraint caveat as 0008: verify via `\d programming.logs` if this
-- DROP silently no-ops on a name mismatch.
alter table programming.logs drop constraint if exists logs_source_check;
alter table programming.logs add constraint logs_source_check check (source in ('flagship', 'bwa', 'group', 'spc', 'one_off'));
