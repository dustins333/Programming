-- Recording the check-in call a client books, so the roster can say so.
--
-- The problem: a client picks "Zoom" on her weekly check-in, books a slot,
-- and then sits in "Awaiting coach check-in" looking exactly like a client
-- who has left her coach hanging. Nothing on the roster distinguishes
-- "she is waiting on you" from "you two have a call on Thursday at 9:30".
--
-- The reason nothing could: book-checkin-session creates a real appointment
-- on a GoHighLevel calendar (the actual Zoom call is run manually at that
-- time -- GHL owns the slot, not Zoom) and returned {booked:true} without
-- writing a single row here. The day and time existed only inside GHL, so
-- there was nothing for the roster to read.
--
-- This is the mirror. One row per appointment Kova books, written
-- server-side by book-checkin-session under the service role immediately
-- after GHL confirms.
--
-- Kova-owned, so programming.* rather than public.* -- same reasoning as
-- nutrition_checkin_reopens (0028) and nutrition_checkin_closeouts (0111):
-- the standalone Nutrition Tracker app shares public.* and has no concept
-- of this, and inventing a column over there would surface in that app.
--
-- KNOWN LIMIT, deliberately accepted: GHL remains the source of truth for
-- the appointment itself. A call rescheduled or cancelled from inside GHL
-- does not update this table, so the pill can go stale. Reconciling would
-- mean reading each coach's calendar (calendars are per-coach since 0077)
-- on every roster load, which is a new API dependency and real latency on
-- a screen that opens constantly. Mirroring covers the case that actually
-- prompted this -- a client booking through the app -- and ghl_appointment_id
-- is stored precisely so a future reconciliation pass has something to
-- match on.
create table programming.nutrition_checkin_bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  -- The instant the call starts. Everything the UI shows -- which day, what
  -- time, whether it is still upcoming -- is derived from this in Boise
  -- time; nothing about the calendar week is stored, so a call booked for
  -- next week is still just a row with a later starts_at.
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- GHL's own ids for the appointment and the calendar it landed on.
  -- Nullable because a booking must never be lost just because GHL's
  -- response shape surprised us -- the appointment already exists at that
  -- point, and a row with a real starts_at and no id is still worth having.
  -- Unique so a retry that reaches GHL twice cannot leave two rows for one
  -- appointment (Postgres treats nulls as distinct, so id-less rows are
  -- unaffected by this).
  ghl_appointment_id text unique,
  ghl_calendar_id text,
  created_at timestamptz not null default now()
);

-- The roster reads "the next booking from today onward" for a batch of
-- clients, which is exactly this index's shape.
create index nutrition_checkin_bookings_user_starts_idx
  on programming.nutrition_checkin_bookings (user_id, starts_at);

alter table programming.nutrition_checkin_bookings enable row level security;

create policy "staff manage nutrition_checkin_bookings" on programming.nutrition_checkin_bookings
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

-- Unlike the close-outs and week phases this sits next to, a booking is not
-- coach bookkeeping ABOUT a client -- it is the client's own appointment,
-- one she made herself. Read-only for her: writes stay server-side under
-- the service role, so she cannot invent an appointment that does not exist
-- on anyone's calendar. Nothing member-facing renders it yet; this is what
-- lets her own Check-In tab show "your call is Thursday at 9:30" without a
-- second migration.
create policy "members read own nutrition_checkin_bookings" on programming.nutrition_checkin_bookings
  for select using (auth.uid() = user_id);

-- Same Data-API permission dance as every table-adding migration before
-- this one -- GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New table needs the usual PostgREST schema-cache nudge --
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
