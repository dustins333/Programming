-- Last finalized session per client, for the whole roster in one call.
--
-- design_handoff_coach_web_v2 screen 12: the Clients table's "Last session"
-- column, its default sort, and the "Quiet 7+ days" filter chip all need
-- one date per client with no lookback limit — a client who last trained
-- five months ago has to read as five months, not fall off the end of a
-- window.
--
-- This app's standing convention elsewhere is "fetch the rows, group them
-- in JS" (listThreadSummaries, listDayTimeline) because supabase-js can't
-- express DISTINCT ON. That works where the row count is naturally bounded.
-- It isn't here: ~150 clients times years of finalized sessions is tens of
-- thousands of rows to ship to the browser for 150 dates. So this is one of
-- the few places worth a real function.
--
-- Deliberately NOT security definer. programming.session_completions
-- already carries a staff-read policy (0007), and a plain stable SQL
-- function runs with the caller's rights — so RLS does the access control
-- and there's no privilege to escalate. A member calling it would simply
-- get their own row back, which is harmless and true.

create or replace function programming.get_last_session_dates(user_ids uuid[])
returns table (user_id uuid, last_completed_at timestamptz)
language sql
stable
set search_path = programming
as $$
  select distinct on (sc.user_id) sc.user_id, sc.completed_at
  from programming.session_completions sc
  where sc.user_id = any(user_ids)
  order by sc.user_id, sc.completed_at desc;
$$;

grant execute on function programming.get_last_session_dates(uuid[]) to authenticated;

-- New function — PostgREST needs the usual nudge before it's callable:
-- NOTIFY pgrst, 'reload schema';
