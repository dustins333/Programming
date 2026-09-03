import { programming, supabase } from "../supabase/client";
import { todayInBoise, dateInBoise, mondayOnOrBefore } from "../boiseDate";
import { countPersonalRecordsOn } from "./exerciseStats";
import { listThreadSummaries } from "./messages";
import { CONTENT_COLUMNS, hasContent } from "./dashboardCards";

// "TODAY IN THE GYM" — the small four-row card on the coach-web launchpad
// (design_handoff_coach_web_v2, 1a). Every number here is a live count over
// data that already exists; nothing is stored.
//
// Each figure is fetched in its own try/catch and falls back to null rather
// than 0. A row that failed to load must not render as "0 sessions logged"
// — that reads as a quiet gym rather than a broken query, and it's the kind
// of wrong number a coach would act on.

// Today's sessions, this week's sessions, and how many different women were
// actually in — all three off ONE read of session_completions, because they
// are three views of the same rows and three queries would be three chances
// for them to disagree with each other.
//
// The week is Monday-to-today, matching every other week in this app (blocks
// start on a Monday, My Week runs Mon-Sun). It is the week SO FAR, not a
// projection: on a Tuesday it says what has happened, not what is booked.
//
// "Girls seen" is DISTINCT user_id, which is the only one of the three that
// separates reach from repeat visits. Sessions and girls being equal means
// nobody trained twice; 31 sessions across 19 girls means a dozen did.
async function trainingActivity(today) {
  const weekStart = mondayOnOrBefore(today);
  // Over-fetch a day of UTC slack, then re-filter on the Boise-local date —
  // completed_at is a timestamptz and both "today" and "this week" here mean
  // Boise's, not UTC's.
  const utcFloor = new Date(`${weekStart}T00:00:00Z`);
  utcFloor.setUTCDate(utcFloor.getUTCDate() - 1);
  const { data, error } = await programming
    .from("session_completions")
    .select("id, user_id, completed_at")
    .gte("completed_at", utcFloor.toISOString())
    .limit(3000);
  if (error) throw error;

  let sessionsToday = 0;
  let sessionsWeek = 0;
  const membersWeek = new Set();
  for (const row of data) {
    const day = dateInBoise(new Date(row.completed_at));
    if (day < weekStart) continue; // inside the UTC slack, before Monday
    sessionsWeek += 1;
    membersWeek.add(row.user_id);
    if (day === today) sessionsToday += 1;
  }
  return { sessionsToday, sessionsWeek, membersWeek: membersWeek.size };
}

// Cross-schema on purpose: nutrition reads the standalone Nutrition Tracker
// app's live public.* tables (see CLAUDE.md), so this uses the plain
// supabase client with no .schema() override, same as the rest of
// lib/nutrition/*.
//
// "Logged" means put something in today, NOT tapped Finalize — finalizing is
// an end-of-day action, so a finalized-only count reads as an empty gym for
// most of the day and hides a 6am weigh-in until that evening. Shares its
// rule with the mobile dashboard's Nutrition card so the two surfaces can't
// report different numbers for the same sentence.
async function nutritionLoggedToday(today) {
  const [{ data: logs, error: logsError }, { data: clients, error: clientsError }] = await Promise.all([
    supabase.from("daily_logs").select(`client_id, ${CONTENT_COLUMNS.join(", ")}`).eq("date", today),
    supabase.from("clients").select("id").eq("status", "active"),
  ]);
  if (logsError) throw logsError;
  if (clientsError) throw clientsError;
  const activeIds = new Set(clients.map((c) => c.id));
  return {
    logged: logs.filter((l) => activeIds.has(l.client_id) && hasContent(l)).length,
    total: clients.length,
  };
}

async function unreadMessageCount() {
  const summaries = await listThreadSummaries();
  return summaries.filter((s) => s.unread).length;
}

// Members who haven't finalized a session in `days` — the coach-shaped
// card's "Quiet 7+ days" row (2a). Counts members with a group/SPC
// enrollment, not the whole roster, so a nutrition-only client never reads
// as a training client gone quiet.
async function quietMemberCount(today, days = 7) {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const [{ data: recent, error: recentError }, { data: assignments, error: assignError }, { data: spc, error: spcError }] =
    await Promise.all([
      programming.from("session_completions").select("user_id").gte("completed_at", cutoff.toISOString()).limit(2000),
      programming.from("client_program_assignments").select("user_id"),
      programming.from("spc_clients").select("user_id, status"),
    ]);
  if (recentError) throw recentError;
  if (assignError) throw assignError;
  if (spcError) throw spcError;

  const training = new Set(assignments.map((a) => a.user_id));
  for (const c of spc) if (c.status !== "paused") training.add(c.user_id);
  const active = new Set(recent.map((r) => r.user_id));
  return [...training].filter((id) => !active.has(id)).length;
}

export async function getGymToday(today = todayInBoise()) {
  const settle = async (fn) => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const [training, nutrition, prs, unread, quiet] = await Promise.all([
    settle(() => trainingActivity(today)),
    settle(() => nutritionLoggedToday(today)),
    settle(() => countPersonalRecordsOn(today)),
    settle(() => unreadMessageCount()),
    settle(() => quietMemberCount(today)),
  ]);

  return {
    // `sessions` keeps its name: the desktop launchpad and the sessions sheet
    // both read it, and both mean today.
    sessions: training?.sessionsToday ?? null,
    sessionsWeek: training?.sessionsWeek ?? null,
    membersWeek: training?.membersWeek ?? null,
    nutrition,
    prs,
    unread,
    quiet,
  };
}
