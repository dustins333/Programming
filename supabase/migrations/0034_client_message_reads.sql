-- Unread tracking for the coach<->member shared thread (0032). Since a
-- thread is shared (any staff can post, and staff-side "read" is a shared
-- state across all coaches, not per-coach — matching this app's "all
-- coaches see all clients" design), "read" is two timestamps per client
-- thread, not a per-message flag: one for the client's own view, one for
-- the staff-shared view.
create table programming.client_message_reads (
  user_id uuid primary key references core.users (id) on delete cascade,
  last_read_by_member_at timestamptz,
  last_read_by_staff_at timestamptz
);

alter table programming.client_message_reads enable row level security;

-- Any coach can mark any thread read/unread — same "staff manage X"
-- convention as every other table in this schema.
create policy "staff manage message reads" on programming.client_message_reads
  for all using (core.is_staff()) with check (core.is_staff());

-- Members can read their own read-state row (needed for a future
-- member-side "is this already read" check, symmetry with the staff side).
create policy "member reads own message read state" on programming.client_message_reads
  for select using (user_id = auth.uid());

-- RLS can't restrict which *column* an update touches, so a member
-- self-service write needs a narrow security-definer RPC that can only
-- ever touch last_read_by_member_at — same pattern as
-- core.update_own_notification_prefs / programming.acknowledge_nutrition_milestone.
create function programming.mark_own_thread_read()
returns void
language sql
security definer
set search_path = programming
as $$
  insert into programming.client_message_reads (user_id, last_read_by_member_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_read_by_member_at = excluded.last_read_by_member_at;
$$;

grant execute on function programming.mark_own_thread_read() to authenticated;

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New table needs the same PostgREST schema-cache nudge as always —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
