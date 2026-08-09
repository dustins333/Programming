-- "Other" line items on My Entries always showed both a Quantity field and
-- a Notes field, and the type dropdown always showed the pay rate — three
-- things flagged as wrong in the same feedback pass: (1) some Other types
-- genuinely don't need a quantity (e.g. a flat one-time item) or don't need
-- notes, and that should be a per-type admin setting, not hardcoded; (2) the
-- pay rate shouldn't be listed here at all — staff can already see it on
-- their own paystub/report page, it doesn't need repeating on the entry
-- form. Both default true/unchanged so every existing type keeps behaving
-- exactly as it does today until an admin explicitly turns one off.
--
-- After running this, NOTIFY pgrst, 'reload schema'; in the SQL Editor —
-- new columns need this same as new tables (documented repeatedly in
-- CLAUDE.md, e.g. the SPC-titles and 0011 migrations).

alter table payroll.other_rates
  add column has_qty boolean not null default true,
  add column has_notes boolean not null default true;
