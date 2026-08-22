-- 0073: one row per logged set — de-duplicate programming.logs and constrain it.
--
-- ALREADY RUN against the live project (2026-08-21). Recorded here so a fresh
-- environment gets the same shape, and so the index has a home in the repo.
--
-- WHY. logResult() (lib/programming/memberPlan.js) was a hand-rolled
-- select-then-update-or-insert with nothing backing it. Two autosaves racing —
-- two devices, the gym display and a phone, a fast double-write — both found no
-- existing row and both inserted the same set. By Aug 2026 that had produced 20
-- colliding groups. Top-set and PR logic takes a max and survived it; anything
-- that SUMS did not, so session volume and set counts were inflated wherever it
-- happened. One member had a single set counted four times.
--
-- THE KEY, and why it is this wide. Three of the four collision shapes found in
-- the real data are legitimate and must NOT be merged:
--
--   * two different sessions on one date. A member can log week 2 session 2 and
--     week 3 session 2 of the same program on the same day (back-logging one of
--     them). Hence the three session-reference columns, and week_number — an
--     spc_workouts row recurs every week of its block, so spc_workout_id alone
--     does not separate weeks.
--
--   * two TrueCoach imports linked to one Kova lift. Multi-select linking is a
--     shipped, in-use feature (0066) — five exercises currently have 2-4 imports
--     linked, and each link materialises its own set rows. Without
--     truecoach_import_id in the key, linking a second import would be rejected
--     and the feature would break.
--
-- NULLS NOT DISTINCT is load-bearing, not a detail. Every session column is
-- NULL for a row with no session reference — the ordinary case, and all 834
-- rows that pre-date 0063. Under plain UNIQUE semantics each of those NULLs is
-- distinct from every other, so the duplicates this migration exists to stop
-- would pass straight through. Requires Postgres 15+; the project is on 17.
--
-- ON CONFLICT inference against a NULLS NOT DISTINCT index was verified on a
-- throwaway table before logResult was changed, including the all-columns-NULL
-- case. It works: `on conflict (<the same column list>) do update` matches.

-- 1. Collapse existing collisions, keeping the most complete row in each group
--    (both values > one value > neither), tie-broken by earliest created_at.
--    A no-op on the live project, which was de-duplicated before the index was
--    built: 15 groups merged, 18 rows removed, 6 of them husks carrying neither
--    reps nor weight. All 33 involved rows were exported first.
with ranked as (
  select l.id,
    row_number() over (
      partition by user_id, exercise_id, date_performed, set_number,
        coalesce(group_workout_id,   '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(spc_workout_id,     '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(one_off_workout_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(truecoach_import_id,'00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(week_number, -1)
      order by (case when reps is not null and weight is not null then 0
                     when reps is not null or  weight is not null then 1
                     else 2 end),
               created_at asc, id asc
    ) as rn
  from programming.logs l
)
delete from programming.logs l
using ranked r
where l.id = r.id and r.rn > 1;

-- 2. The constraint itself. Built CONCURRENTLY on the live project so the write
--    path was never locked; kept as a plain CREATE here because a fresh
--    environment has no traffic and CONCURRENTLY cannot run inside the
--    transaction the SQL editor wraps a script in.
create unique index if not exists logs_unique_set_idx
  on programming.logs (
    user_id, exercise_id, date_performed, set_number,
    group_workout_id, spc_workout_id, one_off_workout_id,
    truecoach_import_id, week_number
  ) nulls not distinct;

-- Rollback: drop index if exists logs_unique_set_idx;
-- The 18 removed rows are restorable from f2_rollback.sql (session scratchpad),
-- but only with the index dropped first — they conflict with it by definition.
