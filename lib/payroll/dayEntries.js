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
export async function upsertCoreEntryFields(userId, periodStart, date, existingCoreRow, fields) {
  if (existingCoreRow) {
    await updateEntry(existingCoreRow.id, fields);
    return { ...existingCoreRow, ...fields };
  }
  return createEntry(userId, periodStart, { entry_date: date, ...fields });
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
