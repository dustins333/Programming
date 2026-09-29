-- Strategy sessions get a fixed shape: Goal, Plan (bullets), Notes, all
-- client-facing, plus coach-only notes that never leave the coach side.
-- The same template for every session is what makes them classifiable
-- later; the free-text box they replace was different every time.
--
-- The GHL note is still ONE note per session: header, pillar, then these
-- sections in order. `notes` stays, and now holds that composed body (the
-- note minus its header and pillar line), so every existing reader of
-- `notes` (history's "show what was typed when GHL failed", the day list's
-- retry) keeps working unchanged. Sessions saved before this migration have
-- only `notes`; their new columns are null and the screen shows their text
-- in the Notes field.
--
-- texted_at / texted_body: after saving, the coach can text the client a
-- copy (Goal, Plan, Notes; never the pillar or coach-only notes). texted_body
-- is the exact message sent, so the screen can tell whether an edit changed
-- what she'd receive (offer to send again) or only touched coach-side fields
-- (don't).

alter table programming.strategy_sessions
  add column if not exists goal text,
  add column if not exists plan text[],
  add column if not exists client_notes text,
  add column if not exists coach_notes text,
  add column if not exists texted_at timestamptz,
  add column if not exists texted_body text;

notify pgrst, 'reload schema';
