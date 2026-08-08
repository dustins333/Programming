import { payroll, core } from "../supabase/client";
import { ensurePayPeriod } from "./periods";

export async function listEntriesForPeriod(userId, periodStart) {
  const { data, error } = await payroll
    .from("pay_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("pay_period_start", periodStart)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
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
