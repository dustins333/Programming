-- Nutrition module, Phase 4 scope: core loop only (targets, daily log, weekly
-- check-in). Progress photos, Focus/Game Plan notes, answer highlighting, and
-- push reminders are explicitly deferred to a later phase per build-plan.md.
-- This is a one-time port of the separate, still-live Nutrition Tracker app's
-- proven data model/bug fixes into new tables here -- it never reads or
-- writes that app's public.* schema, and that app is untouched by this file.

create table nutrition.nutrition_clients (
  user_id uuid primary key references core.users (id) on delete cascade,
  assigned_coach_id uuid references core.users (id),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);

-- Insert-only, never updated -- every coach edit is a brand new row, "current"
-- is derived by querying (most recent effective_date <= today), not stored.
-- Calories are intentionally not a column here: they're always derived from
-- macros (4*protein + 4*carb + 9*fat) at read time, matching the source app's
-- design so a coach can never enter a calorie figure that doesn't match the
-- macros next to it.
create table nutrition.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  set_by uuid references core.users (id),
  protein_g numeric not null,
  carb_g numeric not null,
  fat_g numeric not null,
  fiber_g numeric not null,
  step_goal integer,
  sleep_hours_goal numeric,
  effective_date date not null,
  note text,
  created_at timestamptz not null default now()
);

create index targets_user_effective_idx on nutrition.targets (user_id, effective_date desc);

-- Macro columns are nullable from day one -- the source app originally had
-- these NOT NULL, which silently broke autosave any time a client filled in
-- weight/sleep before macros (a common real order of entry), since the
-- upsert would fail the constraint. The fix there (and the correct starting
-- point here) is: autosave persists whatever's filled in so far with no
-- required fields, and the "all 4 macros present" rule only lives in the
-- separate Finalize action via finalized_at (null = draft, timestamp =
-- finalized) -- never enforced at the database/draft-save layer.
create table nutrition.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  log_date date not null,
  weight numeric,
  protein_g numeric,
  carb_g numeric,
  fat_g numeric,
  fiber_g numeric,
  steps integer,
  sleep_hours numeric,
  sleep_quality smallint check (sleep_quality between 1 and 5),
  hunger smallint check (hunger between 1 and 5),
  energy smallint check (energy between 1 and 5),
  client_note text,
  coach_note text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index daily_logs_user_date_idx on nutrition.daily_logs (user_id, log_date desc);

-- Coach-managed master list.
create table nutrition.checkin_template_questions (
  id uuid primary key default gen_random_uuid(),
  position smallint not null,
  question_text text not null,
  created_at timestamptz not null default now()
);

-- A physical per-client copy, seeded from the template via an explicit "copy
-- from template" action (not a live join/fallback) -- same decoupling as the
-- source app, so one client's customized questions survive independently of
-- later template edits.
create table nutrition.client_checkin_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  position smallint not null,
  question_text text not null,
  created_at timestamptz not null default now()
);

create index client_checkin_questions_user_idx on nutrition.client_checkin_questions (user_id, position);

-- week_start is always the Monday computed server-side by
-- lib/nutrition/weekCycle.js's global Monday-Sunday cycle at submit time --
-- never accepted as a parameter from the caller. The source app's original
-- design used a per-client rollover day (clients.check_in_day) which could
-- misfile a submission, and even after moving to one global cycle, trusting
-- a client-supplied week_start could still misfile a submission under the
-- wrong week if a session stayed open across the weekly rollover. Both are
-- avoided here by recomputing week_start from today's date inside
-- submitCheckin itself, mirroring how daily-log dates are always
-- server-derived from todayInBoise() rather than trusted from the client.
-- targets_snapshot captures the target that was in effect at submission time
-- so viewing an old week later shows what was true that week, not today's
-- live target.
create table nutrition.checkin_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  week_start date not null,
  answers jsonb not null default '[]',
  targets_snapshot jsonb,
  submitted_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (user_id, week_start)
);

create index checkin_responses_user_week_idx on nutrition.checkin_responses (user_id, week_start desc);

-- RLS

alter table nutrition.nutrition_clients enable row level security;
alter table nutrition.targets enable row level security;
alter table nutrition.daily_logs enable row level security;
alter table nutrition.checkin_template_questions enable row level security;
alter table nutrition.client_checkin_questions enable row level security;
alter table nutrition.checkin_responses enable row level security;

create policy "staff manage nutrition_clients" on nutrition.nutrition_clients
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own nutrition_clients" on nutrition.nutrition_clients
  for select using (user_id = auth.uid());

create policy "staff manage targets" on nutrition.targets
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own targets" on nutrition.targets
  for select using (user_id = auth.uid());

-- Staff and the member both get "for all" on daily_logs: the member
-- autosaves and self-finalizes their own day (finalized_at is a client-side
-- action here, not coach-gated), while staff can read everyone's and add a
-- coach_note. Same shape as programming.logs' existing policy pair.
create policy "staff manage daily_logs" on nutrition.daily_logs
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member manages own daily_logs" on nutrition.daily_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff manage checkin_template_questions" on nutrition.checkin_template_questions
  for all using (core.is_staff()) with check (core.is_staff());

create policy "staff manage client_checkin_questions" on nutrition.client_checkin_questions
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own client_checkin_questions" on nutrition.client_checkin_questions
  for select using (user_id = auth.uid());

-- Member deliberately gets INSERT only, never UPDATE -- submits once per
-- week (the unique constraint blocks a second submission), and this is also
-- how "coach-only finalize" is enforced without a trigger or column-level
-- grant: finalized_at can only ever be set via staff's "for all" policy.
create policy "staff manage checkin_responses" on nutrition.checkin_responses
  for all using (core.is_staff()) with check (core.is_staff());
create policy "member reads own checkin_responses" on nutrition.checkin_responses
  for select using (user_id = auth.uid());
create policy "member inserts own checkin_responses" on nutrition.checkin_responses
  for insert with check (user_id = auth.uid());

-- Same Data-API permission dance as every schema-adding migration before
-- this one (see 0003, repeated again in 0004) -- GRANT is table-specific,
-- not schema-wide.
grant all on all tables in schema nutrition to anon, authenticated, service_role;
grant all on all sequences in schema nutrition to anon, authenticated, service_role;
