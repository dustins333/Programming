-- The pillar a coach locks in when she saves a strategy session.
--
-- Kova's four pillars (Strength / performance, Body comp / aesthetics,
-- Weight loss, General health), plus 'not_sure' for a coach who genuinely
-- can't call it yet. The AI SUGGESTS one on the session screen; this column
-- holds what the coach actually chose, which is the point: a saved pillar is
-- a coaching decision, never an unreviewed AI guess. The save function
-- requires it, so every session saved from here on has one.
--
-- Nullable because sessions saved before this column existed have none.
-- The CHECK is the whole vocabulary on purpose: these keys are written into
-- the GHL note and read back by the next summary, so a typo'd key would
-- silently become a fifth pillar.

alter table programming.strategy_sessions
  add column if not exists pillar text
  check (pillar in ('strength', 'body_comp', 'weight_loss', 'general_health', 'not_sure'));

notify pgrst, 'reload schema';
