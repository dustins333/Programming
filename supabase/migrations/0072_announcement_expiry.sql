-- Announcements had no end date. Once one was sent it kept popping for every
-- member who hadn't personally dismissed it, forever — and greeted anyone who
-- joined later as though it were brand new. Two test messages from Aug 6 were
-- still firing at a member two weeks on, which is how this was found.
--
-- expires_at is nullable and defaults to null, meaning "never expires", so
-- every announcement that already exists behaves exactly as it does today.
-- Only newly composed ones start carrying an expiry.

alter table programming.announcements
  add column if not exists expires_at timestamptz;

-- The member read policy is where this has to bite. Filtering in the app
-- would leave an expired announcement readable to anyone querying directly;
-- doing it here means it genuinely stops existing for members, the same way
-- an unsent one already does.
--
-- Recreated with the original shape: permissive, for select, to public (the
-- table's only other policy is admin-manage, which is unaffected).
drop policy if exists "members read due announcements" on programming.announcements;
create policy "members read due announcements" on programming.announcements
  for select using (
    send_at <= now()
    and (expires_at is null or expires_at > now())
  );
