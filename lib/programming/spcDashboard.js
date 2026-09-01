import { core, programming } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { getSetting } from "../settings";

// checkAndAutoDraft() used to live here — a client-side stand-in for the
// block-ending scan, run on every SPC-dashboard and coach-Home load back when
// this app had no server cron. It does now: supabase/functions/scan-spc-alerts
// runs nightly (migration 0013, job `spc-alert-scan`, verified firing). Keeping
// both meant two implementations of one job, and they had already drifted —
// the server one creates a DRAFT (0089) while this one still created a live,
// dated block whose week 1 ran down while the coach wrote it. Deleted rather
// than fixed: creating a training block as a side effect of somebody opening a
// page was always the wrong shape.

function daysBetween(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
}



// Batched roster query — clients + their latest block + names — same shape
// as lib/nutrition/dashboard.js's getNutritionRoster (batch fetch, merge
// core.users names client-side, same cross-schema pattern as comments.js).
export async function getSpcRoster() {
  // Same exclusion as getSpcRosterDetail: status='inactive' (0108) means the
  // SPC switch on her client page is off, so she is not on this roster.
  const { data: clients, error: clientsError } = await programming
    .from("spc_clients")
    .select("*")
    .neq("status", "inactive");
  if (clientsError) throw clientsError;
  if (clients.length === 0) return [];

  const userIds = clients.map((c) => c.user_id);
  const coachIds = [...new Set(clients.map((c) => c.assigned_coach_id).filter(Boolean))];
  const allIds = [...new Set([...userIds, ...coachIds])];

  const leadTimeDays = Number(await getSetting("alert_lead_time_days", 3));

  const [{ data: blocks, error: blocksError }, { data: users, error: usersError }] = await Promise.all([
    // Drafts (0089) come back too — an unsent draft is the signal that
    // replaced the hand-set 'new_program_asap' status, and it costs nothing
    // to carry here since they're rows in the same table. They're split out
    // below rather than filtered in SQL.
    programming
      .from("spc_blocks")
      .select("*")
      .in("spc_client_id", userIds)
      .order("block_start_date", { ascending: false, nullsFirst: false }),
    core.from("users").select("id, name").in("id", allIds),
  ]);
  if (blocksError) throw blocksError;
  if (usersError) throw usersError;

  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

  // blocks is already ordered newest-first, so the first match per client is
  // their latest block. A draft carries no dates, so it can never be "latest"
  // — but its existence is what the dashboard's attention rows key on.
  const latestBlockByClient = new Map();
  const draftByClient = new Map();
  for (const block of blocks) {
    if (block.status === "draft") {
      if (!draftByClient.has(block.spc_client_id)) draftByClient.set(block.spc_client_id, block);
      continue;
    }
    if (!latestBlockByClient.has(block.spc_client_id)) latestBlockByClient.set(block.spc_client_id, block);
  }

  const today = todayInBoise();

  return clients.map((client) => {
    const block = latestBlockByClient.get(client.user_id) ?? null;
    const daysUntilEnd = block ? daysBetween(today, block.block_end_date) : null;
    return {
      userId: client.user_id,
      name: nameById[client.user_id] ?? "Unknown",
      coachId: client.assigned_coach_id,
      coachName: client.assigned_coach_id ? (nameById[client.assigned_coach_id] ?? "Unassigned") : "Unassigned",
      sessionsPerWeek: client.sessions_per_week,
      status: client.status,
      notesGoalsFeedback: client.notes_goals_feedback,
      currentBlock: block,
      // An unsent draft written for this client (0089). Replaces the
      // 'new_program_asap' status the auto-draft used to stamp on.
      hasDraft: draftByClient.has(client.user_id),
      // Enrolled but never programmed — 51 of 73 active rows. Not a backlog.
      everScheduled: latestBlockByClient.has(client.user_id),
      daysUntilEnd,
      // dueSoon's threshold already covers overdue blocks (a negative
      // daysUntilEnd is <= leadTimeDays) — overdue is a stricter subset,
      // surfaced separately since "already past due" is a more urgent
      // signal than "coming up soon" on a dashboard.
      dueSoon: daysUntilEnd !== null && daysUntilEnd <= leadTimeDays,
      overdue: daysUntilEnd !== null && daysUntilEnd < 0,
    };
  });
}
