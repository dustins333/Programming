-- One-tap "refresh now" button on the in-app announcement popup — for a
-- functional/code update (e.g. the check-in rework), an admin can flag an
-- announcement so its popup shows a real "Refresh now" button
-- (window.location.reload(), web-only) instead of just "Got it". See
-- components/AnnouncementModal.js / app/(coach)/announcements/index.js.
alter table programming.announcements
  add column requires_reload boolean not null default false;

-- Needs the usual PostgREST schema-cache nudge — NOTIFY pgrst, 'reload
-- schema'; in the SQL Editor right after running this.
