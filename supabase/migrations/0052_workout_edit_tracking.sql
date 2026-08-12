-- Per-coach "you were last here" tracking on sessions.
--
-- The coach-web v2 launchpad opens with the session you were last inside
-- ("PICK UP WHERE YOU LEFT OFF"), and the Group Programs grid marks a cell
-- "Draft · you were here". Both are per-coach, and neither is derivable
-- from anything stored today:
--
--   * group_workouts/spc_workouts already have updated_at, but nothing
--     moves it except setWorkoutStatus/setWorkoutTitle — adding, editing,
--     reordering or deleting a lift leaves it untouched, so a session a
--     coach spent twenty minutes building still reads as last-touched
--     whenever it was created.
--   * There is no record of WHO made an edit at all. group_blocks.created_by
--     is the closest thing and it's the wrong grain (whole block, creation
--     only).
--
-- Both gaps are closed with triggers rather than app-side writes on
-- purpose. The mutating functions (lib/programming/workouts.js and
-- spcWorkouts.js) have ~10 call sites between them and none of them
-- currently receive the editing coach's id — threading it through every one
-- would be churn that a future function could silently forget. A trigger
-- cannot be forgotten, and auth.uid() is exactly the coach doing the edit.
--
-- SECURITY INVOKER (the default), not DEFINER: only staff can write these
-- tables in the first place (0004/0006's "staff manage" policies), and
-- those same policies already permit updating the parent workout row, so
-- the trigger needs no privileges its caller doesn't already have.

alter table programming.group_workouts
  add column if not exists last_edited_by uuid references core.users(id) on delete set null;

alter table programming.spc_workouts
  add column if not exists last_edited_by uuid references core.users(id) on delete set null;

-- --- direct edits to the workout row itself ----------------------------
--
-- setWorkoutStatus/setWorkoutTitle already write updated_at by hand; this
-- makes that unnecessary (harmless if they keep doing it) and adds the
-- editor, which they have no way to supply.

create or replace function programming.stamp_workout_edit()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Coalesce so a service-role/cron write (auth.uid() is null there) leaves
  -- whoever last really edited it in place rather than blanking the field.
  new.last_edited_by := coalesce(auth.uid(), old.last_edited_by);
  return new;
end;
$$;

drop trigger if exists stamp_group_workout_edit on programming.group_workouts;
create trigger stamp_group_workout_edit
  before update on programming.group_workouts
  for each row execute function programming.stamp_workout_edit();

drop trigger if exists stamp_spc_workout_edit on programming.spc_workouts;
create trigger stamp_spc_workout_edit
  before update on programming.spc_workouts
  for each row execute function programming.stamp_workout_edit();

-- --- edits to a session's contents --------------------------------------
--
-- Adding/updating/removing a lift or a warm-up is the edit that actually
-- matters for "where was I", and it never touched the parent row before.
-- The parent UPDATE fires stamp_workout_edit above, so these functions only
-- need to poke the row — they deliberately set updated_at themselves too
-- rather than relying on the BEFORE trigger, so the write is still correct
-- if that trigger is ever dropped.

create or replace function programming.touch_parent_group_workout()
returns trigger
language plpgsql
as $$
begin
  update programming.group_workouts
     set updated_at = now()
   where id = coalesce(new.group_workout_id, old.group_workout_id);
  return coalesce(new, old);
end;
$$;

create or replace function programming.touch_parent_spc_workout()
returns trigger
language plpgsql
as $$
begin
  update programming.spc_workouts
     set updated_at = now()
   where id = coalesce(new.spc_workout_id, old.spc_workout_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_workout_on_exercise on programming.group_workout_exercises;
create trigger touch_workout_on_exercise
  after insert or update or delete on programming.group_workout_exercises
  for each row execute function programming.touch_parent_group_workout();

drop trigger if exists touch_workout_on_warmup on programming.group_workout_warmups;
create trigger touch_workout_on_warmup
  after insert or update or delete on programming.group_workout_warmups
  for each row execute function programming.touch_parent_group_workout();

drop trigger if exists touch_spc_workout_on_exercise on programming.spc_workout_exercises;
create trigger touch_spc_workout_on_exercise
  after insert or update or delete on programming.spc_workout_exercises
  for each row execute function programming.touch_parent_spc_workout();

drop trigger if exists touch_spc_workout_on_warmup on programming.spc_workout_warmups;
create trigger touch_spc_workout_on_warmup
  after insert or update or delete on programming.spc_workout_warmups
  for each row execute function programming.touch_parent_spc_workout();

-- No backfill. last_edited_by starts null everywhere, which reads as "no
-- resume target yet" — correct, since we genuinely don't know who last
-- edited anything before this migration. The first edit after it lands
-- fixes that session for good.
