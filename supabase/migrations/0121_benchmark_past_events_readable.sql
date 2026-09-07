-- Benchmark Day: let a member read benchmarks that have already finished.
--
-- 0120 gated the member's read of programming.benchmark_events to the event's
-- own window (show_from <= today <= hide_after). That is right for deciding
-- what shows on My Week, and wrong for everything else, because the Last time
-- column is built by looking up the PREVIOUS event and reading her rows from
-- it:
--
--   getPreviousBenchmarkEvent(event)  ->  the event before this one
--   getBenchmarkBoard(user, event, previous)  ->  prefills Last time from it
--
-- By the time the next benchmark runs, the previous one is months past its
-- hide_after, so that first lookup returned nothing and the prefill silently
-- fell back to a blank column. Her entries were never the problem: the
-- `members read own benchmark entries` policy has no window on it and they
-- were readable the whole time. It was the event row she could not see.
--
-- Verified against the live database before and after, by impersonating a real
-- member with a closed benchmark behind her: 0 previous events visible before,
-- 1 after, and the board fetch going from 0 rows to her real 3.
--
-- The upper bound goes; the lower bound stays and is the load-bearing half. A
-- benchmark the coach has scheduled but not opened yet (show_from in the
-- future) must stay invisible, or the button turns up on My Week early.

drop policy if exists "read benchmark events in window" on programming.benchmark_events;
create policy "read benchmark events in window" on programming.benchmark_events
  for select using (
    auth.uid() is not null
    and (
      core.is_staff()
      or show_from <= (now() at time zone 'America/Boise')::date
    )
  );
