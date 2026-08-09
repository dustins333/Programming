-- Lets a weekly check-in question (template or per-client) be a multiple
-- choice / radio-button question instead of free text, and optionally mark
-- one option as a "booking trigger" -- when a client's answer matches it,
-- the app offers to book a session on Terra's GHL calendar right after
-- submit (the "Loom or Zoom" question). Generic on purpose (any single-
-- choice question can carry a booking trigger), not hardcoded to this one
-- question's wording, since question text/options are coach-authored data,
-- not something this schema should know about.
--
-- `options` is only meaningful when question_type = 'single_choice';
-- `booking_option`, when set, must be one of `options` (enforced app-side,
-- not a DB constraint -- jsonb array membership isn't a cheap check
-- constraint and this mirrors how the rest of this schema treats
-- coach-authored config, e.g. session_days on group_programs).
--
-- These are public.* tables (the standalone Nutrition Tracker app's own
-- checkin_template_questions/client_checkin_questions -- Kova's nutrition
-- module reads/writes them directly, see CLAUDE.md's "Nutrition rebuilt
-- against the standalone app's live tables"), NOT nutrition.* (that schema
-- is dead/unused). Same backward-compatible-additive-columns precedent as
-- 0031/0033: new nullable/defaulted columns, the standalone app's own
-- inserts are unaffected since they never set them.
alter table public.checkin_template_questions
  add column question_type text not null default 'text' check (question_type in ('text', 'single_choice')),
  add column options jsonb,
  add column booking_option text;

alter table public.client_checkin_questions
  add column question_type text not null default 'text' check (question_type in ('text', 'single_choice')),
  add column options jsonb,
  add column booking_option text;

notify pgrst, 'reload schema';
