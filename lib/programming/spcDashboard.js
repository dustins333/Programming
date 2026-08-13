import { core, programming } from "../supabase/client";
import { addDays, todayInBoise } from "../boiseDate";
import { getSetting } from "../settings";
import { createSpcBlock } from "./spcBlocks";
import { setSpcStatus } from "./spcClients";

function daysBetween(start, end) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
}



// Batched roster query — clients + their latest block + names — same shape
// as lib/nutrition/dashboard.js's getNutritionRoster (batch fetch, merge
// core.users names client-side, same cross-schema pattern as comments.js).
export async function getSpcRoster() {
  const { data: clients, error: clientsError } = await programming.from("spc_clients").select("*");
  if (clientsError) throw clientsError;
  if (clients.length === 0) return [];

  const userIds = clients.map((c) => c.user_id);
  const coachIds = [...new Set(clients.map((c) => c.assigned_coach_id).filter(Boolean))];
  const allIds = [...new Set([...userIds, ...coachIds])];

  const leadTimeDays = Number(await getSetting("alert_lead_time_days", 3));

  const [{ data: blocks, error: blocksError }, { data: users, error: usersError }] = await Promise.all([
    programming
      .from("spc_blocks")
      .select("*")
      .in("spc_client_id", userIds)
      .order("block_start_date", { ascending: false }),
    core.from("users").select("id, name").in("id", allIds),
  ]);
  if (blocksError) throw blocksError;
  if (usersError) throw usersError;

  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

  // blocks is already ordered newest-first, so the first match per client is
  // their latest block.
  const latestBlockByClient = new Map();
  for (const block of blocks) {
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

// Client-side stand-in for the spec's block-ending alert + auto-draft job —
// there's no server cron in this app yet, so this runs whenever a coach
// opens the SPC dashboard instead of on a schedule. Deliberately narrow: it
// only acts on clients who already have an established block (a brand-new
// SPC client's first block is a deliberate coach action, not something to
// silently backdate to today), and it's self-limiting — once a next block
// exists, it becomes "the latest block" and its far-off end date no longer
// trips the lead-time check, so this won't create duplicates on repeat runs.
export async function checkAndAutoDraft() {
  const leadTimeDays = Number(await getSetting("alert_lead_time_days", 3));
  const today = todayInBoise();

  const { data: clients, error } = await programming.from("spc_clients").select("*").neq("status", "paused");
  if (error) throw error;
  if (clients.length === 0) return;

  // One batched blocks query (newest-first, first row per client wins) instead
  // of a serial getLatestSpcBlock() round-trip per client — this runs on every
  // SPC-dashboard and coach-Home load, so per-client queries scale badly with
  // roster size. Same ordering semantics as getLatestSpcBlock (block_start_date
  // desc), same first-match-wins merge as getSpcRoster above.
  const { data: blocks, error: blocksError } = await programming
    .from("spc_blocks")
    .select("*")
    .in(
      "spc_client_id",
      clients.map((c) => c.user_id)
    )
    .order("block_start_date", { ascending: false });
  if (blocksError) throw blocksError;

  const latestBlockByClient = new Map();
  for (const block of blocks) {
    if (!latestBlockByClient.has(block.spc_client_id)) latestBlockByClient.set(block.spc_client_id, block);
  }

  for (const client of clients) {
    const latest = latestBlockByClient.get(client.user_id);
    if (!latest) continue;

    const daysUntilEnd = daysBetween(today, latest.block_end_date);
    if (daysUntilEnd > leadTimeDays) continue;

    // A rolling block grows rather than being succeeded — the daily scan
    // (supabase/functions/scan-spc-alerts) does the extending. Drafting a
    // successor here would put a duplicate right behind it, which is
    // exactly the churn rolling blocks exist to remove. The extension
    // itself deliberately isn't done here: this runs on every SPC-dashboard
    // and coach-Home load, and growing a block as a side effect of someone
    // opening a page would make its length depend on who browsed when.
    if (latest.auto_extend) continue;

    await createSpcBlock({
      spcClientId: client.user_id,
      coachId: client.assigned_coach_id ?? latest.coach_id,
      startDate: addDays(latest.block_end_date, 1),
      lengthWeeks: latest.block_length_weeks,
      sessionsPerWeek: client.sessions_per_week,
    });
    await setSpcStatus(client.user_id, "new_program_asap");
  }
}
