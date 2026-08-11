-- Nutrition plan phases: the long-term "what are we working on" map for a
-- client, sitting between a weekly focus item and a milestone. Coaches
-- explicitly corrected the assumption that milestones already cover this —
-- a milestone is a big pillar achievement, a phase is a theme you work
-- through for a while ("get good at tracking + find maintenance", then "16
-- week diet"). Shown on the coach's Dashboard tab beside Milestones, and to
-- the client on their nutrition Today card slider.
--
-- Two levels by design: a phase carries a title and a note, and holds an
-- ordered list of bullet items under it.
--
-- Deliberately NOT dated. Order is the timeline — the coach drags a phase
-- card up or down to say "this one's next", the same reorder mechanism used
-- for exercises and focus items. Only whole phases reorder; the items under
-- them keep a `position` as their stable insertion order but are not
-- draggable, so a drag is never ambiguous about what it's moving.
--
-- `label` (an optional free-text timeframe, "September" / "After the diet")
-- is NOT currently written or read by the app — the first pass had it, and
-- the card was then reworked to inline editing with the title at the very
-- top, which left no natural home for it. Kept rather than dropped: it's
-- nullable, costs nothing, and is exactly what a "timeframe" field would
-- need if that comes back. Don't assume it holds anything.
--
-- Genuinely new, with no standalone Nutrition Tracker app equivalent to
-- port, so it lives in Kova's own `programming` schema rather than the
-- shared public.* tables — same rationale as 0023's milestones, whose
-- structure this follows throughout.
--
-- Naming note: "phase" is already taken inside the nutrition module by the
-- derived onboarding phases (computeOnboardingPhases / PhaseCard), which
-- have no rows at all. Hence the `plan_` prefix on these tables.

create table programming.nutrition_plan_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  label text,
  title text not null,
  details text,
  position integer not null,
  created_by uuid references core.users (id),
  created_at timestamptz not null default now()
);

create table programming.nutrition_plan_phase_items (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references programming.nutrition_plan_phases (id) on delete cascade,
  text text not null,
  position integer not null,
  created_at timestamptz not null default now()
);

create index nutrition_plan_phases_user_position_idx on programming.nutrition_plan_phases (user_id, position);
create index nutrition_plan_phase_items_phase_position_idx on programming.nutrition_plan_phase_items (phase_id, position);

alter table programming.nutrition_plan_phases enable row level security;
alter table programming.nutrition_plan_phase_items enable row level security;

create policy "staff manage nutrition_plan_phases" on programming.nutrition_plan_phases
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

create policy "member reads own nutrition_plan_phases" on programming.nutrition_plan_phases
  for select using (user_id = auth.uid());

create policy "staff manage nutrition_plan_phase_items" on programming.nutrition_plan_phase_items
  for all using (core.can_access_nutrition()) with check (core.can_access_nutrition());

-- Items have no user_id of their own — ownership is resolved through the
-- parent phase, so a member can only ever read items hanging off a phase
-- that is already theirs. Members get no write path at all here; unlike
-- milestones there is nothing for them to acknowledge.
create policy "member reads own nutrition_plan_phase_items" on programming.nutrition_plan_phase_items
  for select using (
    exists (
      select 1 from programming.nutrition_plan_phases p
      where p.id = phase_id and p.user_id = auth.uid()
    )
  );

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;

-- New tables need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
