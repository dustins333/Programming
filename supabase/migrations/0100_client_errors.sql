-- Crash reporting for the member/coach app.
--
-- Until components/AppErrorBoundary.js landed, an uncaught render error
-- painted a silent white screen: no message, nothing logged, nothing a member
-- could report beyond "it goes blank". The boundary fixed what the member
-- SEES; this table fixes what the coach KNOWS. With everyone on the installed
-- PWA and the coach rarely standing next to the person who's stuck, a client
-- reporting a blank screen was otherwise undiagnosable remotely.
--
-- Deliberately no coach-facing screen: Terra reads this by asking directly,
-- and a list view is most of the work for least of the value.

create table if not exists programming.client_errors (
  id uuid primary key default gen_random_uuid(),

  -- References auth.users, NOT core.users, on purpose. A member can have an
  -- auth row with no profile row (it's happened — a failed GHL import leaves
  -- exactly that state), and that broken account is precisely the one whose
  -- crash is worth capturing. An FK to core.users would reject the insert at
  -- the moment we most need it.
  --
  -- Defaulted to auth.uid() so the client never supplies it and cannot file a
  -- crash under someone else's name; the insert policy below enforces the same
  -- thing rather than trusting the default.
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- The route path ("/plan", "/nutrition/checkin"). The production bundle
  -- minifies most route components away, so the component stack alone can't
  -- reliably say which screen someone was on — this always survives.
  screen text,
  message text not null,
  component_stack text,

  platform text,
  -- Chrome/Android/iOS version. "Is it her phone?" is the first question asked
  -- about any single-client report, and this answers it without a round trip.
  user_agent text,
  -- The entry bundle filename on web. A member running a stale cached copy is
  -- a real and recurring cause of "it goes blank", and this makes it visible
  -- instead of inferred.
  app_build text,

  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_idx
  on programming.client_errors (created_at desc);
create index if not exists client_errors_user_idx
  on programming.client_errors (user_id, created_at desc);

alter table programming.client_errors enable row level security;

-- Insert is for signed-in callers only. NOT granted to anon: an unauthenticated
-- write is a public endpoint anyone can fill, and this project deliberately has
-- zero anon-writable policies. The cost is that a crash on the login screen
-- before a session exists goes unrecorded — an acceptable trade, since the
-- realistic case is a member already inside the app.
drop policy if exists "own crash reports insert" on programming.client_errors;
create policy "own crash reports insert" on programming.client_errors
  for insert to authenticated
  with check (user_id = auth.uid());

-- No member SELECT policy at all — these rows carry other people's ids,
-- screens and stack traces. Same shape as client_limitations (0057) and
-- session_education (0079): staff-only in every readable direction.
drop policy if exists "staff read crash reports" on programming.client_errors;
create policy "staff read crash reports" on programming.client_errors
  for select to authenticated
  using (core.is_staff());

-- Delete is staff-only housekeeping. There is no update policy for anyone:
-- a crash report is an immutable record of what actually happened.
drop policy if exists "staff clear crash reports" on programming.client_errors;
create policy "staff clear crash reports" on programming.client_errors
  for delete to authenticated
  using (core.is_staff());

-- Custom schemas need table grants explicitly (see 0003) — RLS alone is not
-- enough, and a missing grant fails as "permission denied" long before any
-- policy is consulted.
grant select, insert, delete on programming.client_errors to authenticated;
grant all on programming.client_errors to service_role;
