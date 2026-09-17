-- Custom pay requests: the day the money is for.
--
-- Until now a request carried only a pay_period_start, and approving it
-- dated the linked pay entry `clampToPeriod(todayInBoise(), period)` — i.e.
-- today, pinned into whatever period the request was filed against. There
-- was no way to say "pay this in a different cycle", so a $2,000 owner-pay
-- request filed and approved on the same day could only ever land in the
-- period today happens to sit in. That is exactly what happened on
-- 2026-09-17, and it is the reason this column exists.
--
-- Nullable on purpose: every historical row keeps working, and a null still
-- means the old behaviour (today, clamped into the request's period). The
-- period a request belongs to stays denormalised on pay_period_start rather
-- than being derived from this date at read time — the RLS closed-period
-- checks, the dedup index and the close-period gate all key on it, and the
-- two are kept in step in lib/payroll/requests.js.
alter table payroll.custom_requests add column if not exists entry_date date;

comment on column payroll.custom_requests.entry_date is
  'Boise-local day this request is paid on; null falls back to the decision date clamped into pay_period_start. Always inside pay_period_start''s 14 days.';

-- Backfill from what was actually paid, so a request decided before this
-- column existed shows the same day its pay entry carries rather than a
-- blank. Only touches approved requests with a surviving linked entry.
update payroll.custom_requests r
set entry_date = e.entry_date
from payroll.pay_entries e
where r.pay_entry_id = e.id
  and r.entry_date is null;
