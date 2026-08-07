-- Coach <-> member messaging. Genuinely new — programming.program_comments
-- (0004) is coach-to-coach only by design (RLS is staff-only both ways,
-- addComment takes just a coachId), and announcements (0024) are
-- admin-only/broadcast-only, so there was no member-initiated channel to a
-- coach anywhere in the app despite (member)/settings.js already shipping
-- a notify_coach_messages toggle with nothing behind it.
--
-- One flat thread per client (user_id), not per-coach — matches this app's
-- "all coaches see all clients" design (core.is_staff(), see 0001's
-- comment): any coach can read/reply to any client's thread, same as every
-- other staff-managed table in this schema. sender_role is stamped
-- app-side rather than derived from sender_id, since a coach/admin account
-- can also be a real training client (dual-login) — inferring "staff" from
-- "sender_id has a staff role" would be wrong the moment that same person
-- messages as themselves from their own member thread.
--
-- No update/delete policies anywhere — messages are an immutable log, same
-- shape as program_comments' comment_text (nothing in this app lets a
-- coach edit/delete a posted comment either).
create table programming.client_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  sender_id uuid not null references core.users (id),
  sender_role text not null check (sender_role in ('member', 'staff')),
  body text not null,
  created_at timestamptz not null default now()
);

create index client_messages_user_idx on programming.client_messages (user_id, created_at);

alter table programming.client_messages enable row level security;

create policy "member reads own messages" on programming.client_messages
  for select using (user_id = auth.uid());

create policy "member sends own messages" on programming.client_messages
  for insert with check (user_id = auth.uid() and sender_id = auth.uid() and sender_role = 'member');

create policy "staff read all messages" on programming.client_messages
  for select using (core.is_staff());

create policy "staff send messages" on programming.client_messages
  for insert with check (core.is_staff() and sender_role = 'staff');

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New table needs the same PostgREST schema-cache nudge as always —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
