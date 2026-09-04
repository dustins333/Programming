import { programming, supabase } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { countPersonalRecordsOn } from "./exerciseStats";
import { listThreadSummaries } from "./messages";
import { CONTENT_COLUMNS, hasContent } from "./dashboardCards";
import { getGymWeek } from "./gymWeek";

// "TODAY IN THE GYM" — the small four-row card on the coach-web launchpad
// (design_handoff_coach_web_v2, 1a). Every number here is a live count over
// data that already exists; nothing is stored.
//
// Each figure is fetched in its own try/catch and falls back to null rather
// than 0. A row that failed to load must not render as "0 sessions logged"
// — that reads as a quiet gym rather than a broken query, and it's the kind
// of wrong number a coach would act on.

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
  // status === "active", not <> "paused": 0108 split "on hold" from "the SPC
  // switch is off", and an inactive client would otherwise read as quiet
  // forever.
  for (const c of spc) if (c.status === "active") training.add(c.user_id);
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

  const [week, nutrition, prs, unread, quiet] = await Promise.all([
    settle(() => getGymWeek(today)),
    settle(() => nutritionLoggedToday(today)),
    settle(() => countPersonalRecordsOn(today)),
    settle(() => unreadMessageCount()),
    settle(() => quietMemberCount(today)),
  ]);

  return {
    // `sessions` keeps its name: the desktop launchpad and the sessions sheet
    // both read it, and both mean today.
    sessions: week?.counts.sessionsToday ?? null,
    sessionsWeek: week?.counts.sessionsWeek ?? null,
    membersWeek: week?.counts.membersWeek ?? null,
    membersNotSeen: week?.counts.membersNotSeen ?? null,
    // The rows behind those four numbers. The mobile band's sheets render
    // these rather than fetching again, so a tile and the list it opens can
    // never disagree about who is on it.
    week,
    nutrition,
    prs,
    unread,
    quiet,
  };
}
