-- Core identity/role layer shared by both the Programming and Nutrition
-- modules of the new Kova Strength app. Run in the Supabase SQL Editor
-- (same project as the Nutrition Tracker app — this migration only touches
-- new `core`/`programming`/`nutrition` schemas, never Nutrition Tracker's
-- existing public.* tables).
--
-- After running this, go to Project Settings > API > Exposed schemas in the
-- Supabase dashboard and add `core`, `programming`, `nutrition` — schemas
-- aren't reachable from supabase-js until they're explicitly exposed there.
-- That's a dashboard-only setting, there's no SQL equivalent.

create schema if not exists core;
create schema if not exists programming;
create schema if not exists nutrition;

create type core.user_role as enum ('admin', 'coach', 'member');

create table core.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role core.user_role not null,
  phone text,
  created_at timestamptz not null default now()
);

create index users_role_idx on core.users (role);

-- Security-definer helpers so RLS policies can check role without recursing
-- into this (also RLS-protected) table — same pattern as the Nutrition
-- Tracker app's is_coach(), adapted for a role column instead of a
-- role-specific table, since Programming's "all coaches see all clients"
-- needs role-based checks rather than row-existence checks.
create function core.is_staff()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select exists (
    select 1 from core.users where id = auth.uid() and role in ('admin', 'coach')
  );
$$;

create function core.is_admin()
returns boolean
language sql
security definer
set search_path = core
stable
as $$
  select exists (
    select 1 from core.users where id = auth.uid() and role = 'admin'
  );
$$;

alter table core.users enable row level security;

create policy "staff can view all users" on core.users
  for select using (core.is_staff());

create policy "user can view own row" on core.users
  for select using (id = auth.uid());

create policy "admin can manage users" on core.users
  for all using (core.is_admin()) with check (core.is_admin());

-- Bootstrap policy: lets the very first authenticated user create their own
-- admin row, but only while the table is empty. Once one row exists this
-- condition is permanently false, so it can't be used to self-promote later
-- — all subsequent user creation goes through an admin (via core.is_admin()
-- above) or a service-role Edge Function.
create policy "first user can self-insert as admin" on core.users
  for insert with check (
    id = auth.uid()
    and role = 'admin'
    and not exists (select 1 from core.users)
  );

create table core.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table core.settings enable row level security;

create policy "staff can read settings" on core.settings
  for select using (core.is_staff());

create policy "admin can manage settings" on core.settings
  for all using (core.is_admin()) with check (core.is_admin());

insert into core.settings (key, value) values
  ('alert_lead_time_days', '3'),
  ('default_block_length_flagship_weeks', '4'),
  ('default_block_length_bwa_weeks', '6'),
  ('default_block_length_spc_weeks', '4')
on conflict (key) do nothing;
