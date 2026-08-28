-- The in-app popup and the push notification become separate choices.
--
-- Until now an announcement always did both: creating the row made it pop up
-- next time the member opened the app, AND buzzed their phone. There was one
-- checkbox for the pair, so "just leave them a note" and "just text them"
-- were both unreachable.
--
-- Both columns default true, so every existing row keeps doing exactly what
-- it does today and there is nothing to backfill.
--
-- show_in_app is enforced in RLS, not just filtered client-side: a push-only
-- announcement must genuinely not be readable as a popup, or the member app
-- would show it anyway the moment a query forgot the filter.
--
-- send_push has no RLS equivalent — nothing about it is member-readable. It
-- is honoured in scan-announcements' query (so a push-only-off row is never
-- even fetched, and therefore never loops on pushed_at staying null) and
-- again inside _shared/announcementAudience.ts's sendAnnouncementPush, which
-- is the single choke point every push path goes through.

alter table programming.announcements
  add column if not exists show_in_app boolean not null default true,
  add column if not exists send_push boolean not null default true;

comment on column programming.announcements.show_in_app is
  'Whether members see this as an in-app popup. Enforced in the member read policy, so false genuinely hides it rather than relying on a client filter.';
comment on column programming.announcements.send_push is
  'Whether this fires a real push notification. Honoured by scan-announcements and by sendAnnouncementPush.';

drop policy if exists "members read due announcements" on programming.announcements;
create policy "members read due announcements" on programming.announcements
  for select using (
    auth.uid() is not null
    and show_in_app
    and send_at <= now()
    and (expires_at is null or expires_at > now())
  );

notify pgrst, 'reload schema';
