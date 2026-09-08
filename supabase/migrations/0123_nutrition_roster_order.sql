-- A coach's own working order for the nutrition queue.
--
-- The queue groups clients by status and sorts alphabetically inside each
-- group. Coaches don't work through check-ins alphabetically — they work
-- through them in whatever order makes sense to them that morning — so this
-- lets each coach drag the rows in an open group into her own order.
--
-- Per COACH, not shared: the nutrition roster shows every client to every
-- coach (getNutritionRoster has no coach filter), so one shared order would
-- mean three people fighting over one list. owner_id is the coach doing the
-- ordering and the RLS policy is own-rows-only in every direction.
--
-- The `status` column is what makes "when someone moves from one stage to
-- the next, they drop in at the bottom" true with no write and no scan:
-- a saved position only counts while the client is still in the status it
-- was saved under. The moment her rosterStatus changes, the row stops
-- matching, she falls into the unordered tail of her new group (sorted by
-- name), and she stays there until a coach drags that group again. One row
-- per (owner, client) — a client moving between statuses replaces her own
-- row rather than accumulating one per status she has ever been in.
--
-- Deliberately no FK on client_id. It points at public.clients.id (which is
-- auth.users.id), and this repo's standing convention is not to FK into the
-- shared standalone-Nutrition-Tracker tables — same call as
-- payroll.nutrition_assignments. A client who leaves nutrition just leaves a
-- stale row behind; reads join against the live roster, so it is invisible.
create table programming.nutrition_roster_order (
  owner_id uuid not null references core.users (id) on delete cascade,
  client_id uuid not null,
  -- The rosterStatus (lib/nutrition/rosterStatus.js) this position was set
  -- under. Free text on purpose: those keys are derived in app code and are
  -- reworked from time to time, and a CHECK here would turn a future rename
  -- into a failed write on a screen that is only remembering a sort order.
  status text not null,
  position smallint not null,
  updated_at timestamptz not null default now(),
  -- One row per coach per client. Makes each drag a plain upsert and means a
  -- client can never hold two positions at once.
  primary key (owner_id, client_id)
);

alter table programming.nutrition_roster_order enable row level security;

-- Own rows only, and gated on the nutrition module the same way every other
-- nutrition table is. Revoking a coach's nutrition access hides her saved
-- order rather than deleting it, so it comes back intact if access returns.
create policy "coach manages own nutrition roster order" on programming.nutrition_roster_order
  for all using (owner_id = auth.uid() and core.can_access_nutrition())
  with check (owner_id = auth.uid() and core.can_access_nutrition());

-- Rollback:
--   drop table programming.nutrition_roster_order;
