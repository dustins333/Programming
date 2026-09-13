-- Conditioning: a zone 2 cardio program with no programming behind it.
--
-- Deliberately NOT a group program and NOT SPC. Both carry blocks, weeks,
-- workouts and exercises, and conditioning has none of that: a member does
-- her cardio and logs four facts about it (average heart rate, time, how it
-- felt, notes). Modelling it as either would mean every screen that reads
-- those tables learning to skip a program with no content.
--
-- Also deliberately NOT programming.logs. That table is shaped for sets and
-- reps, and its unique index (logs_unique_set_idx) has already broken
-- production once when it was widened. A conditioning session is one row of
-- its own.
--
-- Enrolment mirrors spc_clients: the row survives turning the switch off
-- ('inactive'), so her frequency comes back intact when it is turned on again.

create table programming.conditioning_clients (
  user_id uuid primary key references core.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  -- The weekly TARGET. She can log more than this and it still counts.
  sessions_per_week smallint not null default 1 check (sessions_per_week between 1 and 3),
  created_at timestamptz not null default now()
);

create table programming.conditioning_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  -- The Boise calendar day she did it. A date, not a timestamp, so "which
  -- week is this in" is plain string comparison and never a timezone bug.
  performed_on date not null,
  -- Optional: not everyone wears a heart rate monitor, and a required field
  -- she can't fill is how people stop logging.
  avg_heart_rate smallint check (avg_heart_rate between 30 and 240),
  duration_minutes smallint not null check (duration_minutes between 1 and 600),
  feel smallint check (feel between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conditioning_logs_user_date_idx
  on programming.conditioning_logs (user_id, performed_on desc);

-- The gym-wide "this week" read on the coach dashboard filters on the date
-- alone.
create index conditioning_logs_date_idx
  on programming.conditioning_logs (performed_on);

alter table programming.conditioning_clients enable row level security;
alter table programming.conditioning_logs enable row level security;

-- Staff manage everything, including their own rows (dual-login coaches are
-- real training clients too).
create policy "staff manage conditioning clients" on programming.conditioning_clients
  for all using (core.is_staff()) with check (core.is_staff());

-- A member reads her own enrolment. She never writes it: turning a program on
-- is the coach's call.
create policy "member reads own conditioning enrolment" on programming.conditioning_clients
  for select using (auth.uid() is not null and user_id = auth.uid());

create policy "staff manage conditioning logs" on programming.conditioning_logs
  for all using (core.is_staff()) with check (core.is_staff());

-- A member owns her own logs outright: log, edit, delete.
create policy "member manages own conditioning logs" on programming.conditioning_logs
  for all using (auth.uid() is not null and user_id = auth.uid())
  with check (auth.uid() is not null and user_id = auth.uid());

grant all on programming.conditioning_clients to anon, authenticated, service_role;
grant all on programming.conditioning_logs to anon, authenticated, service_role;
