import { programming, supabase } from "../supabase/client";
import { todayInBoise, dateInBoise } from "../boiseDate";
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

async function sessionsLoggedToday(today) {
  // Over-fetch a day of UTC slack, then re-filter on the Boise-local date —
  // same boundary handling as listSessionsSinceAllUsers, because
  // completed_at is a timestamptz and "today" here means Boise's today.
  const utcFloor = new Date(`${today}T00:00:00Z`);
  utcFloor.setUTCDate(utcFloor.getUTCDate() - 1);
  const { data, error } = await programming
    .from("session_completions")
    .select("id, completed_at")
    .gte("completed_at", utcFloor.toISOString())
    .limit(1000);
  if (error) throw error;
  return data.filter((c) => dateInBoise(new Date(c.completed_at)) === today).length;
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

// Total load moved across the gym today — sum of reps x weight over every
// set logged. Bodyweight work contributes 0 (no weight recorded), which is
// honest rather than guessed at.
async function volumeToday(today) {
  const { data, error } = await programming
    .from("logs")
    .select("reps, weight")
    .eq("date_performed", today)
    .limit(5000);
  if (error) throw error;
  let total = 0;
  for (const row of data) {
    if (row.reps && row.weight) total += row.reps * row.weight;
  }
  return Math.round(total);
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

  const [sessions, nutrition, prs, unread, quiet, volume] = await Promise.all([
    settle(() => sessionsLoggedToday(today)),
    settle(() => nutritionLoggedToday(today)),
    settle(() => countPersonalRecordsOn(today)),
    settle(() => unreadMessageCount()),
    settle(() => quietMemberCount(today)),
    settle(() => volumeToday(today)),
  ]);

  return { sessions, nutrition, prs, unread, quiet, volume };
}
