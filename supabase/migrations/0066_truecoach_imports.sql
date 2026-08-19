-- TrueCoach history import: staging tables + member-driven linking.
--
-- Kova is replacing TrueCoach. Each member's TrueCoach workout log was
-- exported to a text file (141 files, 2025-01-01 → 2026-08-18) and parsed
-- offline by scripts/truecoach_import.py into the two staging tables below.
-- It cannot go straight into programming.logs: logs.exercise_id is NOT NULL
-- and references programming.exercises, and matching a TrueCoach lift name
-- ("DB bench") to a Kova exercise is deliberately the MEMBER's call, never a
-- fuzzy match on her behalf (the exercise-merge duplicate detector flagged 35
-- false pairs out of 83 real exercises before it was made strict). So imports
-- wait here until she links them from her own history screen.
--
-- Two structural facts from the corpus survey that shaped this:
--   * Most of these people do NOT have a core.users row yet (34 rows exist,
--     ~113 clients still arrive via the GHL import-client webhook). user_id is
--     therefore nullable, and a trigger on core.users attaches imports by email
--     the moment the account appears — no re-parse per registration.
--   * A TrueCoach "result" is a multi-line block (41% of 50k blocks), with
--     member commentary in it. The whole block is kept verbatim on every set
--     row (raw_text) — exactly how Kova writes logs.notes, one shared value
--     per exercise-per-day repeated on each set.

-- ---------------------------------------------------------------------------
-- Staging: one row per (person, TrueCoach lift name)
-- ---------------------------------------------------------------------------
create table programming.truecoach_imports (
  id uuid primary key default gen_random_uuid(),
  -- null until the member has a Kova account; attached by trigger below.
  user_id uuid references core.users (id) on delete cascade,
  -- The file's own "Workout Log: <name>" header, verbatim. Files are matched
  -- to people on this line, never on the filename.
  source_name text not null,
  -- Lowercased roster email from the harvest checklist (matched by email at
  -- harvest time). Null for the one client billed under a spouse's account.
  source_email text,
  -- TrueCoach exercise name, verbatim (trimmed). "DB bench" and "Dumbbell
  -- Bench Press" are two rows; the member may link both to one Kova lift.
  lift_name text not null,
  session_count int not null default 0,
  set_count int not null default 0,
  first_date date,
  last_date date,
  -- What the picker shows for the row ("45lbs 3x12"): the last logged
  -- block's structured summary if it parsed, else its raw first line.
  last_summary text,
  -- The one Kova lift this import currently feeds. Singular on purpose: if
  -- one import could link to two lifts its sets would exist twice and inflate
  -- PRs on both. Repointing it is a "move" (unlink + link, see the RPC).
  linked_exercise_id uuid references programming.exercises (id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stable natural key so a re-parse is an upsert that preserves ids (and
  -- therefore preserves links and the logs rows hanging off them).
  unique (source_name, lift_name)
);

create index truecoach_imports_user_idx on programming.truecoach_imports (user_id) where user_id is not null;
create index truecoach_imports_email_idx on programming.truecoach_imports (source_email) where user_id is null;

-- One row per logged set (a "3x10 @ 50" block becomes three rows).
create table programming.truecoach_import_sets (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references programming.truecoach_imports (id) on delete cascade,
  date_performed date not null,
  set_number smallint not null,
  reps int,
  weight numeric,
  -- The full result block as the member typed it, incl. continuation lines
  -- and any trailing comment paragraph. Never dropped even when reps/weight
  -- parsed cleanly — "gassed", "go up next week" is part of the history.
  raw_text text not null,
  -- The coach's prescription from the exercise line ("3x8-12"), for context.
  prescription text,
  -- Which parser rule produced reps/weight ("SxR@W", "R/R/R", "text", ...).
  -- Diagnostics only; lets a future re-parse target the weak shapes.
  parse_shape text,
  unique (import_id, date_performed, set_number)
);

create index truecoach_import_sets_import_idx on programming.truecoach_import_sets (import_id, date_performed, set_number);

alter table programming.truecoach_imports enable row level security;
alter table programming.truecoach_import_sets enable row level security;

-- Staff can read everything (a coach-side view of imported history is free
-- later). Staff do NOT get write here — the only writers are the import
-- script (service role) and the two RPCs below.
create policy "staff read truecoach imports" on programming.truecoach_imports
  for select using (core.is_staff());
create policy "staff read truecoach import sets" on programming.truecoach_import_sets
  for select using (core.is_staff());

-- A member reads her own imports and their sets. No member insert/update/
-- delete at all — linking goes through security-definer RPCs so a member
-- can never edit counts, repoint someone else's import, or write logs rows
-- that don't match the staging data.
create policy "member reads own truecoach imports" on programming.truecoach_imports
  for select using (user_id = auth.uid());
create policy "member reads own truecoach import sets" on programming.truecoach_import_sets
  for select using (
    exists (
      select 1 from programming.truecoach_imports i
      where i.id = import_id and i.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- programming.logs: where a linked import materialises
-- ---------------------------------------------------------------------------
-- ON DELETE CASCADE, deliberately: an import row is the only thing that gives
-- these logs rows meaning. If an import is ever deleted (a re-parse that
-- drops a lift name), its materialised history must go with it rather than
-- become phantom rows nothing can unlink. Rows a member logged in Kova carry
-- NULL here and are never touched by any of this.
alter table programming.logs
  add column truecoach_import_id uuid references programming.truecoach_imports (id) on delete cascade;

create index logs_truecoach_import_idx on programming.logs (truecoach_import_id) where truecoach_import_id is not null;

-- Same one-line widening as 0008 (one_off) and 0010 (group).
alter table programming.logs drop constraint if exists logs_source_check;
alter table programming.logs add constraint logs_source_check
  check (source in ('flagship', 'bwa', 'group', 'spc', 'one_off', 'truecoach'));

-- ---------------------------------------------------------------------------
-- Attach-on-arrival: when a core.users row appears, claim any staged imports
-- carrying that email. Covers import-client, invite-staff and the admin
-- "Link account" flow alike, with nothing to remember in three Edge Functions.
-- ---------------------------------------------------------------------------
create or replace function programming.attach_truecoach_imports_for_user()
returns trigger
language plpgsql
security definer
set search_path = programming, core
as $$
begin
  if new.email is not null then
    update programming.truecoach_imports
       set user_id = new.id, updated_at = now()
     where user_id is null
       and source_email = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists truecoach_attach_on_user_insert on core.users;
create trigger truecoach_attach_on_user_insert
  after insert on core.users
  for each row execute function programming.attach_truecoach_imports_for_user();

-- ---------------------------------------------------------------------------
-- Link / unlink — the only write path for a member onto this data.
-- ---------------------------------------------------------------------------
-- link_truecoach_import(import, exercise):
--   * import must belong to the caller
--   * if it's already linked (to this or another lift) its existing logs rows
--     are deleted first — so re-linking is idempotent and "move to a
--     different lift" is one call, atomic
--   * one logs row per staged set, source 'truecoach', notes = raw_text,
--     no session reference (an import belongs to no Kova session)
-- Returns the number of logs rows written.
create or replace function programming.link_truecoach_import(p_import_id uuid, p_exercise_id uuid)
returns integer
language plpgsql
security definer
set search_path = programming
as $$
declare
  v_user uuid;
  v_count integer;
begin
  select user_id into v_user from programming.truecoach_imports where id = p_import_id;
  if v_user is null or v_user <> auth.uid() then
    raise exception 'not your import' using errcode = '42501';
  end if;
  if not exists (select 1 from programming.exercises where id = p_exercise_id) then
    raise exception 'unknown exercise' using errcode = '23503';
  end if;

  delete from programming.logs where truecoach_import_id = p_import_id;

  insert into programming.logs
    (user_id, exercise_id, date_performed, set_number, reps, weight, notes, source, truecoach_import_id)
  select v_user, p_exercise_id, s.date_performed, s.set_number, s.reps, s.weight, s.raw_text, 'truecoach', p_import_id
    from programming.truecoach_import_sets s
   where s.import_id = p_import_id;
  get diagnostics v_count = row_count;

  update programming.truecoach_imports
     set linked_exercise_id = p_exercise_id, linked_at = now(), updated_at = now()
   where id = p_import_id;

  return v_count;
end;
$$;

-- unlink_truecoach_import(import): removes exactly the rows this import
-- materialised — Kova-logged rows have truecoach_import_id IS NULL, so they
-- cannot be reached by construction. Staging rows are untouched, so the
-- import simply returns to the picker.
create or replace function programming.unlink_truecoach_import(p_import_id uuid)
returns integer
language plpgsql
security definer
set search_path = programming
as $$
declare
  v_user uuid;
  v_count integer;
begin
  select user_id into v_user from programming.truecoach_imports where id = p_import_id;
  if v_user is null or v_user <> auth.uid() then
    raise exception 'not your import' using errcode = '42501';
  end if;

  delete from programming.logs where truecoach_import_id = p_import_id;
  get diagnostics v_count = row_count;

  update programming.truecoach_imports
     set linked_exercise_id = null, linked_at = null, updated_at = now()
   where id = p_import_id;

  return v_count;
end;
$$;

grant execute on function programming.link_truecoach_import(uuid, uuid) to authenticated;
grant execute on function programming.unlink_truecoach_import(uuid) to authenticated;

-- Same Data-API permission dance as every schema-adding migration.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
