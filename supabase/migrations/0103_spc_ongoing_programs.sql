-- 0103_spc_ongoing_programs.sql
--
-- Ongoing programs, from the SPC rework design handoff
-- (design_handoff_spc_rework_v1): a sessions-format program can run with NO
-- end date instead of a fixed week count — "runs until you set an end date".
-- Represented as an active block with block_end_date NULL; no new column.
-- An ongoing program never turns Due soon / Due now (it has no clock), and
-- the member's visibility is unaffected either way — 0102's member policies
-- gate on block_start_date only.
--
-- Only the sessions format may be ongoing: a weekly block's calendar IS its
-- authored week grid, so "no end" is meaningless there, and keeping the old
-- guarantee for weekly rows means none of the legacy code paths can ever
-- meet a dateless active block.
--
-- block_length_weeks stays NOT NULL (default 4) on an ongoing block — it is
-- simply unread while block_end_date is null, and becomes meaningful again
-- if the coach later sets an end date.
--
-- Run in the Supabase SQL Editor (or supabase db query --linked -f), then:
--   NOTIFY pgrst, 'reload schema';

alter table programming.spc_blocks drop constraint spc_blocks_active_has_dates;
alter table programming.spc_blocks add constraint spc_blocks_active_has_dates
  check (
    status = 'draft'
    or (block_start_date is not null and (block_end_date is not null or format = 'sessions'))
  );
