// Per-day "submitted" state for the payroll entry screen (migration 0051).
//
// The tile grid autosaves as data is entered; every tile's checkmark stays
// hollow until the coach taps Submit for that date, at which point they all
// fill. Editing that date again clears the submission, so a solid checkmark
// always means "exactly what's saved right now has been submitted" rather
// than "something here was submitted at some point."
import { payroll } from "../supabase/client";
import { ensurePayPeriod } from "./periods";

export async function listDaySubmissionsForPeriod(userId, periodStart) {
  const { data, error } = await payroll
    .from("day_submissions")
    .select("*")
    .eq("user_id", userId)
    .eq("pay_period_start", periodStart);
  if (error) throw error;
  return data;
}

export async function submitDay(userId, periodStart, date) {
  await ensurePayPeriod(periodStart);
  const { error } = await payroll
    .from("day_submissions")
    .upsert({ user_id: userId, pay_period_start: periodStart, entry_date: date, submitted_at: new Date().toISOString() }, { onConflict: "user_id,entry_date" });
  if (error) throw error;
}

// Called after any write to a date's entries — a delete of a row that isn't
// there is a harmless no-op, so callers don't need to check first.
export async function clearDaySubmission(userId, date) {
  const { error } = await payroll.from("day_submissions").delete().eq("user_id", userId).eq("entry_date", date);
  if (error) throw error;
}
