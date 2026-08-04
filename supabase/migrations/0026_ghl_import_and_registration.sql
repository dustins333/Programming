-- GHL contact mapping: lets the registration-code flow text a member via
-- GoHighLevel's Conversations API using their contactId, instead of Kova
-- storing/managing a phone number itself — GHL stays the source of truth
-- for the actual number and SMS opt-out state. Nullable + unique (not
-- every core.users row comes from a GHL import — e.g. QA/admin accounts).
alter table core.users add column ghl_contact_id text unique;

-- One-time codes for the phone-verified self-registration flow: a member
-- is created ahead of time (silently, no password) by the GHL import
-- webhook, and proves phone ownership via an SMS code sent through GHL's
-- Conversations API. code_hash only, never the raw code, same reasoning
-- as any OTP/token table elsewhere.
--
-- Deliberately no RLS policies at all (not even a member-read-own policy)
-- — there is no legitimate direct client access pattern to this table,
-- every read/write happens through the request-registration-code /
-- verify-registration-code Edge Functions using the service role key.
create table core.registration_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index registration_codes_user_id_idx on core.registration_codes (user_id);

alter table core.registration_codes enable row level security;

-- Same Data-API permission dance as every schema-adding migration before
-- this one — GRANT is table-specific, not schema-wide. RLS (no policies)
-- is what actually locks this table down; the grant alone would otherwise
-- let anon/authenticated attempt queries that RLS then blankly denies.
grant all on all tables in schema core to anon, authenticated, service_role;
grant all on all sequences in schema core to anon, authenticated, service_role;

-- New column/table need the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
