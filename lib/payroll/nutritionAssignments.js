// 1:1 Nutrition billing-day assignments — rebuilt against real nutrition
// clients (public.clients), replacing Glide's disconnected free-typed-name
// tracker that never actually fed into anyone's pay (every row had a blank
// pay period). A coach picks a real client from their own active roster and
// sets which day of the month that client's billing recurs; the finalize
// flow (lib/payroll/finalizations.js) uses this to auto-detect which
// clients' billing falls inside the current pay period.
import { payroll, core } from "../supabase/client";

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
  const start = new Date(periodStart + "T00:00:00");
  const end = new Date(periodEnd + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDate() === billingDayOfMonth) return d.toISOString().slice(0, 10);
  }
  return null;
}

// Which of a coach's nutrition_assignments have a billing day that falls
// inside [periodStart, periodEnd] — the candidate list the finalize flow's
// roster-confirmation step is built from.
export function assignmentsDueInPeriod(assignments, periodStart, periodEnd) {
  const start = new Date(periodStart + "T00:00:00");
  const end = new Date(periodEnd + "T00:00:00");
  return assignments.filter((a) => {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDate() === a.billing_day_of_month) return true;
    }
    return false;
  });
}
