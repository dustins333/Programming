import { payroll, core } from "../supabase/client";
import { ensurePayPeriod } from "./periods";

// One coach's entries for a period.
//
// staffEmail is not optional in practice: every pay entry imported from
// Glide carries staff_name/staff_email but NO user_id (those accounts didn't
// exist in Kova yet), and that's the majority of the historical table. A
// user_id-only filter therefore showed a coach an empty pay stub for every
// period before cutover — while the admin's all-staff view, which keys on
// `user_id ?? staff_email` (calc.js's computeTotalsByStaff), showed those
// same rows correctly. Matching on either identity is what makes the two
// agree.
export async function listEntriesForPeriod(userId, periodStart, staffEmail) {
  let query = payroll.from("pay_entries").select("*").eq("pay_period_start", periodStart);
  // The email is double-quoted so a value containing a comma or parenthesis
  // can't be read as more or() branches.
  query = staffEmail
    ? query.or(`user_id.eq.${userId},staff_email.eq."${staffEmail.replace(/"/g, '')}"`)
    : query.eq("user_id", userId);
  const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Admin all-employee report / audit views — every entry for a period,
// regardless of whose it is.
export async function listEntriesForPeriodAllStaff(periodStart) {
  const { data, error } = await payroll
    .from("pay_entries")
    .select("*")
    .eq("pay_period_start", periodStart);
  if (error) throw error;
  return data;
}

async function snapshotStaff(userId) {
  const { data, error } = await core.from("users").select("name, email").eq("id", userId).single();
  if (error) throw error;
  return { staff_name: data.name, staff_email: data.email };
}

// `source` defaults to coach_entry (a plain logged row); custom-request
// approval and nutrition-billing finalize both pass their own source value
// so the row's origin stays traceable.
export async function createEntry(userId, periodStart, fields, source = "coach_entry") {
  await ensurePayPeriod(periodStart);
  const snapshot = await snapshotStaff(userId);
  const { data, error } = await payroll
    .from("pay_entries")
    .insert({
      user_id: userId,
      ...snapshot,
      pay_period_start: periodStart,
      source,
      ...fields,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEntry(entryId, fields) {
  const { error } = await payroll
    .from("pay_entries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;
}

export async function deleteEntry(entryId) {
  const { error } = await payroll.from("pay_entries").delete().eq("id", entryId);
  if (error) throw error;
}
