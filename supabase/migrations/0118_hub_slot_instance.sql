-- 0118_hub_slot_instance.sql
--
-- 0117 made "start a new one" reach the board, and then the board ran the
-- wrong session: it opened washed green with every lift already ticked,
-- because nothing on a board slot said WHICH of her completions it was
-- running.
--
-- On a LIVE board fetchHubBoard's `finalized` means "any completion for this
-- week" — its onBoardDay filter only applies in review mode, where a date is
-- passed. So a make-up, which by definition has an earlier completion for
-- that same week, always read as already finished. Same for the per-exercise
-- ticks. She would stand at the rack looking at a session the board believed
-- she had already done.
--
-- So the slot carries the instance it is running. Default 1, which is exactly
-- what every board has always done, so there is nothing to backfill and no
-- existing slot changes meaning. hub_open_makeup stamps the number onto the
-- slot itself — it already had to find that row to check she was on the
-- board, and the display account has no UPDATE policy on
-- hub_session_clients, so this cannot be a follow-up write from the app.
--
-- AND IT NO LONGER CREATES THE COMPLETION. 0117 wrote the second completion
-- the moment the board started, which is what made a make-up open washed
-- green: on a live board `finalized` is "a completion exists", so the session
-- was finished before she had touched a bar. It only reserves the number now;
-- the row is written when the coach finalizes, like every other session on
-- the board. The member's own My Week sheet still creates it up front, on
-- purpose — she is deep-linked straight into logging, and her week has to
-- count it immediately.
--
-- KNOWN AND NOT FIXED HERE: logged SETS still cannot be told apart within one
-- day. programming.logs carries no instance (0102's header explains why — it
-- is part of logs_unique_set_idx, which logResult's upsert infers against),
-- so a make-up done on the SAME DAY as the original shares that day's set
-- rows. A make-up of a session done earlier in the week — the actual use
-- case — is unaffected, because the board reads logs by date.
--
-- Rollback:
--   alter table programming.hub_session_clients drop column if exists instance;
--   -- then re-create hub_open_makeup from 0117.

alter table programming.hub_session_clients
  add column if not exists instance smallint not null default 1;

comment on column programming.hub_session_clients.instance is
  'Which completion of that session this board slot is running. 1 unless the coach answered "start a new one" (hub_open_makeup). The board scopes finalized-state and per-exercise ticks to it, so a make-up does not inherit the earlier session''s.';

-- Identical to 0117 apart from the update: the new instance is stamped onto
-- the slot she is on, so the board reads and writes against it.
create or replace function programming.hub_open_makeup(
  p_user_id uuid,
  p_spc_workout_id uuid,
  p_week_number smallint
)
returns smallint
language plpgsql
security definer
set search_path = programming, core, public
as $$
declare
  v_instance smallint;
begin
  if not (core.is_gym_display() or core.can_access_spc()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_spc_workout_id is null or p_week_number is null then
    return null;
  end if;

  if not exists (
    select 1
      from programming.hub_session_clients hc
      join programming.hub_sessions hs on hs.id = hc.hub_session_id
     where hs.ended_at is null
       and hc.removed_at is null
       and hc.user_id = p_user_id
       and hc.spc_workout_id = p_spc_workout_id
  ) then
    raise exception 'She is not on the board for that session.';
  end if;

  select max(sc.instance) into v_instance
    from programming.session_completions sc
   where sc.user_id = p_user_id
     and sc.spc_workout_id = p_spc_workout_id
     and sc.week_number = p_week_number;

  -- Nothing logged for that week: there is nothing to make up. The slot keeps
  -- instance 1 and the board behaves exactly as it always has.
  if v_instance is null then
    return null;
  end if;

  update programming.hub_session_clients hc
     set instance = v_instance + 1
    from programming.hub_sessions hs
   where hs.id = hc.hub_session_id
     and hs.ended_at is null
     and hc.removed_at is null
     and hc.user_id = p_user_id
     and hc.spc_workout_id = p_spc_workout_id;

  return (v_instance + 1)::smallint;
end;
$$;

revoke all on function programming.hub_open_makeup(uuid, uuid, smallint) from public;
grant execute on function programming.hub_open_makeup(uuid, uuid, smallint) to authenticated;

notify pgrst, 'reload schema';
