-- Coach-controlled "send to client" gate for nutrition onboarding. Before
-- this, a brand-new-to-nutrition client could immediately see/act on
-- whatever the coach had set up (questionnaire questions, tracking dates)
-- the moment their public.clients row existed — no chance for the coach to
-- finish configuring things first. Kova has no client_drafts staging table
-- like the standalone Nutrition Tracker app does, so this is a plain
-- per-client flag instead.
--
-- default now() means every pre-existing row (and any insert that doesn't
-- explicitly set this column, including the standalone app's own client
-- creation path, which knows nothing about this concept) is treated as
-- "already sent" — the historical behavior, unaffected. Only Kova's own
-- brand-new-to-nutrition insert path (lib/nutrition/clients.js) explicitly
-- passes null to opt into the "held back until sent" behavior.
alter table public.clients
  add column if not exists onboarding_sent_at timestamptz default now();
