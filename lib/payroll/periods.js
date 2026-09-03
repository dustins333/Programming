// Pay periods are computed from a single anchor date + a fixed 14-day
// cadence (every one of the ~30 real historical Glide periods lands exactly
// 14 days apart) rather than a pre-seeded, manually-maintained calendar —
// see 0036_payroll_schema.sql's header for the full "why". A period only
// gets a real payroll.pay_periods row once something references it
// (ensurePayPeriod, called before any entry/request/finalization write);
// most periods never need one at all until they're closed.
import { payroll, core } from "../supabase/client";
import { getSetting } from "../settings";
import { todayInBoise, addDays } from "../boiseDate";
import { isLocked } from "./finalizations";

const PERIOD_LENGTH_DAYS = 14;
const DEFAULT_ANCHOR = "2025-10-02";

function daysBetween(fromDate, toDate) {
  const from = new Date(fromDate + "T00:00:00");
  const to = new Date(toDate + "T00:00:00");
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

// Every date belongs to exactly one 14-day period starting from the anchor.
export function computePeriodStart(dateString, anchorDate = DEFAULT_ANCHOR) {
  const offset = daysBetween(anchorDate, dateString);
  const periodIndex = Math.floor(offset / PERIOD_LENGTH_DAYS);
  return addDays(anchorDate, periodIndex * PERIOD_LENGTH_DAYS);
}

export function computePeriodEnd(periodStart) {
  return addDays(periodStart, PERIOD_LENGTH_DAYS - 1);
}

export async function getPeriodAnchor() {
  return getSetting("payroll_period_anchor_date", DEFAULT_ANCHOR);
}

export async function getCurrentPeriodStart(today = todayInBoise()) {
  const anchor = await getPeriodAnchor();
  return computePeriodStart(today, anchor);
}

// Lazily creates the stub row for a period the first time anything needs to
// reference it (FK requirement on pay_entries/custom_requests/finalizations)
// — this is what lets pay_periods stay unseeded until a period is actually
// used. Safe to call repeatedly (upsert, no-op if it already exists).
export async function ensurePayPeriod(periodStart) {
  const { error } = await payroll.rpc("ensure_pay_period", { p_start: periodStart });
  if (error) throw error;
}

export async function listPayPeriods() {
  const { data, error } = await payroll.from("pay_periods").select("*").order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPayPeriod(periodStart) {
  const { data, error } = await payroll.from("pay_periods").select("*").eq("start_date", periodStart).maybeSingle();
  if (error) throw error;
  return data;
}

export function isPeriodClosed(periodRow) {
  return Boolean(periodRow?.closed);
}

// Admin-only per RLS — hard, audit-grade close. Once this is set, RLS
// blocks all writes to that period's entries/requests/finalizations for
// everyone, including admin; there is deliberately no "reopen the whole
// period" path in the app.
export async function closePayPeriod(periodStart, closedByUserId) {
  await ensurePayPeriod(periodStart);
  const { error } = await payroll
    .from("pay_periods")
    .update({ closed: true, closed_at: new Date().toISOString(), closed_by: closedByUserId })
    .eq("start_date", periodStart);
  if (error) throw error;
}

// Period picker options for report screens — the current computed period
// always appears even if it has no real payroll.pay_periods row yet (a
// coach with zero entries logged this period never triggered
// ensurePayPeriod), merged with every real historical/current row.
export async function listPayPeriodOptions() {
  const currentStart = await getCurrentPeriodStart();
  const rows = await listPayPeriods();
  const byStart = new Map(rows.map((r) => [r.start_date, r]));
  if (!byStart.has(currentStart)) {
    byStart.set(currentStart, { start_date: currentStart, end_date: computePeriodEnd(currentStart), label: null, closed: false });
  }
  return Array.from(byStart.values()).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
}

// Every coach/admin currently on staff, for the "who hasn't finalized"
// admin view — mirrors the plain unfiltered listMembers()-style fetch this
// codebase already uses for other whole-roster admin screens.
export async function listStaff() {
  const { data, error } = await core.from("users").select("*").in("role", ["admin", "coach"]).order("name");
  if (error) throw error;
  return data;
}

// Computed once at close time (owner = admin-role entries, staff =
// everyone else) and stored read-only from then on — a closed period's
// entries can never change again (RLS blocks writes), so recomputing this
// live on every view would be pure overhead, not more correct.
export async function savePeriodClosingSnapshot(periodStart, { ownerPay, staffPay }) {
  const { error } = await payroll
    .from("pay_periods")
    .update({ owner_pay: ownerPay, staff_pay: staffPay })
    .eq("start_date", periodStart);
  if (error) throw error;
}

// The one number with no other source of truth — typed once by the admin
// after reviewing the CSV export, any time after a period closes.
export async function updatePeriodTaxes(periodStart, taxesPaid) {
  const { error } = await payroll.from("pay_periods").update({ taxes_paid: taxesPaid }).eq("start_date", periodStart);
  if (error) throw error;
}

// Filters the already-fetched listPayPeriods() result rather than a second
// query — every call site that needs this also already has (or can cheaply
// get) the full period list.
export function listClosedPeriods(periods) {
  return (periods || []).filter((p) => p.closed);
}

// Which periods a write can actually land in — the client-side mirror of
// 0036's pay_entries write policies, so a period picker can never offer
// something the database will refuse.
//
// Admin (no finalizations passed) gets every open period. A coach
// additionally loses any period they have an outstanding finalization on,
// which is the same `not exists (... finalized and not since reopened)`
// clause the coach insert/update/delete policies carry. Deliberately not
// limited to "periods I already finalized and had sent back", which is what
// the Log tab used to offer: a period nobody has finalized yet is open for
// writing, and the common case is exactly that — adding a missed line item
// to the period being reviewed while today already sits in the next one.
export function listWritablePeriods(periods, finalizations = null) {
  const open = (periods || []).filter((p) => !p.closed);
  if (!finalizations) return open;
  const lockedStarts = new Set(finalizations.filter(isLocked).map((f) => f.pay_period_start));
  return open.filter((p) => !lockedStarts.has(p.start_date));
}

// Pin a date inside a pay period. Money dated outside the period it is
// actually paid in reads wrong on every day-level view and in the CSV
// export — which happens for real whenever something is recorded days
// after the period it belongs to ended (approving a late custom request,
// keying in a cleaner's total at review time), because "today" by then
// sits in the NEXT period.
//
// Shared rather than copied: this file already owns every other piece of
// period arithmetic, and two copies of a money-dating rule is how they
// drift apart.
export function clampToPeriod(dateString, periodStart) {
  const periodEnd = computePeriodEnd(periodStart);
  if (dateString < periodStart) return periodStart;
  if (dateString > periodEnd) return periodEnd;
  return dateString;
}
