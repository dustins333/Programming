// Custom pay requests — unifies "ask for a custom amount" and "get paid
// it" into one flow. Approving a request creates the linked pay_entries row
// directly (source: 'custom_request'), instead of a separate manual
// re-typing step — that manual step is exactly what caused a real $200 gap
// between an approved and an actually-paid amount in the Glide data this
// replaces.
import { payroll, core } from "../supabase/client";
import { ensurePayPeriod } from "./periods";

async function snapshotStaff(userId) {
  const { data, error } = await core.from("users").select("name, email").eq("id", userId).single();
  if (error) throw error;
  return { staff_name: data.name, staff_email: data.email };
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

export async function listPendingRequests() {
  const { data, error } = await payroll
    .from("custom_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return data;
}

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

export async function listRequestsForPeriod(periodStart) {
  const { data, error } = await payroll
    .from("custom_requests")
    .select("*")
    .eq("pay_period_start", periodStart)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function submitRequest(userId, periodStart, description, amountRequested) {
  await ensurePayPeriod(periodStart);
  const snapshot = await snapshotStaff(userId);
  const { data, error } = await payroll
    .from("custom_requests")
    .insert({
      user_id: userId,
      ...snapshot,
      pay_period_start: periodStart,
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
export async function approveRequest(request, approvedAmount, adminUserId, adminNotes = null) {
  const staffSnapshot = { staff_name: request.staff_name, staff_email: request.staff_email };
  const { data: entry, error: entryError } = await payroll
    .from("pay_entries")
    .insert({
      user_id: request.user_id,
      ...staffSnapshot,
      pay_period_start: request.pay_period_start,
      entry_date: new Date().toISOString().slice(0, 10),
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
