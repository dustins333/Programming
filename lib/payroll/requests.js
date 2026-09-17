// Custom pay requests — unifies "ask for a custom amount" and "get paid
// it" into one flow. Approving a request creates the linked pay_entries row
// directly (source: 'custom_request'), instead of a separate manual
// re-typing step — that manual step is exactly what caused a real $200 gap
// between an approved and an actually-paid amount in the Glide data this
// replaces.
import { payroll, core } from "../supabase/client";
import { ensurePayPeriod, clampToPeriod, computePeriodStart, getPeriodAnchor, getPayPeriod, isPeriodClosed, computePeriodEnd } from "./periods";
import { todayInBoise } from "../boiseDate";

async function snapshotStaff(userId) {
  const { data, error } = await core.from("users").select("name, email").eq("id", userId).single();
  if (error) throw error;
  return { staff_name: data.name, staff_email: data.email };
}

// Which period a chosen day is paid in. Reads the live anchor rather than
// assuming the default, same as every other period calculation in this
// module.
export async function periodStartFor(dateString) {
  const anchor = await getPeriodAnchor();
  return computePeriodStart(dateString, anchor);
}

export async function listOwnRequests(userId) {
  const { data, error } = await payroll
    .from("custom_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// (listPendingRequests, an unscoped "every pending request" fetch, was
// deleted with the staff-side approval queue — Admin View's Requests tab
// reads listAllRequests and buckets by status itself, and the close-period
// gate uses listPendingRequestsForPeriod below.)

export async function listAllRequests() {
  const { data, error } = await payroll.from("custom_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Powers the admin close-period hard block below, and the admin Requests
// tab's "pending this period" section.
export async function listPendingRequestsForPeriod(periodStart) {
  const { data, error } = await payroll
    .from("custom_requests")
    .select("*")
    .eq("pay_period_start", periodStart)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return data;
}

// The period is derived from the day rather than passed alongside it, so
// the two can never disagree — a request dated outside the period it is
// paid in reads wrong on every day-level view and in the CSV export.
export async function submitRequest(userId, entryDate, description, amountRequested) {
  const periodStart = await periodStartFor(entryDate);
  await ensurePayPeriod(periodStart);
  const snapshot = await snapshotStaff(userId);
  const { data, error } = await payroll
    .from("custom_requests")
    .insert({
      user_id: userId,
      ...snapshot,
      pay_period_start: periodStart,
      entry_date: entryDate,
      description,
      amount_requested: amountRequested,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelOwnPendingRequest(requestId) {
  const { error } = await payroll.from("custom_requests").delete().eq("id", requestId);
  if (error) throw error;
}

// Admin action: approving directly creates the linked pay_entries row at
// the approved amount, and links it back via pay_entry_id — one write,
// no drift possible. Not a DB transaction (this codebase's established
// convention is plain sequential writes, not stored procedures for
// multi-step actions) — if the second write fails, the pay_entries row is
// harmlessly orphaned rather than the request silently staying unpaid.
export async function approveRequest(request, approvedAmount, adminUserId, adminNotes = null, entryDate = null) {
  const staffSnapshot = { staff_name: request.staff_name, staff_email: request.staff_email };
  // Three sources for the day, in order: what the admin picked on the
  // approval card, what the coach asked for when they filed it, and — only
  // for rows that predate entry_date existing — the old behaviour of today
  // clamped into the request's own period.
  const chosenDate = entryDate || request.entry_date || clampToPeriod(todayInBoise(), request.pay_period_start);
  // An approval can move a request into a different period, which is the
  // whole point of picking a day: a request filed today for owner pay due
  // next cycle has to leave the period it was filed against. The period is
  // recomputed from the day rather than trusted from the row, so the entry
  // and the request can never end up in different fortnights.
  const periodStart = await periodStartFor(chosenDate);
  if (isPeriodClosed(await getPayPeriod(periodStart))) {
    throw new Error(`That pay period (${periodStart} \u2013 ${computePeriodEnd(periodStart)}) is closed, so nothing can be paid into it.`);
  }
  await ensurePayPeriod(periodStart);
  const { data: entry, error: entryError } = await payroll
    .from("pay_entries")
    .insert({
      user_id: request.user_id,
      ...staffSnapshot,
      pay_period_start: periodStart,
      // Boise-local, never the UTC date — an approval after ~5pm Boise used
      // to stamp tomorrow. The fallback above still clamps into the
      // request's period for the same reason at a coarser scale: an entry
      // dated outside the period it is paid in reads wrong on every
      // day-level view and in the CSV export.
      entry_date: chosenDate,
      custom_amt: approvedAmount,
      custom_description: request.description,
      source: "custom_request",
    })
    .select()
    .single();
  if (entryError) throw entryError;

  const { error: reqError } = await payroll
    .from("custom_requests")
    .update({
      status: "approved",
      approved_amount: approvedAmount,
      // Kept in step with the entry it just wrote, so the request's own
      // history row and the close-period gate both agree about which
      // fortnight this belongs to.
      pay_period_start: periodStart,
      entry_date: chosenDate,
      admin_notes: adminNotes,
      decided_by: adminUserId,
      decided_at: new Date().toISOString(),
      pay_entry_id: entry.id,
    })
    .eq("id", request.id);
  if (reqError) throw reqError;

  return entry;
}

export async function denyRequest(requestId, adminUserId, adminNotes = null) {
  const { error } = await payroll
    .from("custom_requests")
    .update({
      status: "denied",
      admin_notes: adminNotes,
      decided_by: adminUserId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw error;
}
