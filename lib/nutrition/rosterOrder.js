import { programming } from "../supabase/client";

// A coach's own working order for the nutrition queue (migration 0123).
//
// The rule the whole thing turns on: a saved position only counts while the
// client is still in the status it was saved under. That is what makes "when
// someone moves from one stage to the next, they drop in at the bottom" true
// with no background job and no write at the moment her status changes — her
// row simply stops matching, and she lands in the unordered tail.

// Map<clientId, {status, position}> for one coach. Throws like every other
// read in this module; callers fetch it in their own try/catch and fall back
// to an empty Map, so an unrun 0123 or a blip leaves the roster alphabetical
// rather than blanking it.
export async function getRosterOrder(ownerId) {
  if (!ownerId) return new Map();
  const { data, error } = await programming
    .from("nutrition_roster_order")
    .select("client_id, status, position")
    .eq("owner_id", ownerId);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.client_id, { status: row.status, position: row.position }]));
}

// Persists one whole group in one write: every client currently in it gets a
// position, including the ones that were only in the unordered tail a moment
// ago. So one drag pins the group, rather than leaving a half-ordered list
// where some rows are placed and the rest still sort by name.
export async function saveRosterOrder(ownerId, status, clientIds) {
  if (!ownerId || clientIds.length === 0) return;
  const updatedAt = new Date().toISOString();
  const rows = clientIds.map((clientId, index) => ({
    owner_id: ownerId,
    client_id: clientId,
    status,
    position: index + 1,
    updated_at: updatedAt,
  }));
  const { error } = await programming
    .from("nutrition_roster_order")
    .upsert(rows, { onConflict: "owner_id,client_id" });
  if (error) throw error;
}

// Pure, and exported so the ordering can be checked without a database.
//
// Ordered rows first, by position; everything else after, by name. A row only
// counts as ordered while its saved status still matches the status the
// client is in now — see the note at the top of the file.
export function sortRosterGroup(clients, orderMap) {
  const positionOf = (client) => {
    const saved = orderMap?.get(client.userId);
    return saved && saved.status === client.rosterStatus ? saved.position : null;
  };
  return [...clients].sort((a, b) => {
    const pa = positionOf(a);
    const pb = positionOf(b);
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Applies one drag's result to the in-memory map, so the list can be
// reordered optimistically and rolled back on a failed write without a
// refetch.
export function applyRosterOrder(orderMap, status, clientIds) {
  const next = new Map(orderMap);
  clientIds.forEach((clientId, index) => next.set(clientId, { status, position: index + 1 }));
  return next;
}
