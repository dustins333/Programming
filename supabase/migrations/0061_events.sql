-- Gym events — "bring a friend day", "N101 registration is open", "put in
-- your supplement order". Admin-composed (same blast-radius reasoning as
-- announcements in 0024), shown to members on their own Events tab.
--
-- THE TAB HAS NO ON/OFF SWITCH. It appears exactly when this table holds a
-- live event for that member and disappears when the last one closes, so
-- `closes_at` below is load-bearing: it is both the response deadline and
-- the auto-hide mechanism. Unpublishing (status back to 'draft') is the
-- emergency brake for taking something down before its date.
--
-- NOTE ON ORDERING: policies on the child tables reference
-- programming.events in an EXISTS subquery, and Postgres resolves those
-- table references at CREATE POLICY time — so events must be fully defined
-- before any of them. Migration 0036 failed in production for exactly this
-- reason; do not reorder this file.

-- --------------------------------------------------------------------
-- events
-- --------------------------------------------------------------------
create table if not exists programming.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_path text,

  -- The day the thing happens, for display only ("Saturday, Aug 30"). An
  -- order window has none, which is why this is nullable and separate from
  -- closes_at.
  event_date date,

  -- Responses stop being accepted, AND the event drops off the member's
  -- tab. One field, two jobs, deliberately.
  closes_at timestamptz not null,

  location text,

  -- Same audience shape as programming.announcements (0024). Resolved
  -- client-side in lib/programming/audience.js — RLS below only gates on
  -- status and time, never on audience.
  target_type text not null default 'all' check (target_type in ('all', 'group_program', 'spc', 'nutrition')),
  target_group_program_id uuid references programming.group_programs (id) on delete cascade,

  response_type text not null default 'none' check (response_type in ('none', 'signup', 'order', 'link')),
  link_url text,

  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  -- Set when an accompanying announcement has gone out, so "Also announce
  -- this" can't double-send on a re-publish.
  pushed_at timestamptz,

  created_by uuid references core.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_live_idx on programming.events (status, closes_at);

alter table programming.events enable row level security;

drop policy if exists "admin manage events" on programming.events;
create policy "admin manage events" on programming.events
  for all using (core.is_admin()) with check (core.is_admin());

drop policy if exists "members read live events" on programming.events;
create policy "members read live events" on programming.events
  for select using (status = 'published' and closes_at > now());

-- --------------------------------------------------------------------
-- event_items — the order list (supplements, merch)
-- --------------------------------------------------------------------
-- `options` is a plain array of strings: ["S","M","L"] or
-- ["Vanilla","Chocolate"]. Empty means the item has no variants. No price
-- column on purpose — no money changes hands in the app, and showing prices
-- would make this read as a storefront at App Review time.
create table if not exists programming.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references programming.events (id) on delete cascade,
  name text not null,
  description text,
  options jsonb not null default '[]'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_items_event_idx on programming.event_items (event_id, position);

alter table programming.event_items enable row level security;

drop policy if exists "admin manage event items" on programming.event_items;
create policy "admin manage event items" on programming.event_items
  for all using (core.is_admin()) with check (core.is_admin());

drop policy if exists "members read live event items" on programming.event_items;
create policy "members read live event items" on programming.event_items
  for select using (
    exists (
      select 1 from programming.events e
      where e.id = event_items.event_id and e.status = 'published' and e.closes_at > now()
    )
  );

-- --------------------------------------------------------------------
-- event_questions — optional extra questions on a signup/order
-- --------------------------------------------------------------------
-- Same column shape as public.client_checkin_questions after 0042, so
-- components/nutrition/QuestionListEditor.js can edit these unchanged.
create table if not exists programming.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references programming.events (id) on delete cascade,
  question_text text not null,
  question_type text not null default 'text' check (question_type in ('text', 'single_choice')),
  options jsonb not null default '[]'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_questions_event_idx on programming.event_questions (event_id, position);

alter table programming.event_questions enable row level security;

drop policy if exists "admin manage event questions" on programming.event_questions;
create policy "admin manage event questions" on programming.event_questions
  for all using (core.is_admin()) with check (core.is_admin());

drop policy if exists "members read live event questions" on programming.event_questions;
create policy "members read live event questions" on programming.event_questions
  for select using (
    exists (
      select 1 from programming.events e
      where e.id = event_questions.event_id and e.status = 'published' and e.closes_at > now()
    )
  );

-- --------------------------------------------------------------------
-- event_responses — one row per member per event
-- --------------------------------------------------------------------
create table if not exists programming.event_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references programming.events (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,
  -- signup events: "and how many guests". Null for order/link events.
  guest_count smallint check (guest_count is null or guest_count >= 0),
  -- answers to event_questions, [{question, answer}], same shape as
  -- public.checkin_responses.answers.
  answers jsonb not null default '[]'::jsonb,
  note text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_responses_event_idx on programming.event_responses (event_id);

alter table programming.event_responses enable row level security;

-- A member reads their own response for as long as it exists; writing is
-- additionally gated on the event still being open, so a closed order
-- window genuinely can't be edited from a stale screen.
drop policy if exists "member reads own event response" on programming.event_responses;
create policy "member reads own event response" on programming.event_responses
  for select using (user_id = auth.uid());

drop policy if exists "member creates own event response" on programming.event_responses;
create policy "member creates own event response" on programming.event_responses
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from programming.events e
      where e.id = event_responses.event_id and e.status = 'published' and e.closes_at > now()
    )
  );

drop policy if exists "member updates own event response" on programming.event_responses;
create policy "member updates own event response" on programming.event_responses
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from programming.events e
      where e.id = event_responses.event_id and e.status = 'published' and e.closes_at > now()
    )
  );

-- Cancelling a signup is a delete, which is why this table has one where
-- announcement_acknowledgments deliberately doesn't.
drop policy if exists "member deletes own event response" on programming.event_responses;
create policy "member deletes own event response" on programming.event_responses
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from programming.events e
      where e.id = event_responses.event_id and e.status = 'published' and e.closes_at > now()
    )
  );

drop policy if exists "admin reads event responses" on programming.event_responses;
create policy "admin reads event responses" on programming.event_responses
  for select using (core.is_admin());

-- --------------------------------------------------------------------
-- event_response_items — order line items
-- --------------------------------------------------------------------
-- Real rows rather than jsonb on the response, because the whole point of
-- an order event is the roll-up ("12 mediums") — that's a group-by here and
-- a parsing exercise otherwise.
--
-- `nulls not distinct` on the unique constraint (Postgres 15+, this project
-- is on 17) so an item with NO options can't accumulate duplicate rows for
-- the same member — with default NULL-distinct semantics two null-option
-- rows would both be allowed and the quantities would silently double.
create table if not exists programming.event_response_items (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references programming.event_responses (id) on delete cascade,
  event_item_id uuid not null references programming.event_items (id) on delete cascade,
  option text,
  qty smallint not null default 1 check (qty > 0),
  created_at timestamptz not null default now(),
  unique nulls not distinct (response_id, event_item_id, option)
);

create index if not exists event_response_items_response_idx on programming.event_response_items (response_id);
create index if not exists event_response_items_item_idx on programming.event_response_items (event_item_id);

alter table programming.event_response_items enable row level security;

drop policy if exists "member manages own event response items" on programming.event_response_items;
create policy "member manages own event response items" on programming.event_response_items
  for all using (
    exists (
      select 1 from programming.event_responses r
      where r.id = event_response_items.response_id and r.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from programming.event_responses r
      where r.id = event_response_items.response_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "admin reads event response items" on programming.event_response_items;
create policy "admin reads event response items" on programming.event_response_items
  for select using (core.is_admin());

-- --------------------------------------------------------------------
-- announcements -> events
-- --------------------------------------------------------------------
-- "Also announce this" writes a normal announcement row pointing back at
-- the event, so the megaphone and the destination stay separate concepts
-- and no new push infrastructure is needed. Nullable: most announcements
-- have nothing to do with an event.
alter table programming.announcements
  add column if not exists event_id uuid references programming.events (id) on delete set null;

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- Needs the usual PostgREST schema-cache nudge — NOTIFY pgrst, 'reload
-- schema'; in the SQL Editor right after running this.
