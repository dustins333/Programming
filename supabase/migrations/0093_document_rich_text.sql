-- Staff documents keep their formatting on paste.
--
-- 0092 stored `body` as plain text, which loses exactly what a pasted SOP
-- carries: bullets, bold, underline, headings. Terra writes these in
-- Word/Docs and pastes them in, so dropping the formatting on the way in
-- makes the whole workflow worse than the Google Doc it came from.
--
-- `body_format` rather than a new column or a table: the content still
-- lives in `body`, this just says how to read it. Defaulting to 'text'
-- means every row written before this migration keeps rendering exactly as
-- it does today with no backfill and no conversion pass — a document only
-- becomes 'html' the next time someone actually edits it.
--
-- The stored HTML is whitelist-sanitized (lib/richText.js) on the way in
-- AND again on the way out. Authorship is admin-only and the audience is
-- staff-only, so this is defence in depth rather than the only thing
-- standing between a stranger and the renderer.

alter table programming.documents
  add column if not exists body_format text not null default 'text'
  check (body_format in ('text', 'html'));

-- Version snapshots have to record the format they were written in, or an
-- old plain-text version would render as HTML (or vice versa) once the live
-- document's format changed underneath it — and the whole point of a
-- snapshot is that it still reads the way it did when someone signed it.
alter table programming.document_versions
  add column if not exists body_format text not null default 'text'
  check (body_format in ('text', 'html'));

-- NOTIFY pgrst, 'reload schema';

-- Rollback:
--   alter table programming.documents drop column if exists body_format;
--   alter table programming.document_versions drop column if exists body_format;
