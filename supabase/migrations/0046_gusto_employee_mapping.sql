-- Gusto employee mapping: lets a Claude Code skill push each coach's
-- Kova-computed payroll total into Gusto's Commission line, and later
-- read tax totals back, by knowing which Gusto employee_uuid a given
-- core.users row corresponds to. Gusto has no self-serve developer API
-- for Kova's own backend to integrate against directly (Embedded Payroll
-- access is a real partner-application process, not a sign-up-for-a-key
-- flow) — the actual mechanism is a Claude<->Gusto MCP connector Terra
-- authorized once, driven by a skill on request, not live app code. This
-- column is just the mapping table that skill reads. Nullable + unique,
-- same reasoning as ghl_contact_id (0026) — most core.users rows (real
-- clients, QA accounts) have no Gusto employee at all.
alter table core.users add column gusto_employee_uuid text unique;

-- New column needs the usual PostgREST schema-cache nudge —
-- NOTIFY pgrst, 'reload schema'; in the SQL Editor right after running this.
