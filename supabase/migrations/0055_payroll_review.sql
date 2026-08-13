-- Payroll close: review -> approve / send back -> close.
--
-- design_handoff_coach_web_v2 screen 10. Before this, a pay period had
-- exactly two states per coach — finalized or not — plus an admin "reopen"
-- that silently unlocked their entries again. There was no way to record
-- that an admin had actually *looked* at a coach's numbers and agreed with
-- them, and no way to hand a period back with a reason attached ("your Ops
-- hours look doubled") short of texting them.
--
-- Three states now, all derived from these columns rather than stored as a
-- string, so an old row with none of them set still reads correctly as
-- "submitted, not yet reviewed":
--
--   Not submitted   finalized_at is null (or older than reopened_at)
--   Submitted       finalized newer than every review stamp
--   Approved        approved_at newer than finalized_at
--   Sent back       sent_back_at newer than finalized_at
--
-- Deliberately timestamps rather than a status enum: the coach re-finalizes
-- after a send-back, and comparing "which happened last" is what makes that
-- return the row to Submitted with no extra clearing step to forget. The
-- RPC below clears the stamps anyway (belt and braces, and it keeps a
-- stale note from resurfacing), but the comparison is what the app trusts.
--
-- IMPORTANT — sending back must also set reopened_at/reopened_by. A
-- send-back that didn't would be cosmetic: pay_entries' own write policies
-- (0036) gate on the finalized/reopened comparison alone, so the coach
-- would read "fix your Ops hours" and still be locked out of editing them.
-- Rather than widen four RLS policies to know about a second unlock
-- column, the app writes both stamps in one update (see
-- sendBackFinalization in lib/payroll/finalizations.js) — a send-back
-- genuinely *is* a reopen, just one carrying a reason.
--
-- No new RLS policies needed: 0036's "admin manage finalizations" is a
-- `for all` policy already scoped to an open period, so an admin can write
-- these columns and — correctly — cannot once the period is closed. The
-- coach-side select policy already exposes their own row, which is what
-- lets a sent-back coach read the note.

alter table payroll.finalizations
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references core.users (id) on delete set null,
  add column if not exists sent_back_at timestamptz,
  add column if not exists sent_back_by uuid references core.users (id) on delete set null,
  add column if not exists send_back_note text;

-- Same body as 0036's, with the review stamps cleared on (re-)finalize.
-- Replacing rather than patching so the whole current definition lives in
-- one place — 0036's version is what this supersedes.
create or replace function payroll.finalize_own_period(p_period_start date)
returns void
language plpgsql
security definer
set search_path = payroll, core
as $$
declare
  v_name text;
  v_email text;
begin
  if payroll.is_period_closed(p_period_start) then
    raise exception 'This pay period is closed.';
  end if;

  select name, email into v_name, v_email from core.users where id = auth.uid();
  if v_name is null then
    raise exception 'No profile found for the current user.';
  end if;

  perform payroll.ensure_pay_period(p_period_start);

  insert into payroll.finalizations (user_id, staff_name, staff_email, pay_period_start, finalized_at)
  values (auth.uid(), v_name, v_email, p_period_start, now())
  on conflict (user_id, pay_period_start)
  do update set
    finalized_at = now(),
    staff_name = excluded.staff_name,
    staff_email = excluded.staff_email,
    approved_at = null,
    approved_by = null,
    sent_back_at = null,
    sent_back_by = null,
    send_back_note = null;
end;
$$;
