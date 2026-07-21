-- Native-only push notification registrations (Expo Push Service /
-- APNs/FCM). No web push table — the web build doesn't need push per the
-- build plan's decision (coaches only get push on the app side).
create table core.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  expo_push_token text not null unique,
  device_name text,
  created_at timestamptz not null default now()
);

create index push_tokens_user_idx on core.push_tokens (user_id);

alter table core.push_tokens enable row level security;

create policy "user manages own push tokens" on core.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff can read push tokens" on core.push_tokens
  for select using (core.is_staff());
