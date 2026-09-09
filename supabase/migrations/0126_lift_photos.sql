-- A photo a member attaches to a lift in her own history. Taken from the
-- camera icon in the notes field on the logging card, viewed from the camera
-- icon on a row of that lift's history.
--
-- Requested because TrueCoach had one and members asked for it back. Scoped
-- deliberately to HER OWN RECORD: the whiteboard, how the machine was set,
-- a PR moment. Confirmed with Terra that coaches do not need to see these,
-- which is why there is no staff policy anywhere below -- not hidden in the
-- UI, genuinely unreadable by anyone but the member. If coach visibility is
-- ever wanted that is a deliberate migration, not a query change.
--
-- Photos only, no video. Video was considered and explicitly held back: at
-- this gym's ~200 finalized sessions a week it is roughly 20 GB a year
-- against about 1 GB for photos, and it turns into a different feature
-- (someone has to watch them). The bucket caps below are what actually
-- enforce that rather than leaving it to intent.

/* ---------------------------------------------------------------- table */

-- Keyed (user, exercise, date) -- exactly how programming.logs is keyed, and
-- exactly how the shared per-lift note already behaves (one value per
-- exercise per day). That is what makes the photo land on the same history
-- row as the sets it belongs to.
--
-- NOT a column on programming.logs, for two reasons: a photo is not per-set,
-- and logs_unique_set_idx is a nine-column unique index that logResult's
-- insert path used to name explicitly -- widening it took production down
-- once already (see 0112's header).
--
-- No unique constraint on purpose. Allowing several photos on one lift on one
-- day is strictly simpler than enforcing one: nothing has to upsert, and
-- there is no "you already have a photo, replace it?" flow to build or for a
-- member to get stuck in.
create table programming.lift_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  exercise_id uuid not null references programming.exercises (id) on delete cascade,
  -- Boise-local, same as logs.date_performed. Never a timestamptz: this is
  -- "which training day does this belong to", and a UTC instant reads as the
  -- next day for anything captured in the Boise evening.
  date_performed date not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- The one read this feature ever does: every photo for one member on one
-- lift, newest first.
create index lift_photos_user_exercise_idx
  on programming.lift_photos (user_id, exercise_id, date_performed desc);

alter table programming.lift_photos enable row level security;

-- Owner only, in every direction. There is deliberately no staff policy --
-- see the header. A coach cannot select, insert, update or delete these.
create policy "member manages own lift photos" on programming.lift_photos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

/* --------------------------------------------------------------- bucket */

-- Its own bucket, NOT the existing `photos` bucket, and this is the load
-- bearing reason: `photos` carries a policy called "coach can manage photo
-- files" granting is_coach() ALL on everything in it. Putting lift photos
-- there would hand every coach read access to the exact thing Terra said
-- they should not see, and carving a path-prefix exception out of an
-- existing ALL policy is far more fragile than a separate bucket.
--
-- A fresh bucket also gets the caps the `photos` bucket never had: that one
-- is still nullable on both size and mime type, so a 200 MB file can be
-- pushed through the progress-photo flow today. Here the two together are
-- what make "photos, not video" a fact rather than an intention.
--
-- 5 MB against an observed average of 368 KB for an already-compressed
-- progress photo: generous headroom for a less-compressed shot, nowhere near
-- enough for a clip. The picker re-encodes to JPEG on every platform
-- (lib/imagePicker.js forces SaveFormat.JPEG), so image/jpeg is what
-- actually arrives; png and webp are allowed only so a future picker change
-- cannot fail at the bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lift-photos', 'lift-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Same shape as the existing "client can manage own photo files" policy:
-- the first path segment is the owner's id, so a member reaches her own
-- folder and nothing else. An anon caller has a null auth.uid(), and
-- `something = null` is null rather than true, so this excludes them without
-- needing a separate guard.
create policy "member manages own lift photo files" on storage.objects
  for all
  using (bucket_id = 'lift-photos' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'lift-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

/* ------------------------------------------------- merge, without a leak */

-- Merging two duplicate exercises repoints every reference off the retired
-- entry and then archives it (lib/programming/exerciseMerge.js). That runs as
-- a COACH, and the policy above means a coach's UPDATE on this table matches
-- zero rows -- which returns no error. Without this function a merge would
-- silently leave a member's photo attached to the archived half while her
-- sets moved to the survivor, and the photo would just stop appearing in her
-- history with nothing anywhere to say why.
--
-- Deliberately a narrow definer function rather than a staff UPDATE policy,
-- because RLS cannot restrict WHICH COLUMN a write touches -- the same reason
-- core.update_own_notification_prefs and programming.mark_own_thread_read
-- exist. This can only ever change exercise_id, and grants no read access.
--
-- It is also why lift_photos is deliberately NOT added to exerciseMerge's
-- REFERENCE_TABLES list: that list is used for usage counts as well as the
-- repoint, and both would silently read zero under the owner-only policy.
create or replace function programming.repoint_lift_photos(from_exercise uuid, to_exercise uuid)
returns integer
language plpgsql
security definer
set search_path = programming, core, public
as $$
declare
  moved integer;
begin
  if not core.can_access_exercise_library() then
    raise exception 'Not authorised to merge exercises';
  end if;

  update programming.lift_photos
     set exercise_id = to_exercise
   where exercise_id = from_exercise;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function programming.repoint_lift_photos(uuid, uuid) from public;
grant execute on function programming.repoint_lift_photos(uuid, uuid) to authenticated, service_role;

-- Rollback:
--   drop function if exists programming.repoint_lift_photos(uuid, uuid);
--   drop policy if exists "member manages own lift photo files" on storage.objects;
--   -- delete the bucket's files through the Storage API first; `supabase
--   -- storage rm` reports success and deletes nothing, and a direct delete
--   -- from storage.objects raises 42501 from a protection trigger.
--   delete from storage.buckets where id = 'lift-photos';
--   drop table if exists programming.lift_photos;
