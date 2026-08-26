-- Staff documents: SOPs, employment agreements — anything a coach has to
-- read, and usually sign.
--
-- ASSIGNMENT IS MANUAL, not derived from a coach's permission flags. The
-- original ask was "mark a coach as nutrition and the nutrition SOP pops
-- up for them", but the only staff-type concept this app has is the four
-- can_view_* / can_log_ops_hours toggles (0015/0036), and those are
-- capability switches, not job titles — tying "who signs what" to "what
-- screens you can see" would drift apart the first time someone needs one
-- without the other. Terra's call: one admin page where she assigns each
-- document to specific people. That also covers the individualized case
-- (an employment agreement carrying one person's rate) for free, which a
-- type-based rule never could.
--
-- Staff-only in every direction. There is NO member policy, not even
-- select — same reasoning as programming.client_limitations (0057) and
-- programming.session_education (0079).

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
-- `body` is plain text, pasted in from wherever the document was actually
-- written (Terra drafts these in Word/Docs). Deliberately not a PDF
-- upload: every real user is on the PWA, and a PDF on a phone is worse
-- than text that reflows.
--
-- TWO version counters, and the difference between them is the whole
-- point of this table:
--   version                  bumps on EVERY save, so each snapshot in
--                            document_versions is distinct and a signature
--                            can point at the exact text agreed to.
--   signature_required_since the version at which existing signatures were
--                            last invalidated. Only moves when the admin
--                            picks "requires re-signature" on save.
-- A signature counts iff signed_version >= signature_required_since.
-- Fixing a typo (version 1->2, required_since stays 1) leaves everyone
-- signed; changing the actual policy (version 2->3, required_since 3)
-- drops it back into everyone's pending list — with no bulk write over the
-- signature rows, and without destroying the record of what each person
-- signed the first time.
create table if not exists programming.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  -- False = reference material. Shows up in their list to read, never asks
  -- for a signature and never sits in Pending.
  requires_signature boolean not null default true,
  version integer not null default 1 check (version >= 1),
  signature_required_since integer not null default 1 check (signature_required_since >= 1),
  -- Retiring a document is a soft archive: it stops being assignable and
  -- drops out of everyone's Pending, but anyone who already signed it keeps
  -- it in Completed. A hard delete is allowed only while nothing has been
  -- signed (enforced in the UI, since the FKs below would happily cascade
  -- signatures away).
  archived boolean not null default false,
  created_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_active_idx
  on programming.documents (archived, title);

-- ---------------------------------------------------------------------
-- document_versions — immutable snapshot per save
-- ---------------------------------------------------------------------
-- Without this, a signature would point at text that has since changed,
-- which defeats the point of recording it at all.
create table if not exists programming.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references programming.documents (id) on delete cascade,
  version integer not null,
  title text not null,
  body text not null,
  -- True when THIS save is the one that invalidated prior signatures.
  -- Display only — the live gate is documents.signature_required_since.
  -- It's what lets the admin's version history mark the right row.
  requires_resignature boolean not null default false,
  created_by uuid references core.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

-- ---------------------------------------------------------------------
-- document_assignments — who is being asked to read/sign this
-- ---------------------------------------------------------------------
create table if not exists programming.document_assignments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references programming.documents (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,
  assigned_by uuid references core.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (document_id, user_id)
);

create index if not exists document_assignments_user_idx
  on programming.document_assignments (user_id);

-- ---------------------------------------------------------------------
-- document_signatures — the record
-- ---------------------------------------------------------------------
-- signed_version is documents.version at the moment of signing; join it
-- back to document_versions for the exact text.
--
-- Unassigning someone does NOT touch this table, which is what makes
-- "completed stays there, even if that type is turned off" true: a coach's
-- Completed list is built from their signatures, never from their
-- assignments.
--
-- No update or delete policy for a coach — a signature is a record, not a
-- setting. Admin can delete one, which is the recovery path for a
-- mis-click (same reasoning as the check-in finalize undo).
create table if not exists programming.document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references programming.documents (id) on delete cascade,
  user_id uuid not null references core.users (id) on delete cascade,
  signed_version integer not null,
  -- What they actually typed. Free text rather than a copy of
  -- core.users.name on purpose: the record should say what the person
  -- wrote, and a profile name can change afterwards.
  typed_name text not null,
  signed_at timestamptz not null default now(),
  unique (document_id, user_id, signed_version)
);

create index if not exists document_signatures_user_idx
  on programming.document_signatures (user_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Non-recursive by construction: documents/document_versions reference
-- assignments+signatures in their policies, and neither of those
-- references documents back. The coach-side subqueries are all
-- `user_id = auth.uid()`, exactly matching those tables' own policies, so
-- applying their RLS inside these expressions changes nothing.

alter table programming.documents enable row level security;
alter table programming.document_versions enable row level security;
alter table programming.document_assignments enable row level security;
alter table programming.document_signatures enable row level security;

create policy "admin manage documents" on programming.documents
  for all using (core.is_admin()) with check (core.is_admin());

-- A coach sees a document if it's been assigned to them OR they've signed
-- it. Archived is deliberately NOT excluded here: retiring an SOP must not
-- erase it from the Completed list of everyone who signed it.
create policy "staff read assigned documents" on programming.documents
  for select using (
    core.is_staff()
    and (
      exists (
        select 1 from programming.document_assignments a
        where a.document_id = documents.id and a.user_id = auth.uid()
      )
      or exists (
        select 1 from programming.document_signatures s
        where s.document_id = documents.id and s.user_id = auth.uid()
      )
    )
  );

create policy "admin manage document versions" on programming.document_versions
  for all using (core.is_admin()) with check (core.is_admin());

-- A coach only needs the versions they personally signed — that's what
-- backs "here's the text you agreed to". The CURRENT text is already
-- denormalized onto documents, so this policy doesn't need to expose it.
create policy "staff read signed document versions" on programming.document_versions
  for select using (
    core.is_staff()
    and exists (
      select 1 from programming.document_signatures s
      where s.document_id = document_versions.document_id
        and s.user_id = auth.uid()
        and s.signed_version = document_versions.version
    )
  );

create policy "admin manage document assignments" on programming.document_assignments
  for all using (core.is_admin()) with check (core.is_admin());

create policy "staff read own document assignments" on programming.document_assignments
  for select using (core.is_staff() and user_id = auth.uid());

create policy "admin manage document signatures" on programming.document_signatures
  for all using (core.is_admin()) with check (core.is_admin());

create policy "staff read own document signatures" on programming.document_signatures
  for select using (core.is_staff() and user_id = auth.uid());

-- Signing requires a live assignment: someone unassigned keeps what they
-- already signed but can't newly sign, and a re-signature after a version
-- bump only applies to people still assigned.
create policy "staff sign own documents" on programming.document_signatures
  for insert with check (
    core.is_staff()
    and user_id = auth.uid()
    and exists (
      select 1 from programming.document_assignments a
      where a.document_id = document_signatures.document_id and a.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on programming.documents to authenticated;
grant select, insert, update, delete on programming.document_versions to authenticated;
grant select, insert, update, delete on programming.document_assignments to authenticated;
grant select, insert, update, delete on programming.document_signatures to authenticated;

-- New tables — PostgREST needs the usual nudge before they're reachable:
-- NOTIFY pgrst, 'reload schema';

-- Rollback:
--   drop table if exists programming.document_signatures;
--   drop table if exists programming.document_assignments;
--   drop table if exists programming.document_versions;
--   drop table if exists programming.documents;
