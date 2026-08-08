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
