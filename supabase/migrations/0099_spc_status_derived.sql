-- SPC client statuses become derived, not maintained.
--
-- THE PROBLEM. programming.spc_clients.status carried five values lifted
-- straight from the printed method — printed_ready, needs_printed,
-- new_program_asap, coming_up_next_week, paused. Four of those five describe
-- something the database can already see: whether a block covers today,
-- whether one is ending, whether a draft is written but unsent, whether the
-- current block still has empty or unpublished sessions. Coaches were
-- hand-maintaining a state machine that duplicated its own data, and it drifted
-- — which is exactly why nobody could read the SPC roster at a glance.
--
-- WHAT'S LEFT. Only 'paused' is real-world knowledge the app cannot infer: a
-- client on holiday, injured, or taking a break. That stays manual. Everything
-- else is computed by lib/programming/spcState.js's deriveSpcState(), which is
-- fed by the coverage pass getSpcRosterDetail() was already doing.
--
-- WHY 'active' RATHER THAN DROPPING THE COLUMN. isSpcActive() — the check every
-- member-facing SPC screen runs before showing anything — reads
-- `status !== 'paused'`. Keeping the column with a narrowed domain means that
-- function, and the enrolment toggles that write it, keep working untouched.
-- Row existence still is not enrolment; status still is.
--
-- ROLLBACK. The four collapsed values cannot be recovered from within this
-- migration — capture them first if that matters:
--   create table programming.zz_spc_status_backup_0099 as
--     select user_id, status from programming.spc_clients;
-- then to undo:
--   alter table programming.spc_clients drop constraint spc_clients_status_check;
--   alter table programming.spc_clients add constraint spc_clients_status_check
--     check (status in ('printed_ready','needs_printed','new_program_asap','coming_up_next_week','paused'));
--   update programming.spc_clients c set status = b.status
--     from programming.zz_spc_status_backup_0099 b where b.user_id = c.user_id;
--   alter table programming.spc_clients alter column status set default 'needs_printed';

-- ORDER MATTERS, in both directions, and a dry run is what proved it: the
-- UPDATE has to run with NO check attached. 'active' is not legal under the old
-- constraint, so updating first fails on row one; and the rows have to be legal
-- under the new constraint before it is added, so adding first fails too. Drop,
-- update, re-add.
--
-- The constraint was declared inline on the column in 0006, so Postgres
-- auto-named it <table>_<column>_check. Verified against pg_constraint before
-- writing this rather than trusting the convention.
alter table programming.spc_clients drop constraint if exists spc_clients_status_check;

update programming.spc_clients set status = 'active' where status <> 'paused';

alter table programming.spc_clients add constraint spc_clients_status_check
  check (status in ('active', 'paused'));

-- A newly enrolled client is enrolled. 'needs_printed' was only ever a
-- lifecycle guess about work the coach had not done yet.
alter table programming.spc_clients alter column status set default 'active';
