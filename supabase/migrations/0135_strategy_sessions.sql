-- Strategy sessions: the 3x-a-year sit-down where a coach reviews a client's
-- progress and sets the plan forward. GHL stays the source of truth for the
-- notes themselves (every session's write-up lives on the client's GHL
-- contact, as it always has); these tables are Kova's own record of what it
-- wrote there, plus a cache of the AI summary so a coach's phone isn't
-- waiting on a model call every time a client is opened.
--
-- Keyed on ghl_contact_id, not core.users.id. Everything this feature reads
-- (calendar appointments, notes) arrives from GHL as a contact id, and a
-- handful of people booked on the strategy session calendar have no Kova
-- account (3 of 52 at the time of writing). user_id is carried alongside for
-- the people who do, but nothing depends on it being present.
--
-- Written only by the strategy-session-* Edge Functions under the service
-- role, so there are read policies for staff and no write policies at all.

create table programming.strategy_sessions (
  id uuid primary key default gen_random_uuid(),
  ghl_contact_id text not null,
  user_id uuid references core.users (id) on delete set null,
  -- The day the session happened, in Boise time. Not a timestamp: the
  -- session is a calendar-day thing and "completed within 3 weeks" is
  -- day arithmetic.
  held_on date not null,
  -- The Kova staff member who saved it.
  coach_id uuid references core.users (id) on delete set null,
  notes text not null,
  -- The GHL note this row was written to. Null means the GHL write hasn't
  -- succeeded yet (saving again retries it); set means a later save edits
  -- that same note instead of posting a second copy.
  ghl_note_id text,
  ghl_synced_at timestamptz,
  -- The calendar appointment this session was booked as, when there was
  -- one. Null for a pulled-aside one-off.
  ghl_appointment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One session per client per day. A double-tapped Save, or two coaches
  -- saving the same client, updates the one row rather than creating two
  -- (and so edits the one GHL note rather than posting two).
  unique (ghl_contact_id, held_on)
);

create index strategy_sessions_held_on_idx on programming.strategy_sessions (held_on);

create table programming.strategy_session_summaries (
  ghl_contact_id text primary key,
  user_id uuid references core.users (id) on delete set null,
  -- Hash of the client's GHL notes (ids + text) at the time the summary
  -- was written. When the current notes hash differently, the summary is
  -- stale and gets rebuilt; nothing else invalidates it.
  notes_fingerprint text not null,
  -- The model's output: headline, current goals, ongoing themes,
  -- motivators, things to ask about, and a per-note classification of which
  -- notes are strategy sessions and on what date.
  summary jsonb not null,
  -- Latest strategy session date found in the notes, denormalized so the
  -- "completed recently" list doesn't have to unpack summary jsonb.
  last_session_on date,
  model text,
  generated_at timestamptz not null default now()
);

alter table programming.strategy_sessions enable row level security;
alter table programming.strategy_session_summaries enable row level security;

create policy "staff read strategy sessions"
  on programming.strategy_sessions for select
  using (core.is_staff());

create policy "staff read strategy session summaries"
  on programming.strategy_session_summaries for select
  using (core.is_staff());

grant select on programming.strategy_sessions to authenticated;
grant select on programming.strategy_session_summaries to authenticated;
grant all on programming.strategy_sessions to service_role;
grant all on programming.strategy_session_summaries to service_role;

-- The one GHL calendar strategy sessions are booked on (coaches are team
-- members on it). A setting rather than a constant so a new calendar is a
-- data change, not a deploy.
insert into core.settings (key, value)
values ('strategy_session_calendar_id', '"TimxwPHR08zpKE1EqNRP"'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
