-- Client goals — the one card both the coach and the client see.
--
-- Terra's ask: "a way to input someone's goals/what they are working on, and
-- have it persist throughout the app" — on the client's programming page, in
-- the SPC live session header next to their name, and at the top of the
-- session they're logging.
--
-- WHY THIS IS A NEW TABLE AND NOT spc_clients.notes_goals_feedback
-- -----------------------------------------------------------------
-- That column already exists (0006), is labelled "Goals & feedback" in the
-- SPC client rail, and 50 of 75 SPC clients have it filled in. It is NOT
-- what goes on a member's screen. A content audit of the live values found
-- real goals ("Pull ups", "hip stability, core") mixed with coach-to-coach
-- shorthand that would be wrong for the client to read:
--
--   "See welcome session notes for program info"
--   "GLUTES AND CORE! GLM convo if you want more insight"
--   "came up during her NMJ call -LB"
--   "...also OH MOB! we talked about ... ('wants a cute butt')"
--
-- So: two fields, deliberately. This table is the short, member-safe goal;
-- notes_goals_feedback stays exactly as it is as the coach's scratchpad, and
-- the UI stacks the two so the private/shared split is visible. Nothing is
-- auto-copied across — that would push the shorthand above onto client
-- screens.
--
-- Keyed on user_id, NOT spc_client_id: this shows on the general Clients
-- page too, and a Group-only member has goals as much as an SPC one does.
-- SPC is just where it gets set most.
--
-- user_id is the primary key because a client has exactly one current goal.
-- Setting a new one overwrites (Terra's call — no history in v1). Clearing
-- deletes the row rather than storing '', so "no goal" has exactly one
-- representation and the member-side "render nothing" is a plain null check.
create table if not exists programming.client_goals (
  user_id uuid primary key references core.users (id) on delete cascade,
  goal text not null check (btrim(goal) <> ''),
  updated_by uuid references core.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table programming.client_goals enable row level security;

-- Coaches write it, anywhere it appears.
create policy "staff manage client goals" on programming.client_goals
  for all using (core.is_staff()) with check (core.is_staff());

-- The member reads their own, and only reads. This is the deliberate
-- difference from client_notes/client_limitations (0057), which have no
-- member policy at all in either direction.
create policy "member reads own client goal" on programming.client_goals
  for select using (user_id = auth.uid());

-- The wall display signs in as an account with no core.users read and no
-- access to any client outside the open hub session (0071), so it needs its
-- own policy to show a goal next to a name. Same shape as the twelve
-- display policies already there. A policy rather than a snapshot onto
-- hub_session_clients so a goal edited mid-session updates on the wall.
create policy "display reads hub-active client goals" on programming.client_goals
  for select using (core.is_gym_display() and programming.hub_active_client(user_id));

grant select, insert, update, delete on programming.client_goals to authenticated;

-- New table — PostgREST needs the usual nudge before it's reachable:
-- NOTIFY pgrst, 'reload schema';
