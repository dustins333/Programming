-- 0132: one "core" pay row per coach per day.
--
-- The coach Log screen keeps group / programs / welcome / strategy / admin /
-- ops for a day on ONE pay_entries row, and saves counter taps after a short
-- debounce. Two saves could overlap (a second tap while the first insert was
-- still in flight, or leaving the screen mid-save and coming straight back),
-- each decided no row existed yet, and each inserted one. The screen only
-- ever shows one core row per day (the newest), but pay totals add every
-- row, so the extra row was invisible and still paid. Reproduced
-- 2026-09-14; captured state and findings are outside the repo in
-- ~/kova-payroll-duplicates-2026-09-14/.
--
-- Part 1 merges the four duplicate days in the open Sep 3 period to the
-- counts Terra verified with the coaches (2 group sessions each). Each keeps
-- its oldest row and deletes the other. Guards abort the whole block if any
-- row has changed since it was checked, so a coach editing in the meantime
-- can't be overwritten.
--
-- Closed-period duplicates (Kristan Alford 8/24, 8/25, 8/31; Leslie Romero
-- 8/24) are deliberately NOT touched: the record for a closed period stays as
-- it was paid.
--
-- Part 2 adds the rule. It is scoped to source = 'coach_entry' because that
-- is the only path that writes core-shaped rows for a real user:
-- legacy_import days legitimately carry several rows (Glide logged each item
-- separately), admin payee rows have no user_id, and nutrition_billing /
-- custom_request rows have their own source and shape. The predicate matches
-- calc.js partitionDayEntries' definition of the core row.
--
-- It also starts at the Sep 3 2026 period. The closed-period duplicates
-- above would otherwise stop the index being created, and they are staying
-- as paid. A closed period can't be written to anyway (0036's RLS), so the
-- rule loses nothing by not covering them.

do $$
declare
  n int;
begin
  -- Every row involved, with the value it must still hold.
  select count(*) into n
  from payroll.pay_entries e
  join (values
    ('23fabcb0-516a-4d9f-bf0f-5df4ca2bfd74'::uuid, 1.00), -- Sarah 9/3 keep
    ('2317c170-a8d8-41bf-95e2-d6833f38ee49'::uuid, 1.00), -- Sarah 9/3 delete
    ('a3cc1877-30eb-4f2a-a567-27e9ea71ab17'::uuid, 1.00), -- Sarah 9/10 keep
    ('242b38c9-fcde-48da-81e7-c10ca098bcfe'::uuid, 1.00), -- Sarah 9/10 delete
    ('5086f13b-e1b9-4412-8b17-4878b2ea154d'::uuid, 2.00), -- Sarah 9/14 keep
    ('384f6603-e296-48ef-b825-da193fb19860'::uuid, 0.00), -- Sarah 9/14 delete
    ('b641cb3c-ff41-40ec-b94a-a420293f8561'::uuid, 1.00), -- Ashley 9/3 keep
    ('64cac1ce-968f-47a0-aebc-84f792e0a0d0'::uuid, 2.00)  -- Ashley 9/3 delete
  ) v(id, grp) on v.id = e.id
  where e.group_sessions = v.grp
    and coalesce(e.programs_written, 0) = 0
    and coalesce(e.welcome_sessions, 0) = 0
    and coalesce(e.strategy_sessions, 0) = 0
    and e.admin_hours is null
    and e.ops_hours is null
    and e.pay_period_start = '2026-09-03';
  if n <> 8 then
    raise exception 'Aborting: expected 8 unchanged duplicate rows, found %', n;
  end if;

  update payroll.pay_entries
  set group_sessions = 2, updated_at = now()
  where id in (
    '23fabcb0-516a-4d9f-bf0f-5df4ca2bfd74',
    'a3cc1877-30eb-4f2a-a567-27e9ea71ab17',
    '5086f13b-e1b9-4412-8b17-4878b2ea154d',
    'b641cb3c-ff41-40ec-b94a-a420293f8561'
  );
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'Aborting: expected to update 4 rows, updated %', n; end if;

  delete from payroll.pay_entries
  where id in (
    '2317c170-a8d8-41bf-95e2-d6833f38ee49',
    '242b38c9-fcde-48da-81e7-c10ca098bcfe',
    '384f6603-e296-48ef-b825-da193fb19860',
    '64cac1ce-968f-47a0-aebc-84f792e0a0d0'
  );
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'Aborting: expected to delete 4 rows, deleted %', n; end if;
end $$;

create unique index pay_entries_one_core_row_per_day
  on payroll.pay_entries (user_id, entry_date)
  where source = 'coach_entry'
    and pay_period_start >= '2026-09-03'
    and spc_session is not true
    and other_type is null
    and custom_amt is null
    and custom_description is null;
