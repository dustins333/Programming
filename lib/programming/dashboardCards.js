import { supabase } from "../supabase/client";
import { todayInBoise, addDays } from "../boiseDate";

// Any column a client fills in herself. A daily_logs row can exist while
// still being empty (opened the tab, typed nothing), and an empty row is not
// someone who logged today.
export const CONTENT_COLUMNS = [
  "weight",
  "protein_g",
  "carb_g",
  "fat_g",
  "fiber_g",
  "calories_override",
  "steps",
  "sleep_hours",
  "sleep_quality",
  "hunger",
  "energy",
  "client_note",
];

export function hasContent(log) {
  return CONTENT_COLUMNS.some((c) => log[c] !== null && log[c] !== undefined && log[c] !== "");
}

// Per-client detail behind the mobile dashboard's Nutrition card: who
// actually logged today, what they weighed, and what they've averaged over
// the trailing week so today's number has something to sit against.
//
// Counts anyone who has PUT SOMETHING IN today, not just whoever has tapped
// Finalize. Finalizing is an end-of-day action, so a finalized-only count
// reads as an empty gym for most of the day and only becomes true after
// dinner — useless on the surface a coach checks mid-afternoon. Over a
// recent two-week window 27 of 213 rows were still open, and during a live
// day that share is far higher. `finalized` rides along per row so the
// distinction isn't lost, it's just no longer the gate.
//
// Its own focused pair of queries rather than a field bolted onto
// getNutritionRoster: that function fetches check-ins, targets, coaches and
// onboarding phases for the entire roster to compute status buckets, none of
// which this card needs. Cross-schema on purpose — nutrition reads the
// standalone Nutrition Tracker app's live public.* tables (see CLAUDE.md),
// so this uses the plain supabase client with no .schema() override.
//
// Throws rather than swallowing: the caller decides what a failed card looks
// like, and a card that silently renders 0 would read as "nobody logged
// today", which is a real answer rather than a missing one.
export async function getNutritionToday(today = todayInBoise()) {
  const weekAgo = addDays(today, -6);

  const [{ data: clients, error: clientsError }, { data: logs, error: logsError }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("status", "active"),
    supabase
      .from("daily_logs")
      .select(`client_id, date, finalized_at, ${CONTENT_COLUMNS.join(", ")}`)
      .gte("date", weekAgo)
      .lte("date", today),
  ]);
  if (clientsError) throw clientsError;
  if (logsError) throw logsError;

  const nameById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const byClient = new Map();
  for (const log of logs ?? []) {
    if (!nameById.has(log.client_id)) continue; // inactive/archived client
    if (!byClient.has(log.client_id)) byClient.set(log.client_id, []);
    byClient.get(log.client_id).push(log);
  }

  const rows = [];
  for (const [clientId, clientLogs] of byClient) {
    const todayLog = clientLogs.find((l) => l.date === today && hasContent(l));
    if (!todayLog) continue;
    const weights = clientLogs.map((l) => l.weight).filter((w) => w !== null && w !== undefined);
    rows.push({
      userId: clientId,
      name: nameById.get(clientId) ?? "Unnamed",
      weightToday: todayLog.weight ?? null,
      avgWeight: weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null,
      finalized: Boolean(todayLog.finalized_at),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    loggedCount: rows.length,
    finalizedCount: rows.filter((r) => r.finalized).length,
    totalCount: clients?.length ?? 0,
  };
}
