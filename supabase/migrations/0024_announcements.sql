-- Gym-wide (or filtered) broadcast announcements from a coach/admin to
-- clients — "open it up, put in a note, send right away or schedule it,
-- pops up when they open the app." Admin-only to compose/manage (see
-- app/(coach)/announcements/index.js), same reasoning as Settings being
-- admin-only: a broadcast to every client is a bigger blast radius than the
-- rest of the coach toggles, so it isn't gated on the generic can_view_*
-- permission flags at all.
--
-- target_type/target_group_program_id encode the optional audience filter.
-- SPC and Nutrition have no "program id" to filter by (SPC is a single
-- per-client enrollment, Nutrition lives in the standalone app's public.*
-- schema) — those two just check enrollment/active-status directly, both
-- client-side (lib/programming/announcements.js's audience filter, for the
-- in-app popup) and server-side (supabase/functions/_shared/
-- announcementAudience.ts, for the real push send).
create table programming.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_type text not null default 'all' check (target_type in ('all', 'group_program', 'spc', 'nutrition')),
  target_group_program_id uuid references programming.group_programs (id) on delete cascade,
  -- "Send now" just sets this to now() at insert time; "Schedule" sets a
  -- future timestamp. Either way this is also what RLS gates member
  -- visibility on below — a scheduled announcement is invisible to members
  -- (and unpushed) until this passes.
  send_at timestamptz not null default now(),
  created_by uuid references core.users (id),
  created_at timestamptz not null default now(),
  -- Set once send-announcement/scan-announcements has actually pushed this
  -- one out, so the scheduled scan never double-sends.
  pushed_at timestamptz
);

create index announcements_send_at_idx on programming.announcements (send_at);

alter table programming.announcements enable row level security;

create policy "admin manage announcements" on programming.announcements
  for all using (core.is_admin()) with check (core.is_admin());

create policy "members read due announcements" on programming.announcements
  for select using (send_at <= now());

create table programming.announcement_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references programming.announcements (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);

create index announcement_acks_user_idx on programming.announcement_acknowledgments (user_id);

alter table programming.announcement_acknowledgments enable row level security;

-- A member only ever inserts/reads their own ack row — no update/delete
-- needed, "seen" is a one-way flag. Unlike nutrition_milestones' acknowledge
-- function, this doesn't need a security-definer RPC: ack is its own row a
-- member fully owns (not a column on a coach-owned row), so a plain RLS
-- check(user_id = auth.uid()) is already the right narrow scope.
create policy "member manages own acknowledgments" on programming.announcement_acknowledgments
  for select using (user_id = auth.uid());

create policy "member creates own acknowledgment" on programming.announcement_acknowledgments
  for insert with check (user_id = auth.uid());

create policy "admin reads all acknowledgments" on programming.announcement_acknowledgments
  for select using (core.is_admin());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- Needs the usual PostgREST schema-cache nudge — NOTIFY pgrst, 'reload
-- schema'; in the SQL Editor right after running this.
