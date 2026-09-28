// Strategy sessions: the 3x-a-year coach/client sit-down. Everything goes
// through the strategy-session-* Edge Functions, because the data lives in
// GoHighLevel (calendar, notes) and the GHL token and AI key are server-side
// secrets. See docs/history/coach-web.md, "Strategy sessions".
import { core, programming, supabase } from "../supabase/client";

// Kova's four pillars plus "not sure", in display order. Keys match the
// server's PILLARS (supabase/functions/_shared/strategySession.ts) and the
// CHECK on programming.strategy_sessions.pillar (0137).
export const PILLARS = [
  { value: "strength", label: "Strength / performance" },
  { value: "body_comp", label: "Body comp / aesthetics" },
  { value: "weight_loss", label: "Weight loss" },
  { value: "general_health", label: "General health" },
  { value: "not_sure", label: "Not sure" },
];

export function pillarLabel(value) {
  return PILLARS.find((p) => p.value === value)?.label ?? null;
}

// The day list. Returns { date, window_days, scheduled, completed }:
//   scheduled[]: { appointment_id, starts_at, ends_at, status, coach_name,
//                  client: { ghl_contact_id, user_id, name }, done,
//                  last_session_on }
//   completed[]: { client, held_on, coach_name, source: "kova" | "notes" }
// `date` is optional (YYYY-MM-DD, Boise); omitted means today.
export async function getStrategySessionDay(date) {
  return call("strategy-session-day", date ? { date } : {});
}

// One client's session prep. Pass { ghlContactId } (from the day list) or
// { userId } (from client search). Returns:
//   client, today, last_session, last_note: { date, coach_name, text },
//   sessions[] (newest first: { kind, date, coach_name, sources, note_text, ... };
//     kind "discovery_session" rows are for reading only, never "last session"),
//   summary: { recap, pillar, pillar_reason, ask_about } | null,
//   summary_generated_at, summary_error (why summary is null, if it is),
//   summary_pending, note_count,
//   today_booking, next_booking,
//   today_session: { id, notes, pillar, ghl_synced, saved_at } | null
// The first open of a client whose notes changed waits on the AI (several
// seconds); later opens are instant. refresh: true forces a new summary.
// `date` (YYYY-MM-DD) makes "today" that day instead, for a coach who has
// stepped the day list to another date.
//
// cachedOnly: true never waits on the AI: it returns the cached summary if
// it's current, else summary null with summary_pending true. Call it first
// to render at once, then call again without it when summary_pending.
export async function getStrategySessionClient({ ghlContactId, userId, refresh, date, cachedOnly } = {}) {
  return call("strategy-session-client", {
    ...(ghlContactId ? { ghl_contact_id: ghlContactId } : { user_id: userId }),
    ...(refresh ? { refresh: true } : {}),
    ...(cachedOnly ? { summary: "cached" } : {}),
    ...(date ? { date } : {}),
  });
}

// Every client, for search, with the last strategy session Kova knows
// about. Read straight from the tables (staff-readable under RLS) rather
// than through GHL, so it's instant. "Knows about" matters: a client whose
// notes have never been summarized and who has never been saved here has
// lastSession null, which means unknown, not "none". noSessions is true
// only when her notes HAVE been read and held no session.
export async function listStrategySearchClients() {
  const [members, summaries, saved] = await Promise.all([
    core.from("users").select("id, name, ghl_contact_id").eq("role", "member").eq("is_gym_display", false).order("name"),
    programming.from("strategy_session_summaries").select("ghl_contact_id, last_session_on"),
    programming.from("strategy_sessions").select("ghl_contact_id, held_on, coach_id").order("held_on", { ascending: false }),
  ]);
  for (const r of [members, summaries, saved]) if (r.error) throw r.error;

  const coachIds = [...new Set(saved.data.map((r) => r.coach_id).filter(Boolean))];
  const coaches = coachIds.length ? await core.from("users").select("id, name").in("id", coachIds) : { data: [] };
  if (coaches.error) throw coaches.error;
  const coachName = new Map(coaches.data.map((c) => [c.id, c.name]));

  const summaryBy = new Map(summaries.data.map((s) => [s.ghl_contact_id, s.last_session_on]));
  const savedBy = new Map();
  for (const r of saved.data) if (!savedBy.has(r.ghl_contact_id)) savedBy.set(r.ghl_contact_id, r);

  return members.data.map((m) => {
    const fromNotes = m.ghl_contact_id ? summaryBy.get(m.ghl_contact_id) ?? null : null;
    const fromKova = m.ghl_contact_id ? savedBy.get(m.ghl_contact_id) ?? null : null;
    let lastSession = null;
    if (fromKova && (!fromNotes || fromKova.held_on >= fromNotes)) {
      lastSession = { date: fromKova.held_on, coachName: coachName.get(fromKova.coach_id) ?? null };
    } else if (fromNotes) {
      lastSession = { date: fromNotes, coachName: null };
    }
    return {
      userId: m.id,
      ghlContactId: m.ghl_contact_id,
      name: m.name,
      lastSession,
      noSessions: !lastSession && m.ghl_contact_id != null && summaryBy.has(m.ghl_contact_id),
    };
  });
}

// Saves today's session and writes it to the client's GHL notes. Saving the
// same client again the same day edits that session rather than adding one.
// `pillar` (a PILLARS value) is required: the coach's choice, locked in by
// saving. Returns { session, ghl_synced, error? }: ghl_synced false means the
// notes are saved in Kova but didn't reach GHL; saving again retries.
export async function saveStrategySession({ ghlContactId, userId, notes, pillar, appointmentId, heldOn }) {
  return call("strategy-session-save", {
    ...(ghlContactId ? { ghl_contact_id: ghlContactId } : { user_id: userId }),
    notes,
    pillar,
    ...(appointmentId ? { appointment_id: appointmentId } : {}),
    ...(heldOn ? { held_on: heldOn } : {}),
  });
}

async function call(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data;
}

// supabase-js's FunctionsHttpError.message is always a generic "non-2xx"
// string; the real reason is in the response body. Same as ghlImports.js.
async function extractFunctionErrorMessage(error) {
  try {
    const body = await error.context?.json();
    if (body?.error) return body.error;
  } catch {
    // fall through
  }
  return error.message || "Something went wrong.";
}
