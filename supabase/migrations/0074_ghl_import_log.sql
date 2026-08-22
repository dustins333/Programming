-- A record that a GHL new-client webhook arrived, what it carried, and
-- whether it landed — plus enough to replay one that didn't.
--
-- Why this exists: import-client is fire-and-forget from GHL's side. GHL's
-- webhook action surfaces nothing on a non-2xx (that is already why the
-- ghl_contact_id collision path returns 200 with a warning rather than a
-- 500), so before this table a failed import was only discoverable by
-- noticing, later, that someone was missing from the Clients list. With
-- 140-200 clients still to migrate through that path, "noticing" is not a
-- detection mechanism.
--
-- Shape is lifted from the sibling Safety Fair project's public.entries
-- (ghl_sync_status / ghl_sync_error / unique dedupe_key + a retry pass),
-- adapted for the opposite direction: Safety Fair PUSHES to GHL and retries
-- by re-pushing, Kova RECEIVES from GHL and can only retry by replaying the
-- payload it was sent — hence `payload`, which is the whole point of the
-- table and not just an audit nicety.
--
-- One row per client, not one per delivery. dedupe_key is the email (which
-- is the identity import-client actually resolves on — createUser is by
-- email, and core.users.id comes from the auth row) so a GHL automation
-- that fires the same contact twelve times leaves one row with attempts=12
-- rather than twelve rows to read past. "Did this person's import work?"
-- is the operational question, and it is per-person.
create table core.ghl_import_log (
  id uuid primary key default gen_random_uuid(),

  -- lower(email), or `payload:<sha-256>` when the payload carried no email
  -- at all (a malformed webhook still deserves a record).
  dedupe_key text not null unique,

  email text,
  name text,
  ghl_contact_id text,
  -- Set once the import lands. ON DELETE SET NULL, not CASCADE: if the
  -- account is later removed, the fact that the import happened is still
  -- true and still worth being able to read.
  user_id uuid references core.users (id) on delete set null,

  --   imported — account exists and carries its contact id. Nothing to do.
  --   partial  — account exists but has NO contact id, because that id
  --              already belonged to someone else. They cannot receive an
  --              SMS registration code, so this needs attention even though
  --              the import "worked".
  --   failed   — nothing landed. Retry.
  status text not null check (status in ('imported', 'partial', 'failed')),
  error text,

  -- The raw webhook body, so a retry replays exactly what GHL sent instead
  -- of asking Terra to re-fire the automation. Read only by the retry Edge
  -- Function under the service role — see the read policy below.
  payload jsonb not null,

  attempts integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  -- When it first reached 'imported'. Cleared if it ever regresses, so this
  -- can never claim a currently-broken import is fine.
  resolved_at timestamptz,
  last_retried_at timestamptz,
  retried_by uuid references core.users (id) on delete set null
);

-- The only two queries this table has: "what needs attention" and "show me
-- the recent history".
create index ghl_import_log_status_idx on core.ghl_import_log (status);
create index ghl_import_log_last_received_idx on core.ghl_import_log (last_received_at desc);

alter table core.ghl_import_log enable row level security;

-- Admin-only, and only select. Deliberately narrower than core.is_staff():
-- `payload` is GHL's raw contact body, which can carry a phone number and
-- address that no coach-facing screen shows, and RLS cannot scope a policy
-- to a subset of columns. Terra is the person running the migration and the
-- only person who would ever retry one.
--
-- No insert/update/delete policies at all — every write goes through
-- import-client / retry-ghl-import under the service role, which bypasses
-- RLS. Same reasoning as core.registration_codes (0026), which has no
-- policies whatsoever; this one needs the read half for the retry UI.
create policy "admin can read ghl import log"
  on core.ghl_import_log for select
  using (core.is_admin());

-- Upsert-with-increment in one statement. attempts = attempts + 1 cannot be
-- expressed through supabase-js's .upsert(), and a read-then-write from the
-- Edge Function would race: GHL has already been observed firing twelve
-- concurrent webhooks at this endpoint during a bulk import.
--
-- Not SECURITY DEFINER: only the service role calls it, and the service
-- role already bypasses RLS. search_path is pinned anyway, matching every
-- other function in this project.
create function core.record_ghl_import(
  p_dedupe_key text,
  p_email text,
  p_name text,
  p_ghl_contact_id text,
  p_user_id uuid,
  p_status text,
  p_error text,
  p_payload jsonb,
  p_is_retry boolean default false,
  p_retried_by uuid default null
) returns uuid
language plpgsql
set search_path = core, public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into core.ghl_import_log as l (
    dedupe_key, email, name, ghl_contact_id, user_id, status, error, payload,
    resolved_at, last_retried_at, retried_by
  ) values (
    p_dedupe_key, p_email, p_name, p_ghl_contact_id, p_user_id, p_status, p_error, p_payload,
    case when p_status = 'imported' then now() end,
    case when p_is_retry then now() end,
    case when p_is_retry then p_retried_by end
  )
  on conflict (dedupe_key) do update set
    email = coalesce(excluded.email, l.email),
    name = coalesce(excluded.name, l.name),
    -- coalesce, not excluded: a later webhook that omits the contact id must
    -- not blank one we already resolved.
    ghl_contact_id = coalesce(excluded.ghl_contact_id, l.ghl_contact_id),
    user_id = coalesce(excluded.user_id, l.user_id),
    status = excluded.status,
    error = excluded.error,
    payload = excluded.payload,
    attempts = l.attempts + 1,
    last_received_at = now(),
    -- Keep the original resolution time if it was already good; clear it if
    -- this attempt regressed, so resolved_at never contradicts status.
    resolved_at = case when excluded.status = 'imported' then coalesce(l.resolved_at, now()) end,
    last_retried_at = case when p_is_retry then now() else l.last_retried_at end,
    retried_by = case when p_is_retry then p_retried_by else l.retried_by end
  returning l.id into v_id;

  return v_id;
end;
$$;

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide, and USAGE on the
-- schema is separate again (0039 exists because that half was missed once).
grant usage on schema core to anon, authenticated, service_role;
grant all on all tables in schema core to anon, authenticated, service_role;
grant all on all sequences in schema core to anon, authenticated, service_role;
grant execute on function core.record_ghl_import(text, text, text, text, uuid, text, text, jsonb, boolean, uuid) to service_role;

-- New table/function need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
