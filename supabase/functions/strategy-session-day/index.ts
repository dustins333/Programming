// The strategy session day list: who's booked on the strategy session
// calendar for a given day (today by default), and who's had a session
// recently enough to count as done.
//
// scheduled: every live booking that day, read straight from GHL, in start
// order. Each carries done: true once a session has been saved for that
// client that day; the screen decides whether to hide or grey those.
//
// completed: everyone with a session within COMPLETED_WINDOW_DAYS either
// side of the day. Deliberately loose: sessions are months apart, so a
// session anywhere in that window is "this round's". Found from Kova's own
// saves and from the dates the AI summary pulled out of GHL notes, so a
// session written straight into GHL still counts once that client's
// summary has been built.
//
// Opening the list also warms the summary cache for everyone booked that
// day, in the background after the response is sent, so tapping into a
// client is instant rather than waiting on the AI. This replaces a 5am cron:
// it follows whatever the calendar says when a coach actually looks, and it
// needs no secret or schedule.
//
// It also retries, in the same background pass, any recent save whose GHL
// note never went through (strategy_sessions.ghl_note_id still null). The
// save screen promises "we'll keep trying on our own", and this is what
// keeps that promise after the coach has left the screen: any coach opening
// the list is the next attempt.
//
// Body: optional { date: "YYYY-MM-DD" }.
//
// Deploy with: supabase functions deploy strategy-session-day
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  addDays,
  dateInBoise,
  describeGhlError,
  ensureSummary,
  getCalendarId,
  getContactName,
  type GhlUser,
  isIsoDate,
  isLiveEvent,
  type KovaSessionRow,
  listCalendarEvents,
  listContactNotes,
  listGhlUsers,
  requireStaff,
  SESSION_COLUMNS,
  syncSessionToGhl,
  todayInBoise,
} from "../_shared/strategySession.ts";

const COMPLETED_WINDOW_DAYS = 21;
const WARM_CONCURRENCY = 3;
const RETRY_LIMIT = 10;

async function retryUnsynced(admin: SupabaseClient, ghlUsers: Map<string, GhlUser>) {
  const { data, error } = await admin
    .schema("programming")
    .from("strategy_sessions")
    .select(SESSION_COLUMNS)
    .is("ghl_note_id", null)
    .gte("held_on", addDays(todayInBoise(), -COMPLETED_WINDOW_DAYS))
    .order("updated_at", { ascending: true })
    .limit(RETRY_LIMIT);
  if (error) return console.error("unsynced lookup failed:", error.message);
  for (const row of (data ?? []) as KovaSessionRow[]) {
    try {
      await syncSessionToGhl(admin, row, ghlUsers);
    } catch (err) {
      console.error(`GHL retry failed for session ${row.id}:`, err);
    }
  }
}

async function warmSummaries(
  admin: SupabaseClient,
  clients: Array<{ contactId: string; userId: string | null }>,
  ghlUsers: Map<string, GhlUser>,
) {
  const queue = [...clients];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        const notes = await listContactNotes(next.contactId);
        await ensureSummary(admin, next.contactId, next.userId, notes, ghlUsers);
      } catch (err) {
        console.error(`summary warm failed for ${next.contactId}:`, err);
      }
    }
  };
  await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const auth = await requireStaff(req, createClient, jsonHeaders);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  const input = await req.json().catch(() => ({}));
  const date = input.date === undefined ? todayInBoise() : input.date;
  if (!isIsoDate(date)) return reply({ error: "date must be a YYYY-MM-DD date" }, 400);

  const calendarId = await getCalendarId(admin);
  if (!calendarId) return reply({ error: "The strategy session calendar isn't set up yet." }, 500);

  // A UTC window a day wider than the Boise day on each side, then filtered
  // to the Boise date, so no offset arithmetic can clip an early or late
  // appointment.
  const startMs = Date.parse(`${addDays(date, -1)}T00:00:00Z`);
  const endMs = Date.parse(`${addDays(date, 2)}T00:00:00Z`);

  let events, ghlUsers;
  try {
    [events, ghlUsers] = await Promise.all([listCalendarEvents(calendarId, startMs, endMs), listGhlUsers()]);
  } catch (err) {
    return reply({ error: describeGhlError(err) }, 502);
  }
  const booked = events
    .filter((e) => isLiveEvent(e) && e.contactId && dateInBoise(e.startTime) === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const programming = admin.schema("programming");
  const windowStart = addDays(date, -COMPLETED_WINDOW_DAYS);
  const windowEnd = addDays(date, COMPLETED_WINDOW_DAYS);
  const bookedIds = [...new Set(booked.map((e) => e.contactId))];

  const [{ data: recentRows, error: rowsErr }, { data: noteDated, error: notedErr }, { data: bookedSummaries }] = await Promise.all([
    programming
      .from("strategy_sessions")
      .select("id, ghl_contact_id, user_id, held_on, coach_id, coach_notes")
      .gte("held_on", windowStart)
      .lte("held_on", windowEnd),
    programming
      .from("strategy_session_summaries")
      .select("ghl_contact_id, user_id, last_session_on")
      .gte("last_session_on", windowStart)
      .lte("last_session_on", windowEnd),
    bookedIds.length
      ? programming.from("strategy_session_summaries").select("ghl_contact_id, last_session_on").in("ghl_contact_id", bookedIds)
      : Promise.resolve({ data: [] }),
  ]);
  if (rowsErr || notedErr) return reply({ error: (rowsErr ?? notedErr)!.message }, 500);

  // Kova names for every client and coach in play. Clients without a Kova
  // account (a few booked contacts have none) get their name from GHL.
  const contactIds = [
    ...new Set([...bookedIds, ...(recentRows ?? []).map((r) => r.ghl_contact_id), ...(noteDated ?? []).map((r) => r.ghl_contact_id)]),
  ];
  const coachIds = [...new Set((recentRows ?? []).map((r) => r.coach_id).filter(Boolean))] as string[];
  const users = admin.schema("core").from("users");
  const [{ data: members }, { data: coaches }] = await Promise.all([
    contactIds.length ? users.select("id, name, ghl_contact_id").in("ghl_contact_id", contactIds) : Promise.resolve({ data: [] }),
    coachIds.length ? users.select("id, name").in("id", coachIds) : Promise.resolve({ data: [] }),
  ]);
  const memberByContact = new Map((members ?? []).map((m) => [m.ghl_contact_id, m]));
  const coachName = new Map((coaches ?? []).map((c) => [c.id, c.name]));

  const missing = contactIds.filter((id) => !memberByContact.has(id));
  const ghlNames = new Map<string, string | null>();
  await Promise.all(
    missing.map(async (id) => {
      try {
        ghlNames.set(id, await getContactName(id));
      } catch {
        ghlNames.set(id, null);
      }
    }),
  );
  const client = (contactId: string) => {
    const m = memberByContact.get(contactId);
    return { ghl_contact_id: contactId, user_id: m?.id ?? null, name: m?.name ?? ghlNames.get(contactId) ?? null };
  };

  const doneToday = new Set((recentRows ?? []).filter((r) => r.held_on === date).map((r) => r.ghl_contact_id));
  const lastNoted = new Map((bookedSummaries ?? []).map((s) => [s.ghl_contact_id, s.last_session_on]));

  const scheduled = booked.map((e) => ({
    appointment_id: e.id,
    starts_at: e.startTime,
    ends_at: e.endTime ?? null,
    status: e.appointmentStatus ?? null,
    coach_name: (e.assignedUserId && ghlUsers.get(e.assignedUserId)?.name) || null,
    client: client(e.contactId),
    done: doneToday.has(e.contactId),
    // Last session found in her notes, from the cached summary. Null until
    // the summary exists; the client detail call always has the full answer.
    last_session_on: lastNoted.get(e.contactId) ?? null,
  }));

  // Completed: one entry per client, the session closest to the day.
  // A Kova save beats a note-derived date for the same client.
  // Kova saves carry has_coach_notes, for the list's "Add coach notes" /
  // "Edit coach notes" button; a session written straight into GHL has no
  // Kova row to add them to, so it gets no button.
  type Completed = { held_on: string; coach_name: string | null; source: "kova" | "notes"; has_coach_notes: boolean };
  const completedByContact = new Map<string, Completed>();
  for (const r of noteDated ?? []) {
    completedByContact.set(r.ghl_contact_id, { held_on: r.last_session_on, coach_name: null, source: "notes", has_coach_notes: false });
  }
  for (const r of recentRows ?? []) {
    const prev = completedByContact.get(r.ghl_contact_id);
    if (prev?.source === "kova" && prev.held_on >= r.held_on) continue;
    completedByContact.set(r.ghl_contact_id, {
      held_on: r.held_on,
      coach_name: r.coach_id ? coachName.get(r.coach_id) ?? null : null,
      source: "kova",
      has_coach_notes: !!r.coach_notes,
    });
  }
  const completed = [...completedByContact.entries()]
    .map(([contactId, s]) => ({ client: client(contactId), ...s }))
    .sort((a, b) => b.held_on.localeCompare(a.held_on) || (a.client.name ?? "").localeCompare(b.client.name ?? ""));

  // After responding: retry saves that never reached GHL, then warm
  // summaries for today's not-yet-done bookings.
  const toWarm = scheduled.filter((s) => !s.done).map((s) => ({ contactId: s.client.ghl_contact_id, userId: s.client.user_id }));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil(
    retryUnsynced(admin, ghlUsers).then(() => (toWarm.length ? warmSummaries(admin, toWarm, ghlUsers) : undefined)),
  );

  return reply({ date, window_days: COMPLETED_WINDOW_DAYS, scheduled, completed });
});
