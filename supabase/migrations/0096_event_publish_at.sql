-- Events can be scheduled to go live at a set day and time.
--
-- Until now, publishing an event made it visible immediately: the Events tab
-- appeared, and the optional announcement pushed right then. That forced a
-- coach to be at a keyboard at the moment she wanted people to see it.
--
-- publish_at is nullable and null means "live as soon as it's published" —
-- exactly today's behaviour — so every existing row is unaffected and there
-- is nothing to backfill.
--
-- The PUSH half needs no new infrastructure: an event's announcement is a
-- normal programming.announcements row, and those already carry send_at and
-- are already sent by the scan-announcements pg_cron job (0025). Scheduling
-- an event just means writing the announcement with send_at = publish_at
-- instead of now(). That cron polls every 15 minutes, which is why the
-- coach-side picker only offers quarter-hour slots.
--
-- The gate is repeated inline in all six member-facing policies rather than
-- extracted into a helper: a function that reads programming.events cannot be
-- used inside programming.events' own policy without recursing, so a helper
-- would only cover five of the six and leave the important one written
-- differently from its siblings.

alter table programming.events
  add column if not exists publish_at timestamptz;

comment on column programming.events.publish_at is
  'When a published event becomes visible to members. Null = as soon as it is published. Member-facing RLS gates on it, so this is a real hold, not a UI convention.';

-- Speeds the members-read path, which now filters on all three of status,
-- publish_at and closes_at.
create index if not exists events_live_window_idx
  on programming.events (status, publish_at, closes_at);

-- --------------------------------------------------------------------
-- Member-facing policies: published AND started AND not yet closed.
-- The auth.uid() guard is kept from the 2026-08-21 audit — a policy gates
-- on the caller first and on content state second, or anon reads it.
-- --------------------------------------------------------------------

drop policy if exists "members read live events" on programming.events;
create policy "members read live events" on programming.events
  for select using (
    auth.uid() is not null
    and status = 'published'
    and (publish_at is null or publish_at <= now())
    and closes_at > now()
  );

drop policy if exists "members read live event items" on programming.event_items;
create policy "members read live event items" on programming.event_items
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from programming.events e
      where e.id = event_items.event_id
        and e.status = 'published'
        and (e.publish_at is null or e.publish_at <= now())
        and e.closes_at > now()
    )
  );

drop policy if exists "members read live event questions" on programming.event_questions;
create policy "members read live event questions" on programming.event_questions
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from programming.events e
      where e.id = event_questions.event_id
        and e.status = 'published'
        and (e.publish_at is null or e.publish_at <= now())
        and e.closes_at > now()
    )
  );

drop policy if exists "member creates own event response" on programming.event_responses;
create policy "member creates own event response" on programming.event_responses
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from programming.events e
      where e.id = event_responses.event_id
        and e.status = 'published'
        and (e.publish_at is null or e.publish_at <= now())
        and e.closes_at > now()
    )
  );

drop policy if exists "member updates own event response" on programming.event_responses;
create policy "member updates own event response" on programming.event_responses
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from programming.events e
      where e.id = event_responses.event_id
        and e.status = 'published'
        and (e.publish_at is null or e.publish_at <= now())
        and e.closes_at > now()
    )
  );

drop policy if exists "member deletes own event response" on programming.event_responses;
create policy "member deletes own event response" on programming.event_responses
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from programming.events e
      where e.id = event_responses.event_id
        and e.status = 'published'
        and (e.publish_at is null or e.publish_at <= now())
        and e.closes_at > now()
    )
  );

notify pgrst, 'reload schema';
