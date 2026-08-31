import { programming } from "../supabase/client";
import { listCoaches } from "./clients";
import { dateInBoise } from "../boiseDate";

// Finished live-session boards, so a coach can pull one back up after the
// fact — see her girls' lifts and add the note she didn't have a hand free
// for at the rack.
//
// This needed NO migration. Ending a board only stamps hub_sessions.ended_at;
// the row and its hub_session_clients snapshot (name, workout, week, slot
// order) stay exactly as they were, and 0071's "staff manage hub_sessions"
// already lets any coach with SPC access read them back.
//
// ⚠ The one fidelity limit, worth knowing before trusting a number here:
// programming.logs carries no hub-session reference. A set is (client,
// exercise, DATE, set number, workout), so a past board shows "that client's
// sets for that session on that day" — not literally "what was typed on that
// board". Two boards run on the same day with the same client on the same
// session would therefore show identical lifts. Rare enough to accept (a
// client does one session a day), and fixing it properly means a session
// reference on logs, not a cleverer query here.

// A board that ran for eleven seconds and logged nothing was a mis-tap or a
// test, and there are a lot of them. They're filtered out rather than shown
// greyed — a history list you have to scroll past junk in is one you stop
// opening.
export const HISTORY_DEFAULT_DAYS = 2;

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// The Boise date a board's logs would have been written under. The hub writes
// todayInBoise() at the moment of the keystroke, so this is the session's own
// calendar day — NOT a UTC slice of created_at, which is already tomorrow for
// anything run in the Boise evening.
export function sessionDateOf(session) {
  return dateInBoise(new Date(session.created_at));
}

// Sessions in the window, newest first, each with its roster and how much was
// actually logged. `coachId` filters to one coach's own boards; omit for all.
export async function listHubHistory({ days = HISTORY_DEFAULT_DAYS, coachId = null } = {}) {
  let q = programming
    .from("hub_sessions")
    .select("*, hub_session_clients(*)")
    .not("ended_at", "is", null)
    .gte("created_at", isoDaysAgo(days))
    .order("created_at", { ascending: false });
  if (coachId) q = q.eq("coach_id", coachId);
  const { data, error } = await q;
  if (error) throw error;

  const sessions = (data ?? []).map((s) => ({
    ...s,
    clients: orderRoster(s.hub_session_clients),
    date: sessionDateOf(s),
  }));
  if (sessions.length === 0) return [];

  // coach_name only exists from 0076 onward, so older rows carry null. Resolved
  // from the roster rather than left blank — "who ran this" is most of what
  // makes a row identifiable at a glance.
  const needsName = sessions.some((s) => !s.coach_name);
  const coachById = needsName
    ? new Map((await listCoaches().catch(() => [])).map((c) => [c.id, c.name ?? c.email]))
    : new Map();

  const counts = await countLoggedSets(sessions);

  return sessions
    .map((s) => ({
      id: s.id,
      coachId: s.coach_id,
      coachName: s.coach_name ?? coachById.get(s.coach_id) ?? null,
      startedAt: s.created_at,
      endedAt: s.ended_at,
      date: s.date,
      clients: s.clients,
      loggedSets: s.clients.reduce(
        (sum, c) => sum + (counts.get(setsKey(s.date, c.user_id, c.group_workout_id ?? c.spc_workout_id)) ?? 0),
        0
      ),
    }))
    .filter((s) => s.loggedSets > 0);
}

// Keyed on the WORKOUT as well as the client and the day, which is the whole
// point: a first pass bucketed by (day, client) alone and so counted every set
// that client logged anywhere that day. Boards that were opened and never
// typed into therefore showed "16 sets logged" and opened to empty cards,
// because those sets belong to a different session entirely. The count has to
// answer the same question the board itself will — what is on THIS workout.
function setsKey(date, userId, workoutId) {
  return `${date}:${userId}:${workoutId}`;
}

// One query per workout kind over the whole window, then bucketed — not a
// count per session, which would be a query per row of the list.
async function countLoggedSets(sessions) {
  const dates = [...new Set(sessions.map((s) => s.date))];
  const spcIds = new Set();
  const groupIds = new Set();
  const userIds = new Set();
  for (const s of sessions) {
    for (const c of s.clients) {
      userIds.add(c.user_id);
      if (c.group_workout_id) groupIds.add(c.group_workout_id);
      else if (c.spc_workout_id) spcIds.add(c.spc_workout_id);
    }
  }

  const queries = [];
  const base = () =>
    programming
      .from("logs")
      .select("user_id, date_performed, spc_workout_id, group_workout_id")
      .in("date_performed", dates)
      .in("user_id", [...userIds]);
  if (spcIds.size > 0) queries.push(base().in("spc_workout_id", [...spcIds]));
  if (groupIds.size > 0) queries.push(base().in("group_workout_id", [...groupIds]));

  const counts = new Map();
  for (const res of await Promise.all(queries)) {
    if (res.error) throw res.error;
    for (const row of res.data ?? []) {
      const workoutId = row.group_workout_id ?? row.spc_workout_id;
      if (!workoutId) continue;
      const key = setsKey(row.date_performed, row.user_id, workoutId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

// Everyone who was on the board, INCLUDING anyone swapped out part-way — a
// removal has been a soft delete since 0107, and showing only who was still
// standing there at the end is exactly the under-reporting that change exists
// to fix. Ordered by when they joined so a back-to-back board reads as the
// sequence it actually was; position breaks ties, and a null added_at (rows
// predating 0107) sorts first because those are always original crew.
export function orderRoster(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const at = a.added_at ? Date.parse(a.added_at) : 0;
    const bt = b.added_at ? Date.parse(b.added_at) : 0;
    return at - bt || a.position - b.position;
  });
}

// One finished board, in the exact shape useHubBoard/HubLiveSession already
// expect from getOpenHubSession — so the review screen renders the real board
// components unmodified rather than a read-only lookalike that could drift.
export async function getHubSessionForReview(sessionId) {
  const { data, error } = await programming
    .from("hub_sessions")
    .select("*, hub_session_clients(*)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const clients = orderRoster(data.hub_session_clients);
  return { ...data, clients, date: sessionDateOf(data) };
}
