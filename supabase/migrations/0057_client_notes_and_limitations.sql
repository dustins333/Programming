-- Coach notes and training limitations, per client.
--
-- design_handoff_coach_web_v2 screen 13 ("Your four": current/behind,
-- nutrition + check-in, notes, limitations). Neither existed in any form:
--   * programming.program_comments is coach-to-coach and keyed to a BLOCK,
--     so it can't hold "wants a 225 squat by December" — that outlives any
--     block and belongs to the person.
--   * programming.client_messages is a conversation WITH the client, so it
--     is the wrong place for a private observation about them.
--
-- Both tables are staff-only in every direction. A member must not be able
-- to read either one: these are the coach's own working notes, and a
-- limitation is a clinical-adjacent shorthand ("low back · watch loaded
-- flexion") written for a coach's eye, not a diagnosis to show a client.
-- There is deliberately no member-facing policy at all — not even select.
--
-- Notes are editable and deletable (unlike client_messages, which is an
-- immutable log) because a note is a living scratchpad, not a record of
-- something that was said to someone.

-- --------------------------------------------------------------------
-- Notes
-- --------------------------------------------------------------------
create table if not exists programming.client_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  author_id uuid references core.users (id) on delete set null,
  body text not null,
  -- One note can be pinned to the top of the card; nothing enforces "only
  -- one pinned" at the DB level because a coach pinning two is a coherent
  -- thing to want, and the card just renders pinned ones first.
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_notes_user_idx on programming.client_notes (user_id, pinned desc, created_at desc);

alter table programming.client_notes enable row level security;

create policy "staff manage client notes" on programming.client_notes
  for all using (core.is_staff()) with check (core.is_staff());

-- --------------------------------------------------------------------
-- Limitations
-- --------------------------------------------------------------------
-- `severity` drives the two tones in the design: avoid (rust — a hard no,
-- "no overhead") vs caution (amber — programmable with care, "watch loaded
-- flexion"). A free-text tone would drift; two named values won't.
create table if not exists programming.client_limitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  -- Body part / region, e.g. "Left shoulder".
  area text not null,
  -- What to do about it, e.g. "no overhead".
  guidance text not null,
  severity text not null default 'caution' check (severity in ('avoid', 'caution')),
  created_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_limitations_user_idx on programming.client_limitations (user_id, created_at desc);

alter table programming.client_limitations enable row level security;

create policy "staff manage client limitations" on programming.client_limitations
  for all using (core.is_staff()) with check (core.is_staff());

grant select, insert, update, delete on programming.client_notes to authenticated;
grant select, insert, update, delete on programming.client_limitations to authenticated;

-- New tables — PostgREST needs the usual nudge before they're reachable:
-- NOTIFY pgrst, 'reload schema';
