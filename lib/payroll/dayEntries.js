// Data access for the tile-based "My Entries" screen — one date at a time.
// Every write here is a thin wrapper over createEntry/updateEntry
// (entries.js), never a new insert/update path of its own — the tile UI's
// whole data model is just payroll.pay_entries rows, partitioned client-side
// by calc.js's partitionDayEntries. See the approved plan's Phase A3/B4 for
// the full reasoning.
import { payroll } from "../supabase/client";
import { createEntry, updateEntry, deleteEntry } from "./entries";

// The "core" row holds group/programs/admin/welcome/strategy/ops — at most
// one per (user, date). Creates it on first save, otherwise updates it in
// place so repeated tile confirms for the same date never pile up
// duplicate rows.
//
// "At most one" is enforced by the database (migration 0132's
// pay_entries_one_core_row_per_day), not by this function knowing the row
// exists. The caller's idea of the existing row can be stale: a coach who
// leaves the screen mid-save and comes straight back gets a fresh screen
// that loaded before the first insert landed. Before 0132 that second insert
// succeeded and the day was paid twice while the screen showed one value. Now
// it is refused (23505), and this falls back to updating the row that won.
export async function upsertCoreEntryFields(userId, periodStart, date, existingCoreRow, fields) {
  if (existingCoreRow) {
    await updateEntry(existingCoreRow.id, fields);
    return { ...existingCoreRow, ...fields };
  }
  try {
    return await createEntry(userId, periodStart, { entry_date: date, ...fields });
  } catch (err) {
    if (err?.code !== "23505") throw err;
    const existing = await findCoreRow(userId, date);
    if (!existing) throw err;
    await updateEntry(existing.id, fields);
    return { ...existing, ...fields };
  }
}

// Same predicate as the unique index in 0132 and calc.js partitionDayEntries.
async function findCoreRow(userId, date) {
  const { data, error } = await payroll
    .from("pay_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("entry_date", date)
    .eq("source", "coach_entry")
    .or("spc_session.is.null,spc_session.eq.false")
    .is("other_type", null)
    .is("custom_amt", null)
    .is("custom_description", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// SPC sessions are independently repeatable per date — each Save from the
// session popup is its own new row, isolated to spc_session/spc_attendees/
// spc_notes with every other field left null.
export async function createSpcSession(userId, periodStart, date, { attendees, notes }) {
  return createEntry(userId, periodStart, {
    entry_date: date,
    spc_session: true,
    spc_attendees: attendees,
    spc_notes: notes || null,
  });
}

export async function updateSpcSession(entryId, { attendees, notes }) {
  await updateEntry(entryId, { spc_attendees: attendees, spc_notes: notes || null });
}

// Other line items are independently repeatable per date, same shape as
// SPC sessions — one row per submission.
export async function createOtherItem(userId, periodStart, date, { otherType, qty, notes }) {
  return createEntry(userId, periodStart, {
    entry_date: date,
    other_type: otherType,
    other_qty: qty ?? 1,
    notes: notes || null,
  });
}

export async function updateOtherItem(entryId, { otherType, qty, notes }) {
  await updateEntry(entryId, { other_type: otherType, other_qty: qty ?? 1, notes: notes || null });
}

// There is deliberately no "custom amount" write path here any more. Custom
// pay is entered as a request on the Requests tab and becomes a pay_entries
// row only when an admin approves it (requests.js's approveRequest) — per
// direct ask, so the request and the money it turns into stay one flow
// instead of two places a coach could type a custom amount.

export const deleteDayEntry = deleteEntry;
