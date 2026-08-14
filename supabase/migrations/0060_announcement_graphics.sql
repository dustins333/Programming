-- Attach a graphic (a Canva export, in practice) to an announcement, so a
-- gym-wide note can carry the poster rather than being a text box. Shown in
-- the in-app popup (components/AnnouncementModal.js) and as a thumbnail in
-- the compose page's History list.
--
-- The image itself is NOT in the push notification banner — that needs an
-- iOS Notification Service Extension, i.e. a native module and a new build.
-- Push stays text; the graphic shows when the app opens.

alter table programming.announcements
  add column if not exists image_path text;

-- --------------------------------------------------------------------
-- `graphics` storage bucket
-- --------------------------------------------------------------------
-- Created here rather than by hand in the dashboard so a fresh setup of
-- this project doesn't silently miss it (same reasoning as every other
-- grant/policy living in a migration).
--
-- PUBLIC, unlike nutrition's `photos` bucket. A graphic is a poster meant
-- for everyone in the gym, not client data; signed URLs expire out from
-- under a card that stays on screen; and a public URL is the only kind that
-- could ever be embedded in a push notification later. The tradeoff is that
-- the URL is fetchable by anyone holding it, so nothing client-specific may
-- ever be written here — see lib/media/graphics.js's header.
insert into storage.buckets (id, name, public)
values ('graphics', 'graphics', true)
on conflict (id) do nothing;

-- Reads on a public bucket are served straight from
-- /storage/v1/object/public/... and bypass RLS entirely, so this select
-- policy isn't what makes the graphic visible — it's here so authenticated
-- listing/metadata calls behave sanely too.
drop policy if exists "graphics are publicly readable" on storage.objects;
create policy "graphics are publicly readable" on storage.objects
  for select using (bucket_id = 'graphics');

-- Writes are admin-only, matching who can compose an announcement or an
-- event in the first place (0024's "admin manage announcements").
drop policy if exists "admin uploads graphics" on storage.objects;
create policy "admin uploads graphics" on storage.objects
  for insert with check (bucket_id = 'graphics' and core.is_admin());

drop policy if exists "admin updates graphics" on storage.objects;
create policy "admin updates graphics" on storage.objects
  for update using (bucket_id = 'graphics' and core.is_admin());

drop policy if exists "admin deletes graphics" on storage.objects;
create policy "admin deletes graphics" on storage.objects
  for delete using (bucket_id = 'graphics' and core.is_admin());

-- Needs the usual PostgREST schema-cache nudge — NOTIFY pgrst, 'reload
-- schema'; in the SQL Editor right after running this.
