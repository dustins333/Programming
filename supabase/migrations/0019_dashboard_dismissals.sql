-- Coach Home's "Needs your attention" list gets a dismiss ("x") affordance.
-- One row per attention-item key (same stable keys computeAttentionItems()
-- already builds, e.g. "nutrition-risk-<userId>", "group-gap-<programId>").
-- `signature` snapshots whatever value makes that item's severity change
-- over time (missed-day count, days-until-block-ends, etc.) so the app can
-- tell "still the same problem, stay dismissed" apart from "got worse,
-- show it again" without a fixed-length allowlist of item types living in
-- SQL. No per-coach scoping — this app has no per-coach dashboard state
-- anywhere else (push-notification toggles etc. are all global too).
create table programming.dashboard_dismissals (
  key text primary key,
  signature text,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid references core.users (id)
);

alter table programming.dashboard_dismissals enable row level security;

create policy "staff manage dashboard_dismissals" on programming.dashboard_dismissals
  for all using (core.is_staff()) with check (core.is_staff());

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide.
grant all on all tables in schema programming to anon, authenticated, service_role;
grant all on all sequences in schema programming to anon, authenticated, service_role;
