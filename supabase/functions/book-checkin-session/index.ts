// Books a real appointment on the calling member's own coach's GHL calendar
// (resolveCheckinCalendarId, 0077 — same resolution the slots function used
// to build the picker, shared so the two can never disagree about which
// calendar a slot came from), using their stored ghl_contact_id (see
// import-client + migration 0026 — Kova never stores a phone number, only
// the GHL contact id). Called right after a member picks a slot from
// get-checkin-booking-slots. JWT-verified (default deploy), same auth
// pattern as ensure-nutrition-coach.
//
// Deploy with: supabase functions deploy book-checkin-session
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveCheckinCalendarId } from "../_shared/checkinCalendar.ts";

const GHL_VERSION = "2021-04-15";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: jsonHeaders });
  }

  const { startTime } = await req.json().catch(() => ({}));
  if (!startTime || typeof startTime !== "string") {
    return new Response(JSON.stringify({ error: "startTime is required" }), { status: 400, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers: jsonHeaders });
  }

  const { data: profile } = await adminClient.schema("core").from("users").select("ghl_contact_id").eq("id", caller.id).maybeSingle();
  if (!profile?.ghl_contact_id) {
    return new Response(JSON.stringify({ error: "We can't find your scheduling contact yet — ask your coach to book this one for you." }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const apiKey = Deno.env.get("GHL_API_KEY");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  if (!apiKey || !locationId) {
    return new Response(JSON.stringify({ error: "Scheduling isn't configured yet — ask your coach to book this for you." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const calendarId = await resolveCheckinCalendarId(adminClient, caller.id);
  if (!calendarId) {
    return new Response(JSON.stringify({ error: "Scheduling isn't set up yet — ask your coach to book this for you." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  // Slot duration comes from the calendar itself rather than being
  // hardcoded here, so a future change to the calendar's own slot length
  // (Settings -> GHL, outside this app) doesn't silently desync endTime.
  let slotDurationMinutes = 30;
  try {
    const calResp = await fetch(`https://services.leadconnectorhq.com/calendars/${calendarId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION },
    });
    if (calResp.ok) {
      const calBody = await calResp.json();
      if (calBody?.calendar?.slotDuration) slotDurationMinutes = calBody.calendar.slotDuration;
    }
  } catch (err) {
    console.error("Failed to read calendar slot duration, defaulting to 30min:", err);
  }

  const endTime = new Date(new Date(startTime).getTime() + slotDurationMinutes * 60 * 1000).toISOString();

  const bookResp = await fetch("https://services.leadconnectorhq.com/calendars/events/appointments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      calendarId,
      locationId,
      contactId: profile.ghl_contact_id,
      startTime,
      endTime,
      appointmentStatus: "confirmed",
    }),
  });

  const bookBody = await bookResp.text();
  if (!bookResp.ok) {
    console.error("GHL create-appointment failed:", bookResp.status, bookBody);
    // A slot someone else just took is the one failure worth naming
    // specifically -- everything else collapses to a generic retry message.
    const alreadyTaken = bookResp.status === 422 || /slot|unavailable|conflict/i.test(bookBody);
    return new Response(
      JSON.stringify({
        error: alreadyTaken
          ? "That time was just taken — pick another one."
          : "Couldn't book that time right now — try again in a bit.",
      }),
      { status: 502, headers: jsonHeaders }
    );
  }

  // Mirror the appointment into Kova (0113) so the coach roster can say
  // "she has a call Thursday at 9:30" instead of leaving her looking like a
  // client who never got back to anyone. GHL stays the source of truth for
  // the slot itself; this is a copy of what it just confirmed.
  //
  // Deliberately best-effort: the appointment EXISTS on the calendar by the
  // time we get here, so a failed insert must never surface as a failed
  // booking -- that would send the member back to pick a second slot for a
  // call she has already got. Logged and swallowed instead.
  try {
    let appointmentId: string | null = null;
    try {
      const parsed = JSON.parse(bookBody);
      appointmentId = parsed?.id ?? parsed?.appointment?.id ?? parsed?.event?.id ?? null;
    } catch {
      // GHL answered 2xx with something we could not parse -- the booking
      // still happened, so record it without an id rather than not at all.
    }

    const { error: recordError } = await adminClient.schema("programming").from("nutrition_checkin_bookings").insert({
      user_id: caller.id,
      starts_at: startTime,
      ends_at: endTime,
      ghl_appointment_id: appointmentId,
      ghl_calendar_id: calendarId,
    });
    if (recordError) console.error("Booked in GHL but failed to record in Kova:", recordError);
  } catch (err) {
    console.error("Booked in GHL but failed to record in Kova:", err);
  }

  return new Response(JSON.stringify({ booked: true }), { status: 200, headers: jsonHeaders });
});
