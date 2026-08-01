-- Design/UX pass: member Today tab becomes a weekly overview (all 3
-- Flagship/BWA sessions + all SPC sessions for the week, each with a coach
-- authored title and a completion checkbox), which needs two new pieces of
-- data that didn't exist before:
--   1. A per-session title/description ("Back & Bis") coaches can set.
--   2. A per-client Flagship/BWA session-frequency target (1x/2x/3x a
--      week), mirroring spc_clients.sessions_per_week which already
--      existed for SPC — group programs only ever had a program-level
--      default (group_programs.sessions_per_week, fixed at 3), never a
--      per-client override.

-- Group: group_workouts already has one row per (block, week, session), so
-- a plain nullable column is enough — no default/override split needed,
-- each week's row is independently editable already.
alter table programming.group_workouts add column title text;

alter table programming.client_program_assignments
  add column sessions_per_week smallint not null default 3 check (sessions_per_week between 1 and 3);

-- SPC: spc_workouts has one row per session_number that recurs across
-- every week of the block (progression lives in spc_exercise_weeks
-- columns, not separate rows) — so a title needs a default-for-the-whole-
-- block column here, plus a separate override table for the "let me edit
-- just week 4's title" case, rather than a single column like group has.
alter table programming.spc_workouts add column title text;

create table programming.spc_workout_week_titles (
  id uuid primary key default gen_random_uuid(),
  spc_workout_id uuid not null references programming.spc_workouts (id) on delete cascade,
  week_number smallint not null,
  title text not null,
  unique (spc_workout_id, week_number)
);

create index swwt_workout_idx on programming.spc_workout_week_titles (spc_workout_id);

-- RLS

alter table programming.spc_workout_week_titles enable row level security;

create policy "staff manage spc_workout_week_titles" on programming.spc_workout_week_titles
  for all using (core.is_staff()) with check (core.is_staff());

create policy "member reads published own spc_workout_week_titles" on programming.spc_workout_week_titles
  for select using (
    exists (
      select 1 from programming.spc_workouts sw
      join programming.spc_blocks sb on sb.id = sw.spc_block_id
      where sw.id = spc_workout_week_titles.spc_workout_id
        and sw.status = 'published'
        and sb.spc_client_id = auth.uid()
    )
  );

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
