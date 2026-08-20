// 1:1 Nutrition billing-day assignments — rebuilt against real nutrition
// clients (public.clients), replacing Glide's disconnected free-typed-name
// tracker that never actually fed into anyone's pay (every row had a blank
// pay period). A coach picks a real client from their own active roster and
// sets which day of the month that client's billing recurs; the finalize
// flow (lib/payroll/finalizations.js) uses this to auto-detect which
// clients' billing falls inside the current pay period.
import { payroll, core } from "../supabase/client";
import { getClient } from "../nutrition/clients";

export async function listOwnNutritionAssignments(coachId) {
  const { data, error } = await payroll
    .from("nutrition_assignments")
    .select("*")
    .eq("coach_id", coachId)
    .eq("active", true)
    .order("client_name");
  if (error) throw error;
  return data;
}

export async function addNutritionAssignment(coachId, client, billingDayOfMonth) {
  const { data: coachRow, error: coachError } = await core.from("users").select("name").eq("id", coachId).single();
  if (coachError) throw coachError;

  const { data, error } = await payroll
    .from("nutrition_assignments")
    .insert({
      coach_id: coachId,
      coach_name: coachRow.name,
      client_id: client.id,
      client_name: client.name,
      billing_day_of_month: billingDayOfMonth,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNutritionAssignment(id, fields) {
  const { error } = await payroll
    .from("nutrition_assignments")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function removeNutritionAssignment(id) {
  const { error } = await payroll.from("nutrition_assignments").update({ active: false }).eq("id", id);
  if (error) throw error;
}

// The actual calendar date within [periodStart, periodEnd] that matches a
// given billing day-of-month — so the resulting pay_entries.entry_date
// reflects when the client's billing really recurs, not just the period's
// end date. Returns null if it doesn't fall in range (shouldn't happen for
// anything assignmentsDueInPeriod already filtered in).
export function billingDateInPeriod(periodStart, periodEnd, billingDayOfMonth) {
  // All UTC. The old version walked device-local midnights and then
  // formatted with toISOString(), so on any device east of UTC the returned
  // date was a day early — and this feeds a real pay_entries.entry_date,
  // which could land outside [periodStart, periodEnd] entirely.
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDate() === billingDayOfMonth) return d.toISOString().slice(0, 10);
  }
  return null;
}

// Which of a coach's nutrition_assignments have a billing day that falls
// inside [periodStart, periodEnd] — the candidate list the finalize flow's
// roster-confirmation step is built from.
export function assignmentsDueInPeriod(assignments, periodStart, periodEnd) {
  // Same UTC walk as billingDateInPeriod above — the two must agree on
  // which dates a period contains.
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  return assignments.filter((a) => {
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDate() === a.billing_day_of_month) return true;
    }
    return false;
  });
}

// --- Billing detection, shared by My Pay and the finalize sheet ----------
//
// These used to live inside FinalizeModal, which meant the only place a
// coach could see that their 1:1 Nutrition clients were going to be paid
// was the sheet at the very end of the period. My Pay showed nothing, so a
// coach with nutrition clients spent a fortnight unable to tell whether it
// was working. Both screens now read the same three functions, so the
// amount previewed on My Pay and the amount the sheet bills can't drift.

// The other_rates row these billing entries are priced from. One constant
// so the rate lookup, the row that gets written, and the already-billed
// check can never name it differently.
export const NUTRITION_OTHER_TYPE = "1:1 Nutrition";

// pay_entries has no client_id column, so a billing row identifies its
// client only through this note. Building it in one place means the row we
// write and the row we look for are always the same string.
export function billingNoteFor(assignment) {
  return `${NUTRITION_OTHER_TYPE} — ${assignment.client_name} (billing day ${assignment.billing_day_of_month})`;
}

// Every assignment whose billing day lands inside this period, each tagged
// with the two things a caller needs to know about it:
//
//   alreadyBilled — a nutrition_billing row for it already exists on this
//     period. Finalizing is not once-ever (an admin can send a period back),
//     so without this a re-finalize would bill every confirmed client twice
//     and My Pay would preview money that's already counted.
//   inactive — the client is no longer active on nutrition. Paused and
//     cancelled clients shouldn't quietly keep generating pay, so these are
//     surfaced but never counted until the coach ticks them at finalize.
//
// `entries` is that period's pay_entries rows, which both callers already
// have in hand — passed in rather than re-fetched.
export async function listNutritionBillingForPeriod({ coachId, periodStart, periodEnd, entries }) {
  if (!coachId || !periodStart || !periodEnd) return [];
  const assignments = await listOwnNutritionAssignments(coachId);
  const due = assignmentsDueInPeriod(assignments, periodStart, periodEnd);
  if (due.length === 0) return [];

  const billedNotes = new Set(
    (entries || []).filter((e) => e.source === "nutrition_billing" && e.notes).map((e) => e.notes)
  );

  // One lookup per due client. A coach has a handful at most, and this is
  // deliberately the client's own status rather than "are they on my
  // roster" — a client reassigned to another coach is still active, and
  // the assignment that predates the move is still the coach's to decide on.
  const active = await Promise.all(
    due.map(async (a) => {
      try {
        const client = await getClient(a.client_id);
        return client?.status === "active";
      } catch {
        return false;
      }
    })
  );

  return due.map((assignment, i) => ({
    assignment,
    alreadyBilled: billedNotes.has(billingNoteFor(assignment)),
    inactive: !active[i],
  }));
}

// What My Pay previews: the not-yet-billed, still-active ones counted, and
// a separate count of any that need a decision. Pure, so the screen can
// recompute it without another round trip.
export function summarizeNutritionBilling(rows, rate) {
  const pending = (rows || []).filter((r) => !r.alreadyBilled);
  const counted = pending.filter((r) => !r.inactive);
  return {
    count: counted.length,
    needsCheck: pending.length - counted.length,
    amount: counted.length * (rate || 0),
  };
}
