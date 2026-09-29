// Everything a coach needs when they open one client for a strategy
// session: when her last session was and who ran it, what the last write-up
// said, an AI summary of her whole note history, her next booking, and
// anything already saved for today.
//
// Works the same whether she's booked on the strategy session calendar or a
// coach pulled her aside unscheduled: nothing here depends on an
// appointment existing.
//
// The summary is cached per client (programming.strategy_session_summaries)
// and only rebuilt when her GHL notes have changed, so a second open is
// instant. A summary failure (AI not configured, API down) doesn't fail the
// request: the coach still gets the history and last note, with
// summary_error saying why the summary is missing.
//
// Body: { ghl_contact_id } or { user_id }, plus optional { refresh: true }
// to force a new summary, and optional { date: "YYYY-MM-DD" } for a coach
// who has stepped the day list to another day: "today's" session, booking
// and "last session" are then relative to that day. Defaults to today.
//
// { summary: "cached" } is the fast first call a screen makes so it can
// render at once: it never calls the AI. It returns the cached summary if
// it's current; if it's missing or stale it returns summary: null with
// summary_pending: true, and builds history from the stale summary's note
// classifications when there are any (old notes don't change, so those
// are still right; only newer notes are missing). The screen then makes a
// normal call to get the fresh summary.
//
// Deploy with: supabase functions deploy strategy-session-client
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildHistory,
  dateInBoise,
  describeGhlError,
  ensureSummary,
  getCalendarId,
  getContactName,
  getContactTexting,
  notesFingerprint,
  readCachedSummary,
  type SummaryRow,
  GhlError,
  isIsoDate,
  isLiveEvent,
  type KovaSessionRow,
  SESSION_COLUMNS,
  listContactAppointments,
  listContactNotes,
  listGhlUsers,
  requireStaff,
  todayInBoise,
} from "../_shared/strategySession.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const auth = await requireStaff(req, createClient, jsonHeaders);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  const input = await req.json().catch(() => ({}));
  let contactId: string | null = typeof input.ghl_contact_id === "string" ? input.ghl_contact_id : null;
  let userId: string | null = typeof input.user_id === "string" ? input.user_id : null;
  const refresh = input.refresh === true;
  const cacheOnly = input.summary === "cached";

  const users = admin.schema("core").from("users");
  if (!contactId && userId) {
    const { data } = await users.select("ghl_contact_id").eq("id", userId).maybeSingle();
    contactId = data?.ghl_contact_id ?? null;
    if (!contactId) return reply({ error: "This client isn't linked to GoHighLevel, so there are no notes to pull." }, 400);
  }
  if (!contactId) return reply({ error: "ghl_contact_id or user_id is required" }, 400);

  const { data: member } = await users.select("id, name").eq("ghl_contact_id", contactId).maybeSingle();
  userId = member?.id ?? userId;

  const calendarId = await getCalendarId(admin);
  if (!calendarId) return reply({ error: "The strategy session calendar isn't set up yet." }, 500);

  const today = input.date === undefined ? todayInBoise() : input.date;
  if (!isIsoDate(today)) return reply({ error: "date must be a YYYY-MM-DD date" }, 400);

  let notes, appointments, ghlUsers, contactName, texting;
  try {
    [notes, appointments, ghlUsers, contactName, texting] = await Promise.all([
      listContactNotes(contactId),
      listContactAppointments(contactId),
      listGhlUsers(),
      member?.name ? Promise.resolve(member.name as string) : getContactName(contactId),
      // Whether a copy can be texted to her after saving. Unknown (null)
      // on a failed lookup: the screen still offers, and the send says why.
      getContactTexting(contactId).catch(() => null),
    ]);
  } catch (err) {
    if (err instanceof GhlError && err.status === 404) return reply({ error: "That client wasn't found in GoHighLevel." }, 404);
    return reply({ error: describeGhlError(err) }, 502);
  }

  const { data: kovaRowsData, error: kovaErr } = await admin
    .schema("programming")
    .from("strategy_sessions")
    .select(SESSION_COLUMNS)
    .eq("ghl_contact_id", contactId)
    .order("held_on", { ascending: false });
  if (kovaErr) return reply({ error: kovaErr.message }, 500);
  const kovaRows = (kovaRowsData ?? []) as KovaSessionRow[];

  const coachIds = [...new Set(kovaRows.map((r) => r.coach_id).filter(Boolean))] as string[];
  const kovaNames = new Map<string, string>();
  if (coachIds.length) {
    const { data } = await users.select("id, name").in("id", coachIds);
    for (const u of data ?? []) kovaNames.set(u.id, u.name);
  }

  let summaryRow: SummaryRow | null = null;
  let staleRow: SummaryRow | null = null;
  let summaryPending = false;
  let summaryError: string | null = null;
  if (cacheOnly) {
    const cached = await readCachedSummary(admin, contactId);
    if (cached && cached.notes_fingerprint === (await notesFingerprint(notes))) summaryRow = cached;
    else {
      staleRow = cached;
      summaryPending = notes.length > 0;
    }
  } else {
    try {
      summaryRow = await ensureSummary(admin, contactId, userId, notes, ghlUsers, refresh);
    } catch (err) {
      console.error("summary failed:", err);
      summaryError = err instanceof Error ? err.message : "The AI summary failed.";
    }
  }

  const history = buildHistory({
    notes,
    verdicts: (summaryRow ?? staleRow)?.summary.notes ?? [],
    appointments,
    calendarId,
    kovaRows,
    ghlUsers,
    kovaNames,
    today,
  });

  const bookings = appointments
    .filter((a) => a.calendarId === calendarId && isLiveEvent(a))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const todayBooking = bookings.find((a) => dateInBoise(a.startTime) === today) ?? null;
  const nextBooking = bookings.find((a) => dateInBoise(a.startTime) > today) ?? null;
  const describeBooking = (a: typeof todayBooking) =>
    a && {
      appointment_id: a.id,
      starts_at: a.startTime,
      date: dateInBoise(a.startTime),
      coach_name: (a.assignedUserId && ghlUsers.get(a.assignedUserId)?.name) || null,
    };

  // "Last session" means the last one before today: today's is the one
  // being held right now.
  // Discovery sessions are in history to be read, never "last session".
  const past = history.filter((e) => e.date < today && e.kind === "strategy_session");
  const lastWithNote = past.find((e) => e.note_text);
  // The write-up card shows her latest strategy session with notes. With
  // none yet (a new client whose only note is her discovery session), it
  // shows nothing and history carries the discovery session.
  const todayRow = kovaRows.find((r) => r.held_on === today) ?? null;
  const { notes: _verdicts, ...summary } = summaryRow?.summary ?? ({} as Record<string, unknown>);

  return reply({
    client: { ghl_contact_id: contactId, user_id: userId, name: contactName ?? null, texting },
    today,
    last_session: past[0] ?? null,
    last_note: lastWithNote ? { date: lastWithNote.date, coach_name: lastWithNote.coach_name, text: lastWithNote.note_text } : null,
    sessions: history,
    summary: summaryRow ? summary : null,
    summary_generated_at: summaryRow?.generated_at ?? null,
    summary_error: summaryError,
    summary_pending: summaryPending,
    note_count: notes.length,
    today_booking: describeBooking(todayBooking),
    next_booking: describeBooking(nextBooking),
    today_session: todayRow && {
      id: todayRow.id,
      notes: todayRow.notes,
      ghl_synced: !!todayRow.ghl_note_id,
      pillar: todayRow.pillar ?? null,
      goal: todayRow.goal ?? null,
      plan: todayRow.plan ?? null,
      client_notes: todayRow.client_notes ?? null,
      coach_notes: todayRow.coach_notes ?? null,
      texted_at: todayRow.texted_at ?? null,
      texted_body: todayRow.texted_body ?? null,
      saved_at: todayRow.updated_at ?? null,
    },
  });
});
