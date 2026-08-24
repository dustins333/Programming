-- "How do I ...?" videos for members — a short library of screen recordings
-- (how to log a session, how to match your TrueCoach history) reached from
-- the Help card in member Settings.
--
-- Coach education (0079-0081) also carries videos, but those are external
-- URLs a coach pastes, and they hang off one session of one block. These are
-- gym-wide, member-facing, and Terra uploads the files themselves — so they
-- get their own table and their own bucket rather than being bent into
-- session_education.video_urls.

create table if not exists programming.help_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null,
  mime_type text,
  -- Explicit order rather than created_at: the list is a curriculum ("start
  -- here" first), not a feed.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references core.users(id) on delete set null
);

create index if not exists help_videos_position_idx
  on programming.help_videos (position, created_at);

alter table programming.help_videos enable row level security;

-- Readable by everyone signed in, staff and member alike. There is nothing
-- client-specific here and a coach needs to see exactly what a member sees.
drop policy if exists "everyone reads help videos" on programming.help_videos;
create policy "everyone reads help videos" on programming.help_videos
  for select to authenticated using (true);

-- Admin-only to manage, matching announcements/events rather than the
-- can_view_* module toggles: this is gym-wide published content.
drop policy if exists "admin manages help videos" on programming.help_videos;
create policy "admin manages help videos" on programming.help_videos
  for all to authenticated using (core.is_admin()) with check (core.is_admin());

-- Explicit, even though 0003 set default privileges on this schema — the
-- same defensive repeat 0004 does. A missing grant here fails as a 403 that
-- looks nothing like a missing grant.
grant select, insert, update, delete on programming.help_videos to authenticated;

-- --------------------------------------------------------------------
-- `help-videos` storage bucket
-- --------------------------------------------------------------------
-- PUBLIC, same reasoning as `graphics` (0060): a how-to video is published
-- to the whole gym, not client data, and a signed URL that expires mid-play
-- is a worse failure than a guessable URL. Nothing client-specific may ever
-- be written here.
--
-- 60MB cap against real files of 4.8-10.2MB — headroom for a longer clip
-- without leaving the door open to an unedited multi-gigabyte upload.
-- quicktime is allowed so an iPhone .mov doesn't fail with an opaque storage
-- error; the admin screen warns that non-MP4 may not play in every browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('help-videos', 'help-videos', true, 62914560,
        array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

drop policy if exists "help videos are publicly readable" on storage.objects;
create policy "help videos are publicly readable" on storage.objects
  for select using (bucket_id = 'help-videos');

drop policy if exists "admin uploads help videos" on storage.objects;
create policy "admin uploads help videos" on storage.objects
  for insert with check (bucket_id = 'help-videos' and core.is_admin());

drop policy if exists "admin updates help videos" on storage.objects;
create policy "admin updates help videos" on storage.objects
  for update using (bucket_id = 'help-videos' and core.is_admin());

drop policy if exists "admin deletes help videos" on storage.objects;
create policy "admin deletes help videos" on storage.objects
  for delete using (bucket_id = 'help-videos' and core.is_admin());

-- New table — PostgREST needs the usual nudge:
-- NOTIFY pgrst, 'reload schema';
--
-- TO ROLL BACK:
--   drop table if exists programming.help_videos;
--   delete from storage.objects where bucket_id = 'help-videos';
--   delete from storage.buckets where id = 'help-videos';
--   drop policy if exists "help videos are publicly readable" on storage.objects;
--   drop policy if exists "admin uploads help videos" on storage.objects;
--   drop policy if exists "admin updates help videos" on storage.objects;
--   drop policy if exists "admin deletes help videos" on storage.objects;
