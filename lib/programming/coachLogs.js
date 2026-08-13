import { programming, core } from "../supabase/client";
import { dateInBoise, todayInBoise, addDays, dayOfWeekInBoise } from "../boiseDate";
import { currentWeekNumber, DEFAULT_SESSION_DAYS, blockLengthWeeks } from "./schedule";
import { listAssignmentsForUser } from "./clients";
import { getCurrentBlock, listWorkoutsForWeek } from "./memberPlan";
import { listGroupCompletionsForWorkouts, getCompletedSpcWorkoutIdsForWeek } from "./sessionCompletions";
import { getSpcClient, isSpcActive } from "./spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "./spcBlocks";
import { listActiveOneOffWorkoutsForUser } from "./oneOffWorkouts";

// Splits a completion into the two things a coach reads separately: which
// session this was ("SPC - Week 1 session 1") and, only if the coach gave
// it one, what they called it. The name is deliberately NOT folded into
// the label — a session that's had its title cleared should read as plain
// "Week 1 session 1", and an old title shouldn't be able to masquerade as
// part of the session's identity.
//
// Hyphen, not an em dash, per direct ask.
function describeCompletion(c) {
  if (c.group_workouts) {
    const programName = c.group_workouts.group_blocks?.group_programs?.name ?? "Group";
    const week = c.group_workouts.week_number;
    return {
      label: `${programName} - ${week ? `Week ${week} ` : ""}session ${c.group_workouts.session_number}`,
      sessionTitle: c.group_workouts.title || null,
    };
  }
  if (c.spc_workouts) {
    // The workout row's own week is authoritative since 0016 gave SPC one
    // row per (block, week, session); the completion's week_number is the
    // pre-0016 fallback.
    const week = c.spc_workouts.week_number ?? c.week_number;
    return {
      label: `SPC - ${week ? `Week ${week} ` : ""}session ${c.spc_workouts.session_number}`,
      sessionTitle: c.spc_workouts.title || null,
    };
  }
  return { label: "One-off", sessionTitle: c.one_off_workouts?.title || null };
}

// Which exercises a given session actually programs.
//
// programming.logs has no workout id — a log row records (user, exercise,
// date, set) and nothing about which session it belonged to — so the only
// way to show one session's sets is to intersect that day's logs with the
// exercises the session prescribes. Without this, a client who finalizes
// two sessions on the same day sees BOTH sessions' full exercise list
// under EACH row (real case: Bob finalized three SPC sessions in one
// evening and every row listed all fifteen lifts).
//
// Honest limitation, not a full fix: an exercise programmed in two
// sessions completed the same day still appears under both, because the
// underlying log genuinely can't say which one it was for. Fixing that
// properly means a real session reference on logs, not a smarter query.
// Returns null when the session has no exercise rows at all, which the
// caller reads as "don't filter" rather than "show nothing".
function exerciseIdsForCompletion(c) {
  const rows =
    c.group_workouts?.group_workout_exercises ??
    c.spc_workouts?.spc_workout_exercises ??
    c.one_off_workouts?.one_off_exercises ??
    null;
  if (!rows || rows.length === 0) return null;
  return new Set(rows.map((r) => r.exercise_id));
}

// Roster-wide version of listRecentSessionsForUser below — every finalized
// session since a given Boise-local date, newest first, with member names
// merged client-side from core.users (cross-schema embeds are avoided by
// convention). Backs the coach dashboard's "Sessions this week" tile +
// drill-down feed; before this the only way to see who trained was opening
// each client's page one at a time. The completed_at filter over-fetches by
// a day of UTC slack and re-filters on the Boise-local date so the week
// boundary is the same one every other screen uses.
export async function listSessionsSinceAllUsers(sinceDate, limit = 500) {
  const utcFloor = new Date(`${sinceDate}T00:00:00Z`);
  utcFloor.setUTCDate(utcFloor.getUTCDate() - 1);
  const { data, error } = await programming
    .from("session_completions")
    .select(
      `id, user_id, completed_at, week_number,
       group_workouts ( session_number, week_number, title, group_blocks ( group_programs ( name ) ) ),
       spc_workouts ( session_number, week_number, title ),
       one_off_workouts ( title )`
    )
    .gte("completed_at", utcFloor.toISOString())
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data
    .map((c) => ({
      id: c.id,
      userId: c.user_id,
      date: dateInBoise(new Date(c.completed_at)),
      completedAt: c.completed_at,
      ...describeCompletion(c),
    }))
    .filter((r) => r.date >= sinceDate);
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const { data: users, error: usersError } = await core.from("users").select("id, name").in("id", userIds);
  if (usersError) throw usersError;
  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: nameById[r.userId] ?? "Unknown" }));
}

// Coach-facing mirror of My History's day timeline (lib/history.js's
// listDayTimeline) — same session_completions query and label logic, minus
// the nutrition/milestone merging that's irrelevant to "what did this
// client actually lift." Scoped by an arbitrary userId instead of the
// caller's own auth.uid(), which the existing "staff can read session
// completions" policy (0007) already allows — no migration needed.
// Per-set detail for a given session is a separate fetch (memberPlan.js's
// listLogsForDate, reused as-is — same RLS story as getCurrentBlock being
// reused for the coach client-detail page elsewhere in this file) so this
// list itself stays cheap for a client with a long history.
export async function listRecentSessionsForUser(userId, limit = 12) {
  const { data, error } = await programming
    .from("session_completions")
    .select(
      `id, completed_at, week_number,
       group_workouts ( session_number, week_number, title, group_blocks ( group_programs ( name ) ), group_workout_exercises ( exercise_id ) ),
       spc_workouts ( session_number, week_number, title, spc_workout_exercises ( exercise_id ) ),
       one_off_workouts ( title, one_off_exercises ( exercise_id ) )`
    )
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map((c) => ({
    id: c.id,
    date: dateInBoise(new Date(c.completed_at)),
    completedAt: c.completed_at,
    ...describeCompletion(c),
    exerciseIds: exerciseIdsForCompletion(c),
  }));
}

// --- Upcoming ----------------------------------------------------------

// The forward-looking counterpart to listRecentSessionsForUser: what this
// client is scheduled to do next, across every kind of membership they
// hold (group programs, SPC, one-offs). Nothing here is stored — a
// "session" only becomes a row anywhere once it's finalized — so this is
// derived live from each membership's current block the same way the
// member's own My Week screen derives it.
//
// Each module is fetched in its own try/catch and contributes
// independently: a client with a broken SPC block still gets their group
// sessions listed, same isolation the client-detail page already uses.

// Calendar Monday of the week containing `today`. Sunday counts as the end
// of the week it closes, not the start of the next one — matching My Week.
function weekStartFor(today) {
  const dow = dayOfWeekInBoise(today);
  return addDays(today, dow === 0 ? -6 : 1 - dow);
}

// Weekday int (0=Sun..6=Sat) -> its date inside the Monday-based week.
function dateForWeekday(weekStart, weekday) {
  return addDays(weekStart, weekday === 0 ? 6 : weekday - 1);
}

async function upcomingGroupSessions(userId, today) {
  const assignments = await listAssignmentsForUser(userId);
  const weekStart = weekStartFor(today);
  const out = [];

  await Promise.all(
    assignments.map(async (assignment) => {
      const program = assignment.group_programs;
      if (!program) return;
      const block = await getCurrentBlock(program.id, today);
      if (!block) return;

      const thisWeekNumber = currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), today);
      const sessionDays = program.session_days ?? DEFAULT_SESSION_DAYS;

      // This block week and the next one. Block weeks are a flat day count
      // from the block's start date, so "next block week" only lines up
      // with "next calendar week" when the block started on a Monday —
      // which is how every block this app creates is scheduled (each new
      // block starts the day after the last one ended). Worth knowing if a
      // block is ever hand-started mid-week: the second week's dates below
      // would then be off.
      for (const offset of [0, 1]) {
        const weekNumber = thisWeekNumber + offset;
        if (weekNumber > blockLengthWeeks(block, program)) continue;

        const workouts = await listWorkoutsForWeek(block.id, weekNumber);
        if (!workouts.length) continue;
        const completedIds = await listGroupCompletionsForWorkouts(
          userId,
          workouts.map((w) => w.id)
        );

        for (const workout of workouts) {
          if (completedIds.has(workout.id)) continue;
          const days = sessionDays[workout.session_number - 1] ?? [];
          const dates = days
            .map((d) => dateForWeekday(addDays(weekStart, offset * 7), d))
            .filter((date) => date >= today)
            .sort();
          // Every scheduled day for this session has already passed
          // without it being finalized — that's a missed session, which
          // the flags on this same page already surface. Not upcoming.
          if (!dates.length) continue;

          out.push({
            id: `group-${workout.id}`,
            date: dates[0],
            label: `${program.name} - Week ${weekNumber} session ${workout.session_number}`,
            title: workout.title || null,
            meta: offset === 0 ? "This week" : "Next week",
            isDraft: workout.status !== "published",
          });
        }
      }
    })
  );

  return out;
}

async function upcomingSpcSessions(userId, today) {
  const spcClient = await getSpcClient(userId);
  if (!isSpcActive(spcClient)) return [];

  // spc_blocks.spc_client_id holds the member's own user id —
  // programming.spc_clients is keyed by user_id and has no id column of
  // its own. Every other caller of this passes profile.id for the same
  // reason.
  const block = await getCurrentSpcBlock(userId, today);
  if (!block) return [];

  const thisWeek = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);

  // This block week AND the next one, matching upcomingGroupSessions
  // above. Looking only at the current week was a real bug: a client who
  // finished all of this week's sessions showed "nothing upcoming" even
  // with a fully published next week sitting there — which is exactly the
  // state a diligent client is in by midweek. Found on a real client (Bob,
  // all 3 of week 1 finalized on the same evening).
  const out = [];
  for (const offset of [0, 1]) {
    const weekNumber = thisWeek + offset;
    if (weekNumber > block.block_length_weeks) continue;

    const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber);
    if (!workouts.length) continue;

    const completedIds = await getCompletedSpcWorkoutIdsForWeek(
      userId,
      workouts.map((w) => w.id),
      weekNumber
    );

    // SPC has no day-of-week routing at all — a client picks which of their
    // sessions to do when it suits them — so these carry no date. They sort
    // after everything dated, below.
    for (const w of workouts) {
      if (completedIds.has(w.id)) continue;
      out.push({
        id: `spc-${w.id}-w${weekNumber}`,
        date: null,
        label: `SPC - Week ${weekNumber} session ${w.session_number}`,
        title: w.title || null,
        meta: "Any day",
        // No date to show on the right, so say which week it falls in
        // there instead — the meta line underneath must not repeat it.
        when: offset === 0 ? "This week" : "Next week",
        isDraft: w.status !== "published",
      });
    }
  }
  return out;
}

async function upcomingOneOffs(userId) {
  const workouts = await listActiveOneOffWorkoutsForUser(userId);
  return workouts.map((w) => ({
    id: `one-off-${w.id}`,
    date: null,
    label: w.title || "One-off workout",
    title: null,
    meta: "Open until completed",
    isDraft: false,
  }));
}

// Returns { sessions, errors }. Each module is isolated so one broken
// membership can't hide the others — but a failure is reported rather than
// swallowed, because an empty list and a failed fetch mean completely
// different things to a coach and used to look identical here.
export async function listUpcomingSessionsForUser(userId, today = todayInBoise()) {
  const modules = [
    { name: "Group programs", run: () => upcomingGroupSessions(userId, today) },
    { name: "SPC", run: () => upcomingSpcSessions(userId, today) },
    { name: "One-offs", run: () => upcomingOneOffs(userId) },
  ];

  const results = await Promise.allSettled(modules.map((m) => m.run()));

  const sessions = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const errors = results
    .map((r, i) => (r.status === "rejected" ? { module: modules[i].name, message: r.reason?.message ?? String(r.reason) } : null))
    .filter(Boolean);

  // Dated sessions first, soonest first; undated ones (SPC, one-offs)
  // after, since "sometime this week" can't be slotted between two days.
  sessions.sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  return { sessions, errors };
}
