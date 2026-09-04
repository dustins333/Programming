import { programming, core } from "../supabase/client";
import { todayInBoise, dateInBoise, mondayOnOrBefore, daysBetween } from "../boiseDate";
import { describeCompletion, sessionKeyForCompletion } from "./coachLogs";
import { isLoggedSet, STARTED_SET_FLOOR } from "./spcSessionActivity";

// The four figures on the coach's mobile pulse band, and the four lists
// behind them, off ONE aggregate — because a count and the list it opens
// have to read the same rows or the count is decoration. (The board's own
// "16 sets logged" row learned that the hard way; see CLAUDE.md.)
//
// The week is Monday-to-today, matching every other week in this app. It is
// the week SO FAR, not a projection.
//
// TWO DIFFERENT RULES, deliberately, because they answer two questions:
//
//   Sessions  = FINALIZED sessions. That is what "sessions logged" has always
//               meant on this dashboard, and it is what a coach counts.
//   Girls     = anyone who was actually IN — finalized, or with real sets
//               against a session she never tapped Finalize on.
//
// The second rule exists entirely for the fourth tile. "Girls not in this
// week" is the one figure a coach acts on by picking up the phone, and a
// woman who trained on Tuesday and forgot to finalize must never appear on
// that list. She shows on the "in this week" list instead, flagged, which is
// also worth knowing.
//
// Finding her costs one narrow query: the log check runs ONLY over roster
// members with no completion this week, which is a short list of people who
// by definition have few log rows. Running it over the whole roster would
// mean pulling ~5,000 set rows onto a phone on every dashboard focus.

const SESSION_SELECT = `id, user_id, completed_at, week_number, group_workout_id, spc_workout_id, one_off_workout_id,
   group_workouts ( session_number, week_number, title, group_blocks ( group_programs ( name ) ) ),
   spc_workouts ( session_number, week_number, title ),
   one_off_workouts ( title )`;

// Everyone with a training program: any group membership, or an ACTIVE SPC
// enrollment. Nutrition-only clients are deliberately absent — a nutrition
// client who never lifts is not somebody who failed to come in.
//
// `status = 'active'`, not `<> 'paused'`: 0108 split "on hold" from "the SPC
// switch is off", and an inactive client would otherwise read as missing
// every week forever.
async function trainingRoster() {
  const [{ data: assignments, error: aError }, { data: spc, error: sError }] = await Promise.all([
    programming.from("client_program_assignments").select("user_id"),
    programming.from("spc_clients").select("user_id, status"),
  ]);
  if (aError) throw aError;
  if (sError) throw sError;
  const ids = new Set(assignments.map((a) => a.user_id));
  for (const c of spc) if (c.status === "active") ids.add(c.user_id);
  return [...ids];
}

// Which of these members put real sets in this week without finalizing. A
// single set is a mis-tap; STARTED_SET_FLOOR is the same threshold the SPC
// client page uses to call a session started, so the two agree.
async function trainedWithoutFinalizing(candidateIds, weekStart) {
  if (candidateIds.length === 0) return new Map();
  const { data, error } = await programming
    .from("logs")
    .select("user_id, date_performed, reps, weight")
    .in("user_id", candidateIds)
    .gte("date_performed", weekStart)
    .limit(5000);
  if (error) throw error;
  const byUser = new Map();
  for (const row of data ?? []) {
    if (!isLoggedSet(row)) continue;
    const seen = byUser.get(row.user_id) ?? { sets: 0, lastDate: null };
    seen.sets += 1;
    if (!seen.lastDate || row.date_performed > seen.lastDate) seen.lastDate = row.date_performed;
    byUser.set(row.user_id, seen);
  }
  for (const [id, v] of byUser) if (v.sets < STARTED_SET_FLOOR) byUser.delete(id);
  return byUser;
}

export async function getGymWeek(today = todayInBoise()) {
  const weekStart = mondayOnOrBefore(today);
  // A day of UTC slack, then re-filtered on the Boise date — completed_at is
  // a timestamptz and "this week" here means Boise's.
  const utcFloor = new Date(`${weekStart}T00:00:00Z`);
  utcFloor.setUTCDate(utcFloor.getUTCDate() - 1);

  const [{ data: comps, error: compError }, rosterIds] = await Promise.all([
    programming
      .from("session_completions")
      .select(SESSION_SELECT)
      .gte("completed_at", utcFloor.toISOString())
      .order("completed_at", { ascending: false })
      .limit(2000),
    trainingRoster(),
  ]);
  if (compError) throw compError;

  const rawSessions = (comps ?? [])
    .map((c) => ({
      id: c.id,
      userId: c.user_id,
      date: dateInBoise(new Date(c.completed_at)),
      completedAt: c.completed_at,
      ...describeCompletion(c),
      // The session key SessionRow expands with (0063), so a row in the
      // sheet opens into that session's own sets rather than the whole
      // calendar day.
      session: sessionKeyForCompletion(c),
      finalized: true,
    }))
    .filter((r) => r.date >= weekStart);

  const finalizedIds = new Set(rawSessions.map((r) => r.userId));

  const candidates = rosterIds.filter((id) => !finalizedIds.has(id));
  // Isolated: if the log check fails, everybody who trained without
  // finalizing lands on the "not in" list. Wrong, but visibly wrong, and it
  // never takes the band down.
  const startedByUser = await trainedWithoutFinalizing(candidates, weekStart).catch(() => new Map());

  const seenIds = [...finalizedIds, ...startedByUser.keys()];
  const notSeenIds = rosterIds.filter((id) => !finalizedIds.has(id) && !startedByUser.has(id));

  // Names for everyone either list will print. One query over the union, so
  // a name can't be resolved differently in two places.
  const nameById = new Map();
  const allIds = [...new Set([...seenIds, ...notSeenIds])];
  if (allIds.length > 0) {
    const { data: users, error } = await core.from("users").select("id, name").in("id", allIds);
    if (error) throw error;
    for (const u of users ?? []) nameById.set(u.id, u.name);
  }

  // How long since each not-in member last finished anything (0056, one call
  // for the whole list). Isolated — without it the list still works, it just
  // can't be ordered by who has been gone longest, which is the order that
  // makes it a call list rather than a roster.
  let lastById = new Map();
  if (notSeenIds.length > 0) {
    try {
      const { data, error } = await programming.rpc("get_last_session_dates", { user_ids: notSeenIds });
      if (error) throw error;
      lastById = new Map((data ?? []).map((r) => [r.user_id, dateInBoise(new Date(r.last_completed_at))]));
    } catch {
      lastById = new Map();
    }
  }

  // Names attached here rather than at build time: they are resolved in one
  // query over both lists, so every row in every sheet reads the same name
  // for the same person.
  const sessions = rawSessions.map((r) => ({ ...r, userName: nameById.get(r.userId) ?? "Unknown" }));
  const sessionsToday = sessions.filter((r) => r.date === today);

  const countByUser = new Map();
  for (const s of sessions) countByUser.set(s.userId, (countByUser.get(s.userId) ?? 0) + 1);

  const seen = seenIds
    .map((id) => ({
      userId: id,
      name: nameById.get(id) ?? "Unknown",
      sessions: countByUser.get(id) ?? 0,
      startedOnly: !finalizedIds.has(id),
      lastDate: startedByUser.get(id)?.lastDate ?? null,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));

  const notSeen = notSeenIds
    .map((id) => {
      const last = lastById.get(id) ?? null;
      return {
        userId: id,
        name: nameById.get(id) ?? "Unknown",
        lastDate: last,
        daysSince: last ? daysBetween(today, last) : null,
      };
    })
    // Longest gone first — that ordering is what turns a roster into a call
    // list. Someone who has never finished a session sorts to the very top.
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity) || a.name.localeCompare(b.name));

  return {
    weekStart,
    sessions,
    sessionsToday,
    seen,
    notSeen,
    counts: {
      sessionsToday: sessionsToday.length,
      sessionsWeek: sessions.length,
      membersWeek: seen.length,
      membersNotSeen: notSeen.length,
    },
  };
}
