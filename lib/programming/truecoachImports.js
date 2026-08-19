import { programming } from "../supabase/client";

// TrueCoach history imports (migration 0066). Every member's TrueCoach lifts
// were parsed offline into programming.truecoach_imports (one row per person ×
// TrueCoach lift name) and truecoach_import_sets. Nothing reaches
// programming.logs until the MEMBER links an import to a Kova exercise from
// her own history screen — matching is hers, never fuzzy-matched for her.
//
// Link / unlink / move are security-definer RPCs, not client-side loops: a
// link writes one logs row per staged set (source 'truecoach', stamped with
// truecoach_import_id) and a move (import already linked to another lift) is
// unlink + link in one atomic call. Unlink deletes exactly the rows carrying
// this import's id — anything she logged in Kova has NULL there and can't be
// reached by construction.

// Every import belonging to this member, with the Kova lift each is currently
// linked to (if any). Ordered by lift name; the picker re-sorts per exercise.
export async function listMyTrueCoachImports(userId) {
  const { data, error } = await programming
    .from("truecoach_imports")
    .select("id, lift_name, session_count, set_count, first_date, last_date, last_summary, linked_exercise_id, linked_at, exercises(name)")
    .eq("user_id", userId)
    .order("lift_name");
  if (error) throw error;
  return data ?? [];
}

// One RPC per import — the picker's multi-select just calls this in sequence.
// Returns the number of logs rows materialised.
export async function linkTrueCoachImport(importId, exerciseId) {
  const { data, error } = await programming.rpc("link_truecoach_import", {
    p_import_id: importId,
    p_exercise_id: exerciseId,
  });
  if (error) throw error;
  return data;
}

export async function unlinkTrueCoachImport(importId) {
  const { data, error } = await programming.rpc("unlink_truecoach_import", { p_import_id: importId });
  if (error) throw error;
  return data;
}

// "May–Aug 2026", "Aug 2026", "Jan 2025–Aug 2026" — for the picker row's
// meta line. Split off the ISO string, never through new Date (timezone).
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatImportDateRange(first, last) {
  if (!first) return "";
  const [fy, fm] = first.split("-");
  const [ly, lm] = (last ?? first).split("-");
  const a = `${MON[Number(fm) - 1]}`;
  const b = `${MON[Number(lm) - 1]}`;
  if (fy === ly) {
    return fm === lm ? `${a} ${fy}` : `${a}–${b} ${fy}`;
  }
  return `${a} ${fy}–${b} ${ly}`;
}

// The picker's row meta: "14 sessions · May–Aug 2026 · last 45lbs 3x12".
export function describeImport(imp) {
  const parts = [`${imp.session_count} session${imp.session_count === 1 ? "" : "s"}`];
  const range = formatImportDateRange(imp.first_date, imp.last_date);
  if (range) parts.push(range);
  if (imp.last_summary) parts.push(`last ${imp.last_summary}`);
  return parts.join(" · ");
}
