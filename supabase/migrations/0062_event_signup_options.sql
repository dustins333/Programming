-- Two fixes from real use of the events composer (2026-08-13).
--
-- 1. A sign-up event used to ALWAYS ask how many guests you're bringing,
--    which bakes "bring a friend day" into a response type that's just as
--    useful for registering people onto a program — where "guests" is
--    nonsense. Now opt-in per event, and defaulted OFF: bring-a-friend is
--    the special case, not the norm.
--
-- 2. A link-out event's button always read "Open". `cta_label` lets the
--    button say what it actually does ("Register", "Order here"). Nullable
--    — null keeps the existing "Open" default, so nothing changes for an
--    event that doesn't set one.
--
-- Deliberately named cta_label rather than link_label: it's the generic
-- "what the button says" field. Only link-out events surface it in the
-- composer today, but nothing about the column stops a sign-up using it
-- later without another migration.

alter table programming.events
  add column if not exists ask_guest_count boolean not null default false;

alter table programming.events
  add column if not exists cta_label text;

-- Needs the usual PostgREST schema-cache nudge — NOTIFY pgrst, 'reload
-- schema'; in the SQL Editor right after running this.
