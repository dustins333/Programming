-- A backfilled month doesn't know its own roster size.
--
-- Two separate reasons, both real:
--
--   1. The 2025/2026 source tabs are the FINISHED crew lists — they contain
--      only the people who made it, so the total simply isn't in the data.
--      The backfill was storing roster_count = qualified_count, which
--      rendered as "88 committed of 88 total" and read as though every
--      member made it.
--   2. The 2024 tabs ARE the raw roster, but per the spec only people on the
--      CURRENT roster get imported — ~89 historical names belong to former
--      members and are dropped. So a 2024 "total" counts only the members
--      still with the gym today, and any percentage off it would be
--      survivorship-biased (the committed count is filtered the same way,
--      but the two biases don't cancel).
--
-- Nullable is the honest shape: NULL means "not knowable for this month",
-- which the UI renders as an em dash instead of inventing a number. Every
-- future upload carries the full Kilo export, so those are real.
alter table programming.ccrew_periods
  alter column roster_count drop not null;

comment on column programming.ccrew_periods.roster_count is
  'Total people in that month''s export. NULL for backfilled months: the 2025/2026 source tabs were already-filtered crew lists, and the 2024 tabs only survive as the subset of people still on the roster today.';

update programming.ccrew_periods
set roster_count = null
where source = 'backfill';
