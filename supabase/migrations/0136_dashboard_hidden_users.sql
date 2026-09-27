-- Settings -> Hidden accounts. Test accounts were showing up on the coach
-- dashboard ("girls not in this week", SPC due, nutrition not seen, ...),
-- which made those lists read as more work than there was.
--
-- One row per account the dashboard should ignore. Scope is the dashboard's
-- counts and lists ONLY: the Clients page, the live board, and every
-- automation (the nightly SPC draft, reminder pushes) keep treating these
-- accounts like anyone else, so they still work for testing a flow.
--
-- Its own table rather than a core.users column: core.users is written by
-- registration, the GHL import and the staff screens, and none of them
-- should be able to clear this by accident.
create table core.dashboard_hidden_users (
  user_id uuid primary key references core.users (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  hidden_by uuid references core.users (id) on delete set null
);

alter table core.dashboard_hidden_users enable row level security;

-- Every coach's dashboard filters on it, so staff read it; only an admin
-- changes it (the Settings page is admin-only).
create policy "staff read dashboard_hidden_users" on core.dashboard_hidden_users
  for select using (core.is_staff());

create policy "admin manage dashboard_hidden_users" on core.dashboard_hidden_users
  for all using (core.is_admin()) with check (core.is_admin());

grant all on core.dashboard_hidden_users to anon, authenticated, service_role;
