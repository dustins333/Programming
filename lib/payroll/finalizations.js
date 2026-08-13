// Per-coach per-period lock. Coaches only ever reach this through the
// finalize_own_period() RPC (security definer) — never a plain table write
// — because RLS can't restrict which column a plain UPDATE touches, and a
// coach must never be able to set their own reopened_at (that would let
// them self-unlock). Reopening is an admin-only plain table write instead,
// same "admin reopens" shape as programming.nutrition_checkin_reopens.
import { payroll } from "../supabase/client";

export async function getOwnFinalization(userId, periodStart) {
  const { data, error } = await payroll
    .from("finalizations")
    .select("*")
    .eq("user_id", userId)
    .eq("pay_period_start", periodStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// True once finalized and not since reopened (or re-finalized after a
// reopen) — the single state check every write-path RLS policy also
// enforces server-side; this is the client-side mirror for UI gating.
export function isLocked(finalization) {
  if (!finalization?.finalized_at) return false;
  if (!finalization.reopened_at) return true;
  return new Date(finalization.finalized_at) > new Date(finalization.reopened_at);
}

export async function finalizeOwnPeriod(periodStart) {
  const { error } = await payroll.rpc("finalize_own_period", { p_period_start: periodStart });
  if (error) throw error;
}

// Admin-only per RLS.
export async function listFinalizationsForPeriod(periodStart) {
  const { data, error } = await payroll.from("finalizations").select("*").eq("pay_period_start", periodStart);
  if (error) throw error;
  return data;
}

export async function reopenFinalization(finalizationId, reopenedByUserId) {
  const { error } = await payroll
    .from("finalizations")
    .update({ reopened_at: new Date().toISOString(), reopened_by: reopenedByUserId })
    .eq("id", finalizationId);
  if (error) throw error;
}

// Every finalization row belonging to one coach, newest period first.
// Backs My Entries' period picker: a period the coach can still edit is one
// they either never finalized, or that an admin has since reopened/sent
// back. Without this the entry screen was hardwired to the current period,
// so once a period rolled over there was no screen anywhere in the app that
// could reach the entries a send-back was asking them to fix.
export async function listOwnFinalizations(userId) {
  const { data, error } = await payroll
    .from("finalizations")
    .select("*")
    .eq("user_id", userId)
    .order("pay_period_start", { ascending: false });
  if (error) throw error;
  return data;
}

// --- Review (0055) -----------------------------------------------------

export const REVIEW_NOT_SUBMITTED = "not_submitted";
export const REVIEW_SUBMITTED = "submitted";
export const REVIEW_APPROVED = "approved";
export const REVIEW_SENT_BACK = "sent_back";

// Derived from timestamps rather than a stored status string, so a
// finalization row written before 0055 (no review stamps at all) still
// reads correctly as "submitted, nobody's looked yet". Whichever stamp is
// newest than finalized_at wins — that's also what makes a coach's
// re-finalize after a send-back land back on Submitted.
export function reviewState(finalization) {
  if (!finalization?.finalized_at) return REVIEW_NOT_SUBMITTED;
  const finalized = new Date(finalization.finalized_at);
  if (finalization.approved_at && new Date(finalization.approved_at) > finalized) return REVIEW_APPROVED;
  if (finalization.sent_back_at && new Date(finalization.sent_back_at) > finalized) return REVIEW_SENT_BACK;
  // A plain reopen (no note) leaves them able to edit again with nothing
  // submitted — same shape as never having finalized.
  if (finalization.reopened_at && new Date(finalization.reopened_at) > finalized) return REVIEW_NOT_SUBMITTED;
  return REVIEW_SUBMITTED;
}

export async function approveFinalization(finalizationId, approvedByUserId) {
  const { error } = await payroll
    .from("finalizations")
    .update({ approved_at: new Date().toISOString(), approved_by: approvedByUserId, sent_back_at: null, sent_back_by: null, send_back_note: null })
    .eq("id", finalizationId);
  if (error) throw error;
}

// Undo of the above — back to Submitted, not back to unsubmitted, so an
// accidental approve doesn't cost the coach their submission.
export async function unapproveFinalization(finalizationId) {
  const { error } = await payroll.from("finalizations").update({ approved_at: null, approved_by: null }).eq("id", finalizationId);
  if (error) throw error;
}

// Writes reopened_at alongside the send-back stamps on purpose — see the
// header comment in migration 0055. Without it the coach reads the note and
// is still locked out of editing the entries it's about.
export async function sendBackFinalization(finalizationId, sentBackByUserId, note) {
  const now = new Date().toISOString();
  const { error } = await payroll
    .from("finalizations")
    .update({
      sent_back_at: now,
      sent_back_by: sentBackByUserId,
      send_back_note: note?.trim() || null,
      approved_at: null,
      approved_by: null,
      reopened_at: now,
      reopened_by: sentBackByUserId,
    })
    .eq("id", finalizationId);
  if (error) throw error;
}
